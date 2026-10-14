import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccessToken,
  fetchCalendar,
  fetchMeetingTranscript,
  type GraphEvent,
} from "@/lib/graph";
import { geminiJson } from "@/lib/gemini";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    action_items: { type: "ARRAY", items: { type: "STRING" } },
    suggested_followup: { type: "STRING", nullable: true },
  },
  required: ["summary"],
};
type Out = {
  summary: string;
  action_items?: string[];
  suggested_followup?: string | null;
};

/**
 * Pull Teams meeting transcripts for recent past online meetings that involve a
 * known contact and haven't been summarised yet, summarise each with Gemini, and
 * write the summary + action items + full transcript onto every attendee's
 * meeting timeline entry. Idempotent: a meeting whose interaction already has a
 * summary is skipped, so this is cheap to run on the 15-minute cron. Entirely
 * best-effort — if Microsoft isn't connected or the transcript scope hasn't been
 * consented yet, it just reports 0.
 */
export async function syncTeamsTranscriptsCore(
  supabase: SupabaseClient,
  tenantId: string,
  daysBack = 14,
): Promise<{ meetingsChecked: number; summarised: number; error?: string }> {
  let token: string;
  try {
    token = await getAccessToken(tenantId);
  } catch {
    return { meetingsChecked: 0, summarised: 0, error: "not_connected" };
  }

  const now = new Date();
  const startISO = new Date(now.getTime() - daysBack * 86400000).toISOString();
  const nowISO = now.toISOString();
  let events: GraphEvent[];
  try {
    events = await fetchCalendar(token, startISO, nowISO);
  } catch (e) {
    return {
      meetingsChecked: 0,
      summarised: 0,
      error: e instanceof Error ? e.message : "calendar_failed",
    };
  }

  // email → contact id
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, emails")
    .eq("tenant_id", tenantId);
  const emailToId = new Map<string, string>();
  for (const c of contacts ?? []) {
    for (const e of (c.emails ?? []) as string[]) {
      if (e) emailToId.set(String(e).toLowerCase(), c.id);
    }
  }

  // Past online meetings that involve a known contact.
  const candidates = events.filter((ev) => {
    const s = ev.start?.dateTime;
    if (!s || s > nowISO || ev.isCancelled) return false;
    if (!ev.isOnlineMeeting || !ev.onlineMeeting?.joinUrl) return false;
    return (ev.attendees ?? []).some((a) => {
      const addr = a.emailAddress?.address?.toLowerCase();
      return addr ? emailToId.has(addr) : false;
    });
  });
  if (!candidates.length) return { meetingsChecked: 0, summarised: 0 };

  // Which of these already have a summary (i.e. already processed)?
  const ids = candidates.map((e) => e.id);
  const { data: existing } = await supabase
    .from("interactions")
    .select("graph_message_id, summary")
    .eq("tenant_id", tenantId)
    .eq("type", "meeting")
    .in("graph_message_id", ids);
  const done = new Set(
    (existing ?? [])
      .filter((r) => (r.summary as string | null)?.trim())
      .map((r) => r.graph_message_id as string),
  );

  let summarised = 0;
  for (const ev of candidates) {
    if (done.has(ev.id)) continue;
    const transcript = await fetchMeetingTranscript(token, ev.onlineMeeting!.joinUrl!);
    if (!transcript) continue;

    const prompt =
      `Summarise this Microsoft Teams meeting transcript for a CRM record. ` +
      `Meeting subject: "${ev.subject ?? "Meeting"}".\n\n` +
      `Return:\n` +
      `- "summary": 2 to 4 sentences on what was discussed and any decisions or outcomes.\n` +
      `- "action_items": clear commitments or next steps (say who owes what); empty if none.\n` +
      `- "suggested_followup": a short phrase if a follow-up is implied (e.g. "send proposal in 2 weeks"), else null.\n` +
      `Base everything ONLY on the transcript; do not invent anything.\n\n` +
      `TRANSCRIPT:\n${transcript}`;

    let out: Out | null = null;
    try {
      out = await geminiJson<Out>(prompt, SCHEMA);
    } catch {
      out = null;
    }
    if (!out?.summary) continue;

    // Rebuild the shared meeting body (all attendees share it) with the summary,
    // action items and full transcript appended — trimming any prior append.
    const { data: rows } = await supabase
      .from("interactions")
      .select("body")
      .eq("tenant_id", tenantId)
      .eq("type", "meeting")
      .eq("graph_message_id", ev.id)
      .limit(1);
    const base = (rows?.[0]?.body ?? "").split("\n\n— Meeting summary —")[0];
    const actions = out.action_items?.length
      ? `\n\nAction items:\n${out.action_items.map((a) => `- ${a}`).join("\n")}`
      : "";
    const followup = out.suggested_followup
      ? `\n\nSuggested follow-up: ${out.suggested_followup}`
      : "";
    const newBody =
      `${base}\n\n— Meeting summary —\n${out.summary}${actions}${followup}` +
      `\n\n— Transcript —\n${transcript.slice(0, 8000)}`;

    const { error } = await supabase
      .from("interactions")
      .update({ summary: out.summary, body: newBody })
      .eq("tenant_id", tenantId)
      .eq("type", "meeting")
      .eq("graph_message_id", ev.id);
    if (!error) summarised++;
  }

  return { meetingsChecked: candidates.length, summarised };
}
