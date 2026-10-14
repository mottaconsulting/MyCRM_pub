import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken, fetchCalendar, type GraphEvent } from "@/lib/graph";
import { formatMeetingTime } from "@/lib/date";

/**
 * Calendar backfill: pull real meetings from the owner's Outlook calendar and log
 * them onto the timeline of any contact who attended. Meetings reuse the
 * interactions table (type = 'meeting'); the event id lives in
 * graph_message_id so re-runs dedupe instead of duplicating.
 */

// Cap on attendees — above this it's a mass invite / all-hands, not a meeting
// worth logging against individual contacts.
const MAX_ATTENDEES = 15;

// Non-human / system invitees never worth suggesting as a contact.
const NOISE =
  /(no-?reply|do-?not-?reply|notifications?|newsletter|mailer|mailchimp|postmaster|bounce|unsubscribe|@calendly|@resource\.calendar|@group\.calendar\.google\.com|teamcalendar@|calendar@|invoices?@|updates?@)/i;

// Only suggest someone you've actually met more than once — one-off attendees
// (interviews, single intros, room invites) are mostly noise.
const MIN_SUGGEST_MEETINGS = 2;

// Free webmail — for a B2B CRM these are usually personal contacts, not new
// business prospects worth surfacing from the calendar.
const FREE_WEBMAIL = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.au", "outlook.com", "live.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.com.au", "aol.com",
  "bigpond.com", "bigpond.net.au", "optusnet.com.au", "proton.me",
]);

/** Graph returns naive UTC (no zone) under Prefer: outlook.timezone="UTC". */
function toIso(dt?: string): string | null {
  if (!dt) return null;
  const hasZone = /[Zz]|[+-]\d\d:?\d\d$/.test(dt);
  const d = new Date(hasZone ? dt : `${dt}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function meetingBody(ev: GraphEvent, startIso: string): string {
  const when = formatMeetingTime(startIso, toIso(ev.end?.dateTime) ?? undefined);
  const where = ev.location?.displayName?.trim() || "—";
  const who = (ev.attendees ?? [])
    .map((a) => a.emailAddress?.name || a.emailAddress?.address)
    .filter(Boolean)
    .join(", ");
  return [`When: ${when}`, `Where: ${where}`, who ? `Who: ${who}` : ""]
    .filter(Boolean)
    .join("\n");
}

export type CalendarBackfillResult = {
  events: number;
  meetingsLogged: number;
  contactsTouched: number;
  suggestionsAdded: number;
};

type UnknownAttendee = {
  name: string | null;
  count: number;
  first: string;
  last: string;
  upcoming: boolean; // has a future (booked) meeting → surface even if met once
  subjects: string[];
};

/**
 * Fetch calendar events in a window (default: 2 years back to 2 months ahead),
 * match attendees to existing contacts, and log a 'meeting' interaction on each
 * matched contact. Best-effort; safe to re-run (deduped on the event id).
 */
export async function calendarBackfillCore(
  supabase: SupabaseClient,
  tenantId: string,
  monthsBack = 24,
  monthsAhead = 2,
): Promise<CalendarBackfillResult> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + monthsAhead);

  const token = await getAccessToken(tenantId);
  const events = await fetchCalendar(
    token,
    start.toISOString(),
    end.toISOString(),
  );

  // Map every known email → contact id (a contact can have several).
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, emails, last_contact_at, last_meeting_at")
    .eq("tenant_id", tenantId);
  const emailToId = new Map<string, string>();
  const lastContact = new Map<string, string | null>();
  const lastMeeting = new Map<string, string | null>();
  for (const c of contacts ?? []) {
    lastContact.set(c.id, c.last_contact_at ?? null);
    lastMeeting.set(c.id, (c as { last_meeting_at?: string | null }).last_meeting_at ?? null);
    for (const e of (c.emails ?? []) as string[]) {
      if (e) emailToId.set(e.toLowerCase(), c.id);
    }
  }

  // The tenant owner's own address / domain — never suggest themselves or
  // colleagues on their own domain (internal, not new prospects to add).
  const { data: ownSettings } = await supabase
    .from("settings")
    .select("owner_email")
    .eq("tenant_id", tenantId)
    .single();
  const myEmails = new Set(
    [ownSettings?.owner_email ?? ""]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  const myDomains = new Set(
    [...myEmails].map((e) => e.split("@")[1]).filter(Boolean),
  );
  // Personal / non-business domains to keep out of suggestions (Scouts, school,
  // clubs, etc.) — configured per user via env, comma-separated.
  const excludeDomains = new Set(
    (process.env.SUGGEST_EXCLUDE_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );

  // Anyone already surfaced (any suggestion, any status) — don't re-suggest.
  const { data: existingSug } = await supabase
    .from("suggestions")
    .select("payload")
    .eq("tenant_id", tenantId);
  const seen = new Set<string>();
  for (const r of existingSug ?? []) {
    const e = String(
      (r.payload as { email?: string })?.email ?? "",
    ).toLowerCase();
    if (e) seen.add(e);
  }

  // Attendees who aren't contacts yet → new-contact suggestions.
  const unknown = new Map<string, UnknownAttendee>();

  const nowIso = now.toISOString();
  const rows: Record<string, unknown>[] = [];
  const touched = new Set<string>();
  // contact id → latest PAST meeting time, for bumping last_contact_at.
  const latestPast = new Map<string, string>();

  for (const ev of events) {
    if (ev.isCancelled) continue;
    if ((ev.subject ?? "").toLowerCase().startsWith("canceled:")) continue;
    const attendees = ev.attendees ?? [];
    if (attendees.length > MAX_ATTENDEES) continue;
    const startIso = toIso(ev.start?.dateTime);
    if (!startIso) continue;

    // Split attendees into known contacts (→ timeline) and strangers (→
    // suggestions). Both happen from the same pass.
    const matched = new Set<string>();
    for (const a of attendees) {
      const addr = a.emailAddress?.address?.toLowerCase();
      if (!addr || !addr.includes("@")) continue;
      const id = emailToId.get(addr);
      if (id) {
        matched.add(id);
        continue;
      }
      if (myEmails.has(addr) || seen.has(addr) || NOISE.test(addr)) continue;
      const dom = addr.split("@")[1] ?? "";
      // own org / free webmail / configured personal domains → not a prospect
      if (myDomains.has(dom) || FREE_WEBMAIL.has(dom) || excludeDomains.has(dom))
        continue;
      const cur = unknown.get(addr);
      const subject = ev.subject?.trim();
      if (cur) {
        cur.count++;
        if (startIso < cur.first) cur.first = startIso;
        if (startIso > cur.last) cur.last = startIso;
        if (startIso > nowIso) cur.upcoming = true;
        if (subject && cur.subjects.length < 3 && !cur.subjects.includes(subject))
          cur.subjects.push(subject);
      } else {
        unknown.set(addr, {
          name: a.emailAddress?.name || null,
          count: 1,
          first: startIso,
          last: startIso,
          upcoming: startIso > nowIso,
          subjects: subject ? [subject] : [],
        });
      }
    }
    if (matched.size === 0) continue;

    const body = meetingBody(ev, startIso);
    for (const id of matched) {
      rows.push({
        tenant_id: tenantId,
        contact_id: id,
        type: "meeting",
        occurred_at: startIso,
        subject: ev.subject ?? "Meeting",
        summary: null,
        body,
        web_link: ev.webLink ?? null,
        graph_message_id: ev.id,
      });
      touched.add(id);
      if (startIso <= nowIso) {
        const prev = latestPast.get(id);
        if (!prev || prev < startIso) latestPast.set(id, startIso);
      }
    }
  }

  if (rows.length) {
    // Chunk to keep the request payload sane.
    for (let i = 0; i < rows.length; i += 200) {
      await supabase
        .from("interactions")
        .upsert(rows.slice(i, i + 200), {
          onConflict: "contact_id,graph_message_id",
        });
    }
  }

  // Bump last_contact_at and last_meeting_at where a past meeting is more recent
  // than what's stored.
  for (const [id, when] of latestPast) {
    const patch: Record<string, string> = {};
    const curContact = lastContact.get(id) ?? null;
    if (!curContact || curContact < when) patch.last_contact_at = when;
    const curMeeting = lastMeeting.get(id) ?? null;
    if (!curMeeting || curMeeting < when) patch.last_meeting_at = when;
    if (Object.keys(patch).length) {
      await supabase.from("contacts").update(patch).eq("id", id);
    }
  }

  // Surface unfamiliar attendees as suggestions: anyone met more than once, OR
  // anyone you have a future meeting booked with (so new people are captured
  // before you meet them).
  let suggestionsAdded = 0;
  const sugRows = [...unknown.entries()]
    .filter(([, u]) => u.count >= MIN_SUGGEST_MEETINGS || u.upcoming)
    .map(([email, u]) => ({
    tenant_id: tenantId,
    type: "new_contact",
    source: "calendar",
    status: "pending" as const,
    payload: {
      name: u.name,
      email,
      emails: [email],
      domain: email.split("@")[1] ?? "",
      company_guess: null,
      thread_count: u.count, // reused as "met N times"
      first_seen: u.first,
      last_seen: u.last,
      sample_subjects: u.subjects,
      snippet: null,
    },
  }));
  if (sugRows.length) {
    const { error } = await supabase.from("suggestions").insert(sugRows);
    if (!error) suggestionsAdded = sugRows.length;
  }

  return {
    events: events.length,
    meetingsLogged: rows.length,
    contactsTouched: touched.size,
    suggestionsAdded,
  };
}
