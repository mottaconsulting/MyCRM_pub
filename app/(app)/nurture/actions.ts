"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geminiJson } from "@/lib/gemini";
import { searchWeb } from "@/lib/web-search";
import { contactName } from "@/lib/contacts";
import { ownerContext } from "@/lib/tenant";
import type { Contact, Interaction } from "@/lib/types";

const DRAFT_SCHEMA = {
  type: "OBJECT",
  properties: { subject: { type: "STRING" }, body: { type: "STRING" } },
  required: ["subject", "body"],
};

export type Draft = { subject: string; body: string };

/**
 * AI-draft a short, genuinely personal check-in email to a contact, grounded in
 * what the CRM knows about them and their recent history. Returns the draft or
 * an error string — never throws for a missing key.
 *
 * Pass `opts.guidance` to steer a redraft with an extra instruction (e.g. "make
 * it shorter", "mention the conference", "more formal"). Pass `opts.previous` so
 * the model revises that draft rather than starting from a blank page.
 */
export async function draftNurture(
  contactId: string,
  opts?: { guidance?: string; previous?: Draft },
): Promise<Draft | { error: string }> {
  const id = z.string().uuid().parse(contactId);
  const guidance = (opts?.guidance ?? "").trim().slice(0, 1000);
  const previous = opts?.previous;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single<Contact>();
  if (!c) return { error: "Contact not found." };
  const name = contactName(c);

  // Owner identity for the sign-off (per-tenant, not hard-coded).
  const owner = await ownerContext(supabase);
  const ownerName = owner?.ownerName || "the account owner";
  const ownerFirst = owner?.ownerFirstName || ownerName.split(" ")[0] || "";

  const { data: ints } = await supabase
    .from("interactions")
    .select("type, subject, summary, note, body, occurred_at")
    .eq("contact_id", id)
    .order("occurred_at", { ascending: false })
    .limit(12)
    .returns<
      Pick<
        Interaction,
        "type" | "subject" | "summary" | "note" | "body" | "occurred_at"
      >[]
    >();
  // Include subject + summary + any hand-written note — the summary/note is where
  // the substance (a project, a decision, a personal detail) usually lives. For
  // LinkedIn messages that substance is the message text itself (stored in body,
  // with no subject/summary), so fold that in too, direction-labelled.
  const recent = (ints ?? [])
    .map((i) => {
      const isLi = i.type === "linkedin_in" || i.type === "linkedin_out";
      const parts = [i.subject, i.summary, i.note];
      if (isLi && i.body) {
        const who = i.type === "linkedin_out" ? ownerFirst || ownerName : name;
        parts.push(`${who} on LinkedIn: "${i.body.replace(/\s+/g, " ").trim().slice(0, 240)}"`);
      }
      const detail = parts.filter(Boolean).join(" — ");
      return `- ${(i.occurred_at ?? "").slice(0, 10)} ${i.type}: ${detail || "(no detail)"}`;
    })
    .join("\n");

  // Ground the model in HOW LONG it's been, so it reconnects honestly instead
  // of writing as if the last conversation was recent.
  const last = c.last_contact_at;
  let gapLine: string;
  let longGap = false;
  if (last) {
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
    longGap = days > 180;
    const human =
      days >= 365
        ? `about ${Math.floor(days / 365)} year(s)`
        : days >= 60
          ? `about ${Math.floor(days / 30)} months`
          : `${days} days`;
    gapLine = `You last had contact on ${last.slice(0, 10)} — ${human} ago.`;
  } else {
    gapLine = `There is no recorded last-contact date; treat it as a long time.`;
    longGap = true;
  }

  const gapGuidance = longGap
    ? `This is a genuine reconnection after a LONG time. Acknowledge the gap ` +
      `naturally and warmly (e.g. "it's been far too long", "a few years now"). ` +
      `You may reference something from your past conversations, but frame it ` +
      `clearly as being from back then — NEVER write about old topics or events ` +
      `as if they happened recently, and don't reference holidays/"the break". ` +
      `Do not assume anything about their current role, projects, or life.\n\n`
    : ``;

  // Dig for a reason to reconnect from two angles: (1) recent signals — news,
  // posts, moves, launches in the last few months; (2) a broad profile pass —
  // who they are now, their company, notable work. Recent signals first so the
  // model reaches for a timely hook. Deduped by link. Empty if not configured.
  const q = `"${name}" ${c.company ?? ""}`.trim();
  const [signals, profile] = await Promise.all([
    searchWeb(
      `${q} (news OR announcement OR "new role" OR promoted OR launch OR podcast OR interview OR award OR post)`,
      5,
      "m3",
    ),
    searchWeb(q, 6),
  ]);
  const seenLinks = new Set<string>();
  const web = [...signals, ...profile]
    .filter((w) => {
      const k = w.link || w.title;
      if (!k || seenLinks.has(k)) return false;
      seenLinks.add(k);
      return true;
    })
    .slice(0, 8);
  const webBlock = web.length
    ? `Public web results about them (from a web search — some MAY be about a ` +
      `different person or out of date; only use a detail if it CLEARLY matches ` +
      `${name}${c.company ? ` at ${c.company}` : ""}, otherwise ignore it; NEVER ` +
      `invent or state anything you are unsure of):\n` +
      web.map((w, i) => `[${i + 1}] ${w.title} — ${w.snippet}`).join("\n") +
      "\n\n"
    : "";

  // Always ask about availability in the next two weeks — except over the
  // Christmas / holiday break (mid-Dec to mid-Jan), when that's tone-deaf.
  const nowD = new Date();
  const mm = nowD.getUTCMonth() + 1;
  const dd = nowD.getUTCDate();
  const isHoliday = (mm === 12 && dd >= 15) || (mm === 1 && dd <= 15);
  const closing = isHoliday
    ? `It's the Christmas / holiday break — keep it seasonal and warm, wish them ` +
      `a good break, and suggest reconnecting in the new year. Do NOT ask about ` +
      `meeting in the next two weeks.`
    : `End by asking specifically about their availability over the next two ` +
      `weeks — phrase it naturally (e.g. "What does your availability look like ` +
      `over the next couple of weeks?").`;

  const prompt =
    `Write a short, warm, genuinely personal reconnection email from ${ownerName} to ${name}` +
    `${c.company ? ` at ${c.company}` : ""}. This is relationship nurture, NOT a sales pitch.\n\n` +
    `${gapLine}\n\n` +
    gapGuidance +
    `What ${ownerFirst || ownerName} knows about them:\n${c.ai_summary || c.notes || "(limited context)"}\n\n` +
    `History (most recent first, with dates — note these may be old):\n${recent || "(none logged)"}\n\n` +
    webBlock +
    `YOUR JOB — find the hook first. Before writing, scan everything above (what ` +
    `${ownerFirst || ownerName} knows, the history, and the web results) and pick the SINGLE most ` +
    `specific, genuine reason to reach out right now: something they were building ` +
    `or wrestling with, a shared moment or in-joke, a recent post / piece of news / ` +
    `role move / launch, a project or interest of theirs. Build the whole email ` +
    `around that ONE concrete thing and name it explicitly, so this email could ` +
    `only have been written to ${name} and to nobody else. A generic "just ` +
    `checking in, hope all is well" note is a failure.\n\n` +
    `If — and only if — there is genuinely no specific hook anywhere in the ` +
    `material, do NOT fabricate one: write an honest, warm "you crossed my mind ` +
    `and it's been too long, I'd love to properly catch up" note. That is the last ` +
    `resort, not the default.\n\n` +
    `Rules: 3–5 sentences, natural and human — write like ${ownerFirst || ownerName} talks to a person ` +
    `they like, not like marketing. Lead with the specific hook, not with ` +
    `pleasantries. Never quote uncertain details and never fabricate; reference ` +
    `past specifics only if placed correctly in time. No corporate filler, no ` +
    `"hope this finds you well", no "I hope you're doing well". ${closing} Sign ` +
    `off simply as "${ownerFirst || ownerName}".\n\n` +
    `FORMATTING (strict): Begin the body with "Hi ${c.first_name || name.split(" ")[0]}," ` +
    `on its own line, then a blank line. Break the body into 2–3 short paragraphs ` +
    `separated by a blank line — never one dense block. Do NOT use em dashes (—) ` +
    `or en dashes (–) ANYWHERE; use a comma, a full stop, or a new sentence ` +
    `instead. Return a subject (specific, not "Catching up") and body.`;

  // Redraft: hand the model its current draft plus the owner's steering instruction,
  // and let that instruction override the defaults above where they conflict
  // (e.g. he asks for shorter, or to drop the availability ask) — while keeping
  // everything factual and never inventing details.
  const revisionBlock =
    guidance || previous
      ? `\n\n--- REDRAFT ---\n` +
        (previous
          ? `Current draft to revise:\nSubject: ${previous.subject}\n${previous.body}\n\n`
          : "") +
        (guidance
          ? `Revise it following the instruction below. Treat this instruction ` +
            `as the priority — it overrides the general guidance above wherever ` +
            `they conflict — but never invent facts to satisfy it:\n"${guidance}"\n` +
            `Return the revised subject and body.`
          : `Write a fresh alternative that takes a different angle from the draft above.`)
      : "";

  let out: Draft | null = null;
  try {
    out = await geminiJson<Draft>(prompt + revisionBlock, DRAFT_SCHEMA);
  } catch {
    return { error: "The AI service returned an error — please try again." };
  }
  if (!out || !out.body) {
    return { error: "AI draft unavailable — check the Gemini key/billing." };
  }
  // Belt-and-braces: the owner never wants em/en dashes in drafted emails, even if
  // the model slips one in. A spaced dash becomes a comma; a tight one a hyphen.
  const noDashes = (s: string) =>
    s.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
  return { subject: noDashes(out.subject), body: noDashes(out.body) };
}

/** Record that a personal nurture note was sent (resets the cadence + logs it). */
export async function markNurtured(contactId: string) {
  const id = z.string().uuid().parse(contactId);
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("contacts")
    .update({ last_nurtured_at: now, last_contact_at: now })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("interactions").insert({
    contact_id: id,
    type: "note",
    summary: "Sent a personal note",
    occurred_at: now,
  });
  revalidatePath("/nurture");
  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
}
