"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmails, normalizeTags, deriveWebsite } from "@/lib/contacts";
import { searchLinkedinUrl } from "@/lib/linkedin-search";
import { todayInMelbourne, addDays, addMonths } from "@/lib/date";
import { enrichContactFromEmail } from "@/lib/enrich";
import { kickBackgroundEnrich } from "@/lib/enrich-kick";
import { parseLinkedinCsv, normalizeLinkedin } from "@/lib/linkedin-csv";
import { ownerContext } from "@/lib/tenant";

const temperature = z.enum(["hot", "warm", "cold"]);
const pipelineStage = z.enum([
  "none",
  "lead",
  "in_discussion",
  "proposal",
  "won",
  "dormant",
]);

/** Ensure none of `emails` already belongs to a *different* contact. */
async function assertEmailsFree(
  supabase: Awaited<ReturnType<typeof createClient>>,
  emails: string[],
  excludeId?: string,
): Promise<void> {
  if (emails.length === 0) return;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, emails")
    .overlaps("emails", emails);
  if (error) throw new Error(error.message);
  const clash = (data ?? []).find((c) => c.id !== excludeId);
  if (clash) {
    throw new Error("One of those emails already belongs to another contact.");
  }
}

const createSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().optional(),
  emails: z.string().optional(),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  role: z.string().trim().optional(),
  linkedin_url: z.string().trim().optional(),
});

export async function createContact(formData: FormData) {
  const parsed = createSchema.parse(Object.fromEntries(formData));
  const emails = normalizeEmails(parsed.emails);

  const supabase = await createClient();
  await assertEmailsFree(supabase, emails);

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      first_name: parsed.first_name,
      last_name: parsed.last_name || null,
      emails,
      phone: parsed.phone || null,
      phones: parsed.phone ? [parsed.phone] : [],
      company: parsed.company || null,
      role: parsed.role || null,
      linkedin_url: parsed.linkedin_url || null,
      website: deriveWebsite(emails),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/contacts");
  redirect(`/contacts/${data.id}`);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().nullable().optional(),
  emails: z.string().optional(),
  phone: z.string().trim().nullable().optional(),
  phones: z.string().optional(),
  company: z.string().trim().nullable().optional(),
  role: z.string().trim().nullable().optional(),
  tags: z.string().optional(),
  interests: z.string().optional(),
  temperature: temperature.optional(),
  pipeline_stage: pipelineStage.optional(),
  next_followup_at: z.string().nullable().optional(),
  followup_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  linkedin_url: z.string().trim().nullable().optional(),
  website: z.string().trim().nullable().optional(),
  warning: z.string().trim().nullable().optional(),
});

/**
 * Look up a likely LinkedIn profile URL for a contact via Google search.
 * Returns a candidate (or null) for the user to verify — does not save it.
 */
export async function suggestLinkedin(
  contactId: string,
): Promise<{ url: string | null } | { error: string }> {
  const id = z.string().uuid().parse(contactId);
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contacts")
    .select("first_name, last_name, company")
    .eq("id", id)
    .single();
  if (!c) return { error: "Contact not found." };
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  try {
    const url = await searchLinkedinUrl(name, c.company ?? null);
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Search failed." };
  }
}

/**
 * Bulk Auto-find: run the LinkedIn search for up to `limit` contacts missing a
 * URL and apply any confident hit. Quota-aware — each run does at most `limit`
 * Serper searches, so you control consumption. Returns what it applied + how
 * many still lack a URL.
 */
export async function autoFindLinkedinBatch(limit = 20): Promise<{
  processed: number;
  applied: { id: string; name: string; url: string }[];
  remaining: number;
  error?: string;
}> {
  const n = Math.min(Math.max(1, limit), 30);
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, company")
    .eq("archived", false)
    .is("linkedin_url", null)
    .order("first_name")
    .limit(n);

  const applied: { id: string; name: string; url: string }[] = [];
  for (const c of contacts ?? []) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    let url: string | null = null;
    try {
      url = await searchLinkedinUrl(name, c.company ?? null);
    } catch (e) {
      // Stop and surface the API error (e.g. bad key) with what we managed.
      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .is("linkedin_url", null);
      return {
        processed: applied.length,
        applied,
        remaining: count ?? 0,
        error: e instanceof Error ? e.message : "Search failed.",
      };
    }
    if (url) {
      await supabase.from("contacts").update({ linkedin_url: url }).eq("id", c.id);
      applied.push({ id: c.id, name, url });
    }
  }

  const { count } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("archived", false)
    .is("linkedin_url", null);
  revalidatePath("/linkedin");
  revalidatePath("/contacts");
  return {
    processed: (contacts ?? []).length,
    applied,
    remaining: count ?? 0,
  };
}

/** Save a contact's LinkedIn URL programmatically (from auto-find). */
export async function setLinkedinUrl(id: string, url: string) {
  const uid = z.string().uuid().parse(id);
  const u = url.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ linkedin_url: u || null })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  revalidatePath("/linkedin");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${uid}`);
}

/** Save (or clear) a contact's LinkedIn URL — used by the match view. */
export async function setLinkedin(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const raw = String(formData.get("linkedin_url") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ linkedin_url: raw || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
  revalidatePath("/linkedin");
  revalidatePath(`/contacts/${id}`);
}

/** Inline field update from the contact detail page. */
export async function updateContact(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = updateSchema.parse(raw);
  const { id, emails, phones, tags, interests, ...rest } = parsed;

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    patch[k] = v === "" ? null : v;
  }
  if (interests !== undefined) {
    patch.interests = [
      ...new Set(
        interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }
  if (emails !== undefined) patch.emails = normalizeEmails(emails);
  if (phones !== undefined) {
    // Dedupe on digits so "0412 345 678" and "0412345678" don't both survive.
    const seen = new Set<string>();
    const list = phones
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => {
        const key = p.replace(/\D/g, "") || p;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    patch.phones = list;
    patch.phone = list[0] ?? null; // keep the single field as the primary
  }
  if (tags !== undefined) patch.tags = normalizeTags(tags);
  // Auto-fill website from the email domain when it's still blank.
  if (Array.isArray(patch.emails) && !patch.website) {
    patch.website = deriveWebsite(patch.emails as string[]);
  }

  const supabase = await createClient();
  if (Array.isArray(patch.emails)) {
    await assertEmailsFree(supabase, patch.emails as string[], id);
  }

  const { error } = await supabase.from("contacts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  revalidatePath("/");
}

/** Inline temperature change from the contacts list. */
export async function setContactTemperature(id: string, value: string) {
  const uid = z.string().uuid().parse(id);
  const t = temperature.parse(value);
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ temperature: t })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  // Deliberately NOT revalidating /contacts — the pill updates optimistically,
  // and revalidating would re-render the whole list and reset scroll. The
  // dashboard is a different route, safe to refresh for its Hot-leads card.
  revalidatePath("/");
}

/**
 * Save the owner's own note on a single timeline item (esp. meetings). Empty
 * clears it. Returns nothing — the contact page revalidates.
 */
export async function updateInteractionNote(id: string, note: string) {
  const uid = z.string().uuid().parse(id);
  const n = note.trim();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interactions")
    .update({ note: n || null })
    .eq("id", uid)
    .select("contact_id")
    .single();
  if (error) throw new Error(error.message);
  if (data?.contact_id) revalidatePath(`/contacts/${data.contact_id}`);
  revalidatePath("/");
}

/**
 * Schedule a follow-up for a contact after a meeting and mark that meeting
 * reviewed (so it drops off the dashboard Recent-meetings list). `when` is a
 * period ("1w" | "1m" | "3m") or a specific YYYY-MM-DD date.
 */
export async function setMeetingFollowup(
  interactionId: string,
  contactId: string,
  when: string,
  reason: string,
) {
  const iid = z.string().uuid().parse(interactionId);
  const cid = z.string().uuid().parse(contactId);
  const today = todayInMelbourne();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(when)
    ? when
    : when === "1w"
      ? addDays(today, 7)
      : when === "3m"
        ? addMonths(today, 3)
        : addMonths(today, 1);

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      next_followup_at: date,
      followup_reason: reason.trim().slice(0, 200) || "Follow up",
    })
    .eq("id", cid);
  if (error) throw new Error(error.message);
  await supabase
    .from("interactions")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", iid);
  revalidatePath("/");
  revalidatePath(`/contacts/${cid}`);
}

/** Mark a meeting reviewed (dismiss it from Recent meetings) — no follow-up. */
export async function dismissMeetingReview(interactionId: string) {
  const iid = z.string().uuid().parse(interactionId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("interactions")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", iid);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/**
 * A meeting can be logged against several attendee-contacts (one interaction
 * each). These act on the whole set at once so a multi-person meeting is one
 * item: the note lands on every participant's timeline, and follow-up/dismiss
 * cover them all.
 */
export async function saveMeetingNoteAll(
  interactionIds: string[],
  note: string,
) {
  const ids = z.array(z.string().uuid()).min(1).parse(interactionIds);
  const n = note.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("interactions")
    .update({ note: n || null })
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function dismissMeetingAll(interactionIds: string[]) {
  const ids = z.array(z.string().uuid()).min(1).parse(interactionIds);
  const supabase = await createClient();
  const { error } = await supabase
    .from("interactions")
    .update({ reviewed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function setMeetingFollowupAll(
  interactionIds: string[],
  contactIds: string[],
  when: string,
  reason: string,
) {
  // interactionIds is validated but deliberately NOT marked reviewed here — the
  // meeting stays on the Recent list showing a "follow-up saved" banner so it's
  // clear it worked; the explicit Dismiss button is what clears it from the list.
  z.array(z.string().uuid()).min(1).parse(interactionIds);
  const cids = z.array(z.string().uuid()).min(1).parse(contactIds);
  const today = todayInMelbourne();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(when)
    ? when
    : when === "1w"
      ? addDays(today, 7)
      : when === "3m"
        ? addMonths(today, 3)
        : addMonths(today, 1);
  const r = reason.trim().slice(0, 200) || "Follow up";
  const supabase = await createClient();
  for (const cid of cids) {
    await supabase
      .from("contacts")
      .update({ next_followup_at: date, followup_reason: r })
      .eq("id", cid);
  }
  revalidatePath("/");
}

/** Inline pipeline-stage change from the contacts list. */
export async function setContactStage(id: string, value: string) {
  const uid = z.string().uuid().parse(id);
  const s = pipelineStage.parse(value);
  const supabase = await createClient();
  // Heat only exists alongside a pipeline stage. Removing the stage resets the
  // heat to the default so it doesn't linger invisibly on a stage-less contact.
  const patch =
    s === "none"
      ? { pipeline_stage: s, temperature: "warm" as const }
      : { pipeline_stage: s };
  const { error } = await supabase.from("contacts").update(patch).eq("id", uid);
  if (error) throw new Error(error.message);
  // Not revalidating /contacts (see setContactTemperature) — avoids a full-list
  // re-render / scroll reset on an inline pill change.
  revalidatePath("/");
}

/** Schedule / update a follow-up for a contact. */
export async function scheduleFollowup(id: string, date: string, reason: string) {
  const uid = z.string().uuid().parse(id);
  const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").parse(date);
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ next_followup_at: d, followup_reason: reason.trim() || null })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${uid}`);
}

/** One-click flag: schedule a follow-up for today so it shows in the queue now. */
export async function flagFollowup(id: string) {
  const uid = z.string().uuid().parse(id);
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contacts")
    .select("followup_reason")
    .eq("id", uid)
    .single();
  const { error } = await supabase
    .from("contacts")
    .update({
      next_followup_at: todayInMelbourne(),
      followup_reason: c?.followup_reason || "Follow up",
    })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${uid}`);
}

/** Clear a scheduled follow-up. */
export async function clearFollowup(id: string) {
  const uid = z.string().uuid().parse(id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ next_followup_at: null, followup_reason: null })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${uid}`);
}

/**
 * Re-run AI enrichment for an existing contact: backfills the per-email
 * timeline, (re)generates the AI summary, fills empty fields and last_contact.
 * Use this to bring contacts accepted before enrichment existed up to date.
 */
export async function refreshEnrichment(id: string) {
  const uid = z.string().uuid().parse(id);
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("contacts")
    .select("emails, first_name, last_name, company, role, phone")
    .eq("id", uid)
    .single();
  if (error) throw new Error(error.message);
  const email = (c.emails as string[] | null)?.[0];
  if (!email) return;
  const ctx = await ownerContext(supabase);
  if (!ctx) return;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  await enrichContactFromEmail(
    supabase,
    uid,
    email,
    name,
    { company: c.company ?? null, role: c.role ?? null, phone: c.phone ?? null },
    ctx,
  );
  revalidatePath(`/contacts/${uid}`);
  revalidatePath("/");
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

type ParsedRow = {
  first: string;
  last: string | null;
  company: string | null;
  email: string | null;
};

/** Parse a pasted "Name - Company - email" list (one per line, tolerant). */
function parseImport(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/["']+$/, "").trim();
    if (!line) continue;
    const m = line.match(EMAIL_RE);
    const email = m ? m[0].toLowerCase() : null;
    let rest = (m ? line.replace(m[0], "") : line).trim();
    rest = rest
      .replace(/\?\?/g, "")
      .replace(/[-–]+\s*$/, "")
      .replace(/^[-–]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const parts = rest
      .split(/\s+[-–]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    let name = parts[0] ?? "";
    const company = parts[1] || null;
    if (!name && email) name = email.split("@")[0];
    if (!name) continue;
    const nameParts = name.split(/\s+/);
    rows.push({
      first: nameParts[0],
      last: nameParts.slice(1).join(" ") || null,
      company,
      email,
    });
  }
  return rows;
}

/** Bulk-add contacts from a pasted list. Dedupes by email vs existing + paste. */
export async function bulkImport(formData: FormData) {
  const parsed = parseImport(String(formData.get("list") ?? ""));
  const supabase = await createClient();

  const { data: existing } = await supabase.from("contacts").select("emails");
  const have = new Set<string>();
  for (const c of existing ?? []) {
    for (const e of (c.emails as string[] | null) ?? []) {
      have.add(String(e).toLowerCase());
    }
  }

  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  let noEmail = 0;
  for (const r of parsed) {
    if (!r.email) {
      noEmail++;
      continue;
    }
    if (have.has(r.email) || seen.has(r.email)) {
      skipped++;
      continue;
    }
    seen.add(r.email);
    toInsert.push({
      first_name: r.first,
      last_name: r.last,
      emails: [r.email],
      company: r.company,
      website: deriveWebsite([r.email]),
      tags: ["imported"],
    });
  }

  let added = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { error } = await supabase.from("contacts").insert(chunk);
    if (!error) added += chunk.length;
  }

  // Kick the server-side enrichment drain so the freshly imported contacts get
  // their names / phones / summaries filled in from email history in the
  // background — it self-chains on the server and survives the tab closing.
  if (added > 0) await kickBackgroundEnrich();

  revalidatePath("/contacts");
  revalidatePath("/");
  redirect(`/contacts?imported=${added}&skipped=${skipped}&noemail=${noEmail}`);
}

/**
 * Import contacts straight from the `Connections.csv` in a LinkedIn data export.
 * Unlike the pasted-list import, this keeps each person's profile URL and role,
 * and adds connections even when LinkedIn omits their email (deduping on the
 * profile URL in that case). Existing contacts, matched by email OR profile
 * URL, are skipped. Ones that do have an email get background enrichment.
 */
export async function importLinkedinCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/contacts?imported=0&skipped=0");
  }
  const parsed = parseLinkedinCsv(await file.text());

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("contacts")
    .select("emails, linkedin_url");
  const haveEmail = new Set<string>();
  const haveUrl = new Set<string>();
  for (const c of existing ?? []) {
    for (const e of (c.emails as string[] | null) ?? []) {
      haveEmail.add(String(e).toLowerCase());
    }
    if (c.linkedin_url) haveUrl.add(normalizeLinkedin(c.linkedin_url as string));
  }

  const seenEmail = new Set<string>();
  const seenUrl = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of parsed) {
    const email = r.email;
    const urlKey = r.linkedinUrl ? normalizeLinkedin(r.linkedinUrl) : null;
    // Need at least one identity key to dedupe on.
    if (!email && !urlKey) {
      skipped++;
      continue;
    }
    const dupe =
      (email && (haveEmail.has(email) || seenEmail.has(email))) ||
      (urlKey && (haveUrl.has(urlKey) || seenUrl.has(urlKey)));
    if (dupe) {
      skipped++;
      continue;
    }
    if (email) seenEmail.add(email);
    if (urlKey) seenUrl.add(urlKey);
    toInsert.push({
      first_name: r.first || "(unknown)",
      last_name: r.last,
      emails: email ? [email] : [],
      company: r.company,
      role: r.role,
      linkedin_url: r.linkedinUrl,
      website: email ? deriveWebsite([email]) : null,
      tags: ["linkedin"],
    });
  }

  let added = 0;
  let withEmail = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { error } = await supabase.from("contacts").insert(chunk);
    if (!error) {
      added += chunk.length;
      withEmail += chunk.filter((c) => (c.emails as string[]).length > 0).length;
    }
  }

  // Only the ones with an email can be enriched from mail history.
  if (withEmail > 0) await kickBackgroundEnrich();

  revalidatePath("/contacts");
  revalidatePath("/");
  redirect(`/contacts?imported=${added}&skipped=${skipped}&noemail=0`);
}

export type ContactHit = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
};

/**
 * Live search for the contacts as-you-type dropdown. Each whitespace-separated
 * word must match somewhere (first name, last name, or company) — so "john
 * smith" finds first_name John + last_name Smith, which a single %john smith%
 * never would. Returns up to 8 active contacts, most-recently-contacted first.
 */
export async function searchContacts(term: string): Promise<ContactHit[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, company, role, last_contact_at")
    .eq("archived", false);
  for (const tok of t.split(/\s+/).filter(Boolean).slice(0, 4)) {
    // Strip characters that would break the PostgREST or() filter grammar.
    const esc = tok.replace(/[%,()]/g, " ").trim();
    if (!esc) continue;
    query = query.or(
      `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,company.ilike.%${esc}%`,
    );
  }
  const { data } = await query
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(8)
    .returns<
      {
        id: string;
        first_name: string;
        last_name: string | null;
        company: string | null;
        role: string | null;
      }[]
    >();
  return (data ?? []).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    company: c.company,
    role: c.role,
  }));
}

export async function setArchived(id: string, archived: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ archived })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
}

const interactionSchema = z.object({
  contact_id: z.string().uuid(),
  type: z.enum(["call", "note", "meeting", "email_in", "email_out"]),
  subject: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  occurred_at: z.string().optional(),
});

/** Log a manual interaction and bump last_contact_at. */
export async function addInteraction(formData: FormData) {
  const parsed = interactionSchema.parse(Object.fromEntries(formData));
  const occurredAt = parsed.occurred_at
    ? new Date(parsed.occurred_at).toISOString()
    : new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase.from("interactions").insert({
    contact_id: parsed.contact_id,
    type: parsed.type,
    subject: parsed.subject || null,
    summary: parsed.summary || null,
    occurred_at: occurredAt,
  });
  if (error) throw new Error(error.message);

  // Keep last_contact_at as the most recent interaction.
  const { data: contact } = await supabase
    .from("contacts")
    .select("last_contact_at")
    .eq("id", parsed.contact_id)
    .single();
  if (!contact?.last_contact_at || contact.last_contact_at < occurredAt) {
    await supabase
      .from("contacts")
      .update({ last_contact_at: occurredAt })
      .eq("id", parsed.contact_id);
  }

  revalidatePath(`/contacts/${parsed.contact_id}`);
  revalidatePath("/");
}

type MergeableContact = {
  id: string;
  emails: string[] | null;
  tags: string[] | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  linkedin_url: string | null;
  website: string | null;
  notes: string | null;
  pipeline_stage: string;
  temperature: string;
  last_contact_at: string | null;
};

/**
 * Merge one or more duplicate contacts into a keeper: unions emails/tags, fills
 * the keeper's blank fields from the losers, moves all interactions across
 * (dropping ones the keeper already has), then deletes the losers. Idempotent
 * per run and safe — the keeper's own non-empty fields are never overwritten.
 */
export async function mergeContacts(keeperId: string, loserIds: string[]) {
  const kId = z.string().uuid().parse(keeperId);
  const lIds = z.array(z.string().uuid()).parse(loserIds).filter((x) => x !== kId);
  if (lIds.length === 0) return;

  const supabase = await createClient();
  const { data: keeper } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", kId)
    .single<MergeableContact>();
  if (!keeper) throw new Error("Keeper contact not found.");

  const { data: losers } = await supabase
    .from("contacts")
    .select("*")
    .in("id", lIds)
    .returns<MergeableContact[]>();

  const norm = (e: string) => e.trim().toLowerCase();
  const emails = [...(keeper.emails ?? [])];
  const seen = new Set(emails.map(norm));
  const tags = new Set(keeper.tags ?? []);
  const patch: Record<string, unknown> = {};
  let stage = keeper.pipeline_stage;
  let last = keeper.last_contact_at;
  const notes = [keeper.notes].filter(Boolean) as string[];

  for (const l of losers ?? []) {
    for (const e of l.emails ?? []) if (!seen.has(norm(e))) { emails.push(e); seen.add(norm(e)); }
    for (const t of l.tags ?? []) tags.add(t);
    if (!keeper.phone && !patch.phone && l.phone) patch.phone = l.phone;
    if (!keeper.role && !patch.role && l.role) patch.role = l.role;
    if (!keeper.company && !patch.company && l.company) patch.company = l.company;
    if (!keeper.linkedin_url && !patch.linkedin_url && l.linkedin_url) patch.linkedin_url = l.linkedin_url;
    if (!keeper.website && !patch.website && l.website) patch.website = l.website;
    if (l.notes) notes.push(l.notes);
    if (stage === "none" && l.pipeline_stage !== "none") stage = l.pipeline_stage;
    if (l.last_contact_at && (!last || last < l.last_contact_at)) last = l.last_contact_at;
  }

  patch.emails = emails;
  patch.tags = [...tags];
  patch.pipeline_stage = stage;
  patch.last_contact_at = last;
  if (notes.length) patch.notes = notes.join("\n");

  const { error: upErr } = await supabase.from("contacts").update(patch).eq("id", kId);
  if (upErr) throw new Error(upErr.message);

  // Move interactions across, skipping any the keeper already has (by dedup key).
  const { data: keeperInts } = await supabase
    .from("interactions")
    .select("graph_message_id")
    .eq("contact_id", kId)
    .not("graph_message_id", "is", null);
  const keeperKeys = new Set(
    (keeperInts ?? []).map((r) => r.graph_message_id as string),
  );
  for (const lid of lIds) {
    const { data: lInts } = await supabase
      .from("interactions")
      .select("id, graph_message_id")
      .eq("contact_id", lid);
    const dupeIds = (lInts ?? [])
      .filter((r) => r.graph_message_id && keeperKeys.has(r.graph_message_id as string))
      .map((r) => r.id);
    if (dupeIds.length) {
      await supabase.from("interactions").delete().in("id", dupeIds);
    }
    await supabase
      .from("interactions")
      .update({ contact_id: kId })
      .eq("contact_id", lid);
    await supabase.from("contact_updates").delete().eq("contact_id", lid);
  }
  await supabase.from("contacts").delete().in("id", lIds);

  revalidatePath("/contacts");
  revalidatePath("/duplicates");
  revalidatePath(`/contacts/${kId}`);
}
