"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geminiJson } from "@/lib/gemini";
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
 * Draft ONE personalised campaign email for a contact: weaves the campaign brief
 * together with what the CRM knows about this person (their summary, interests
 * and recent history) so every recipient gets a tailored version. Australian
 * English + no dashes are enforced globally in the Gemini helper.
 */
export async function draftCampaignEmail(
  contactId: string,
  brief: string,
  opts?: { guidance?: string; previous?: Draft },
): Promise<Draft | { error: string }> {
  const id = z.string().uuid().parse(contactId);
  const theBrief = brief.trim().slice(0, 2000);
  if (!theBrief) return { error: "Add a campaign brief first." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single<Contact>();
  if (!c) return { error: "Contact not found." };

  const { data: ints } = await supabase
    .from("interactions")
    .select("type, subject, summary, note, occurred_at")
    .eq("contact_id", id)
    .order("occurred_at", { ascending: false })
    .limit(6)
    .returns<
      Pick<Interaction, "type" | "subject" | "summary" | "note" | "occurred_at">[]
    >();
  const recent = (ints ?? [])
    .map((i) => {
      const detail = [i.subject, i.summary, i.note].filter(Boolean).join(" — ");
      return `- ${(i.occurred_at ?? "").slice(0, 10)} ${i.type}: ${detail || "(no detail)"}`;
    })
    .join("\n");

  const name = contactName(c);
  const firstName = c.first_name || name.split(" ")[0];
  const guidance = (opts?.guidance ?? "").trim().slice(0, 1000);
  const previous = opts?.previous;

  // Owner identity for the sign-off (per-tenant, not hard-coded).
  const owner = await ownerContext(supabase);
  const ownerName = owner?.ownerName || "the account owner";
  const ownerFirst = owner?.ownerFirstName || ownerName.split(" ")[0] || "";

  const prompt =
    `Write a PERSONALISED campaign email from ${ownerName} to ${name}` +
    `${c.company ? ` at ${c.company}` : ""}.\n\n` +
    `CAMPAIGN BRIEF (the goal, message, offer and call to action for this send):\n${theBrief}\n\n` +
    `WHO THIS PERSON IS:\n${c.ai_summary || c.notes || "(limited context)"}\n` +
    (c.interests?.length ? `Their interests: ${c.interests.join(", ")}.\n` : "") +
    `Recent history with ${ownerFirst || ownerName}:\n${recent || "(none logged)"}\n\n` +
    `Tailor the email to THIS person: open with "Hi ${firstName}," on its own line, ` +
    `then connect the campaign message to what is actually relevant to them ` +
    `(their interests and your shared history first), and make the call to action ` +
    `clear. Warm, human and concise: 2-3 short paragraphs separated by a blank ` +
    `line. Never fabricate specifics you do not have; no corporate filler, no ` +
    `"hope this finds you well". Sign off simply as "${ownerFirst || ownerName}".` +
    (guidance
      ? `\n\n--- REDRAFT ---\n` +
        (previous
          ? `Current draft:\nSubject: ${previous.subject}\n${previous.body}\n\n`
          : "") +
        `Revise it following this instruction, which takes priority: "${guidance}"`
      : "") +
    `\n\nReturn a subject (specific to this person and the campaign) and body.`;

  let out: Draft | null = null;
  try {
    out = await geminiJson<Draft>(prompt, DRAFT_SCHEMA);
  } catch {
    return { error: "The AI service returned an error — please try again." };
  }
  if (!out || !out.body) {
    return { error: "AI draft unavailable — check the Gemini key/billing." };
  }
  const noDashes = (s: string) =>
    s.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
  return { subject: noDashes(out.subject), body: noDashes(out.body) };
}

/** Log that a campaign email was sent to a contact (bumps their last-contact). */
export async function markCampaignSent(contactId: string) {
  const id = z.string().uuid().parse(contactId);
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("contacts")
    .update({ last_contact_at: now, last_nurtured_at: now })
    .eq("id", id);
  await supabase.from("interactions").insert({
    contact_id: id,
    type: "note",
    summary: "Sent campaign email",
    occurred_at: now,
  });
  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
}
