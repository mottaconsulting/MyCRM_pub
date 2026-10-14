import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccessToken,
  fetchThreadWith,
  type GraphMessageBody,
} from "@/lib/graph";
import { geminiJson } from "@/lib/gemini";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    company: { type: "STRING", nullable: true },
    role: { type: "STRING", nullable: true },
    phone: { type: "STRING", nullable: true },
    suggested_followup: { type: "STRING", nullable: true },
    emails: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          i: { type: "INTEGER" },
          summary: { type: "STRING" },
        },
        required: ["i", "summary"],
      },
    },
  },
  required: ["summary"],
};

type Extract = {
  summary: string;
  company?: string | null;
  role?: string | null;
  phone?: string | null;
  suggested_followup?: string | null;
  emails?: { i: number; summary: string }[];
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function plainBody(m: GraphMessageBody): string {
  const raw = m.body?.content ?? m.bodyPreview ?? "";
  return m.body?.contentType?.toLowerCase() === "html"
    ? stripHtml(raw)
    : raw.trim();
}

function bodyText(m: GraphMessageBody): string {
  const text = plainBody(m);
  if (text.length <= 900) return text;
  // Keep the head (what the email is about) AND the tail (where the signature —
  // and the phone number — lives), so signatures aren't truncated away.
  return `${text.slice(0, 600)} … ${text.slice(-300)}`;
}

// AU phone extraction — mobiles (04xx xxx xxx) and landlines ((0x) xxxx xxxx),
// including +61 forms. Used to hand Gemini concrete candidates from the contact's
// OWN emails so it doesn't have to spot them in truncated free text.
function normaliseAuPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("610")) d = "0" + d.slice(3);
  else if (d.startsWith("61")) d = "0" + d.slice(2);
  if (d.length !== 10 || d[0] !== "0" || !"234789".includes(d[1])) return null;
  return d;
}

function formatAuPhone(d: string): string {
  return d[1] === "4"
    ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` // mobile
    : `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`; // landline
}

function extractAuPhones(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\+?61[\s.\-]?|\b0)[\d\s().\-]{7,13}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = normaliseAuPhone(m[0]);
    if (n) out.add(n);
  }
  return [...out];
}

// Longer, stored on the interaction so the email can be read from the timeline.
function fullBody(m: GraphMessageBody): string {
  const raw = m.body?.content ?? m.bodyPreview ?? "";
  const text =
    m.body?.contentType?.toLowerCase() === "html" ? stripHtml(raw) : raw.trim();
  return text.slice(0, 6000);
}

/**
 * Enrich a freshly-created contact from their email history via Gemini:
 *  - writes a relationship summary to notes and fills empty company/role/phone
 *    (the CONTACT's own signature only — never the owner's),
 *  - backfills the timeline with one interaction per email (direction, date,
 *    subject + a one-line AI summary), deduped on graph_message_id.
 * Fully best-effort — Microsoft not connected / no Gemini key / API errors
 * never break the accept, and email bodies are never logged.
 */
export async function enrichContactFromEmail(
  supabase: SupabaseClient,
  contactId: string,
  email: string,
  name: string,
  current: { company: string | null; role: string | null; phone: string | null },
  ctx: {
    tenantId: string;
    ownerEmail: string;
    ownerName: string;
    accessToken?: string;
  },
): Promise<void> {
  const me = (ctx.ownerEmail ?? "").trim().toLowerCase();
  const owner = ctx.ownerName || "the account owner";
  const target = email.toLowerCase();

  try {
    const token = ctx.accessToken ?? (await getAccessToken(ctx.tenantId));
    const msgs = await fetchThreadWith(token, email);
    if (!msgs.length) {
      // Mark attempted so the enrichment queue drains instead of re-picking
      // this contact forever (ai_summary stays null — nothing to summarise).
      await supabase
        .from("contacts")
        .update({ ai_summary_at: new Date().toISOString() })
        .eq("id", contactId);
      return;
    }

    const corpus = msgs
      .map((m, idx) => {
        const from = (m.from?.emailAddress?.address ?? "").toLowerCase();
        const dir = from === target ? `them → ${owner}` : `${owner} → them`;
        const when = (m.receivedDateTime ?? "").slice(0, 10);
        return `[${idx + 1}] (${dir}, ${when}) Subject: ${m.subject ?? "(none)"}\n${bodyText(m)}`;
      })
      .join("\n\n---\n\n")
      .slice(0, 12000);

    // Phone candidates seen in the contact's OWN emails (them → the owner), where
    // their signature lives. Handed to Gemini as concrete options so it doesn't
    // have to spot a number in truncated text — it just picks their own.
    const phoneCandidates = [
      ...new Set(
        msgs
          .filter((m) => (m.from?.emailAddress?.address ?? "").toLowerCase() === target)
          .flatMap((m) => extractAuPhones(plainBody(m))),
      ),
    ]
      .slice(0, 12)
      .map(formatAuPhone);
    const phoneHint = phoneCandidates.length
      ? `\nPhone numbers detected in ${name}'s own emails (pick the one that is ` +
        `clearly THEIR personal mobile or direct line from their signature — ` +
        `ignore any that belong to a colleague, an office switchboard quoted in a ` +
        `thread, or ${owner}; null if none clearly theirs): ${phoneCandidates.join(", ")}.\n`
      : "";

    const prompt =
      `You maintain CRM notes for ${owner} <${me}>. Below are ${msgs.length} emails between ${owner} and ${name} <${email}>, each numbered [n]. Return:\n` +
      `1) "summary": 1–3 sentences on who ${name} is and the current state of the relationship / last thing discussed or agreed.\n` +
      `2) "company"/"role"/"phone": ${name}'s OWN details from THEIR email signature only. NEVER extract ${owner}'s details (their address is ${me}) — ignore their signature and any quoted/forwarded signatures. null if not clearly the contact's own. For "phone", prefer their mobile/direct line; return it as they wrote it.${phoneHint}` +
      `3) "suggested_followup": short phrase like "in 2 weeks" if implied, else null.\n` +
      `4) "emails": for each numbered email, {"i": <the number>, "summary": "<one sentence>"}.\n` +
      `Do not invent anything.\n\nEMAILS:\n${corpus}`;

    let out: Extract | null = null;
    try {
      out = await geminiJson<Extract>(prompt, SCHEMA);
    } catch (e) {
      console.error("gemini failed:", e instanceof Error ? e.message : e);
    }

    // Per-email timeline (works even if Gemini failed — summaries just null).
    const perEmail = new Map<number, string>(
      (out?.emails ?? []).map((e) => [e.i, e.summary]),
    );
    const rows = msgs.map((m, idx) => {
      const from = (m.from?.emailAddress?.address ?? "").toLowerCase();
      return {
        tenant_id: ctx.tenantId,
        contact_id: contactId,
        type: from === target ? "email_in" : "email_out",
        occurred_at: m.receivedDateTime ?? new Date().toISOString(),
        subject: m.subject ?? null,
        summary: perEmail.get(idx + 1) ?? null,
        body: fullBody(m),
        web_link: m.webLink ?? null,
        graph_message_id: m.id,
      };
    });
    await supabase
      .from("interactions")
      .upsert(rows, { onConflict: "contact_id,graph_message_id" });

    // Keep last_contact_at as the most recent email so the follow-up queue works.
    const dates = msgs
      .map((m) => m.receivedDateTime)
      .filter((d): d is string => Boolean(d));
    if (dates.length) {
      const latest = dates.sort().slice(-1)[0];
      const { data: cur } = await supabase
        .from("contacts")
        .select("last_contact_at")
        .eq("id", contactId)
        .single();
      if (!cur?.last_contact_at || cur.last_contact_at < latest) {
        await supabase
          .from("contacts")
          .update({ last_contact_at: latest })
          .eq("id", contactId);
      }
    }

    // Relationship summary + signature backfill onto the contact. Writes the
    // AI-owned ai_summary field ONLY — never the user's notes. Empty fields
    // fill silently; a DIFFERENT value becomes a pending update to approve.
    // ai_summary_at is ALWAYS set (marks the contact enriched-attempted so the
    // backfill queue drains even when Gemini returned nothing).
    const updates: Record<string, unknown> = {
      ai_summary_at: new Date().toISOString(),
    };
    if (out?.summary) {
      const followup = out.suggested_followup
        ? `\nSuggested follow-up: ${out.suggested_followup}.`
        : "";
      updates.ai_summary = `${out.summary}${followup}`;
    }
    const proposals: {
      tenant_id: string;
      contact_id: string;
      field: string;
      current_value: string;
      suggested_value: string;
      evidence: string;
    }[] = [];
    if (out) {
      const norm = (field: string, s: string) =>
        field === "phone" ? s.replace(/\D/g, "") : s.trim().toLowerCase();
      const consider = (
        field: "company" | "role" | "phone",
        cur: string | null,
        val: string | null | undefined,
      ) => {
        const v = (val ?? "").trim();
        if (!v) return;
        const c = (cur ?? "").trim();
        if (!c) {
          updates[field] = v; // empty → fill silently
          return;
        }
        if (norm(field, c) === norm(field, v)) return; // unchanged
        proposals.push({
          tenant_id: ctx.tenantId,
          contact_id: contactId,
          field,
          current_value: c,
          suggested_value: v,
          evidence: "Email signature",
        });
      };
      consider("company", current.company, out.company);
      consider("role", current.role, out.role);
      consider("phone", current.phone, out.phone);
    }

    await supabase.from("contacts").update(updates).eq("id", contactId);
    if (proposals.length) {
      await supabase
        .from("contact_updates")
        .upsert(proposals, {
          onConflict: "contact_id,field,suggested_value",
          ignoreDuplicates: true,
        });
    }
  } catch (e) {
    console.error(
      "enrichContactFromEmail failed:",
      e instanceof Error ? e.message : e,
    );
  }
}
