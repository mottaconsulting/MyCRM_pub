"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, searchCatchUps, type GraphMessage } from "@/lib/graph";
import { parseContactName } from "@/lib/names";
import { enrichContactFromEmail } from "@/lib/enrich";
import { deltaSyncCore } from "@/lib/sync";
import { calendarBackfillCore } from "@/lib/calendar";
import { syncTeamsTranscriptsCore } from "@/lib/teams";
import { geminiJson } from "@/lib/gemini";
import { ownerContext, authTenantId } from "@/lib/tenant";
import { siteBaseUrl } from "@/lib/site";

const schema = z.object({
  hot_days: z.coerce.number().int().min(1).max(365),
  warm_days: z.coerce.number().int().min(1).max(365),
  cold_days: z.coerce.number().int().min(1).max(365),
  suggestion_thread_threshold: z.coerce.number().int().min(1).max(50),
});

export async function updateSettings(formData: FormData) {
  const parsed = schema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(parsed);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/");
}

/** Save the admin-managed master list of interest tags (comma-separated). */
export async function updateInterestOptions(formData: FormData) {
  const raw = String(formData.get("interest_options") ?? "");
  const list = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ interest_options: list });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/contacts");
  revalidatePath("/campaigns");
}

/**
 * Bulk-enrich contacts that don't yet have an AI summary — backfills the
 * per-email timeline + summary + last_contact for everyone in one go. Bounded
 * per run (to stay within the function time limit); shows how many remain.
 */
export async function syncAllContacts() {
  const supabase = await createClient();
  const ctx = await ownerContext(supabase);
  if (!ctx) redirect(`/settings?ms_error=no_tenant`);
  let token: string;
  try {
    token = await getAccessToken(ctx.tenantId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "not_connected";
    redirect(`/settings?ms_error=${encodeURIComponent(msg)}`);
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, emails, first_name, last_name, company, role, phone")
    .eq("archived", false)
    .is("ai_summary_at", null)
    .order("created_at")
    .limit(15);

  let synced = 0;
  for (const c of contacts ?? []) {
    const email = (c.emails as string[] | null)?.[0];
    if (!email) {
      await supabase
        .from("contacts")
        .update({ ai_summary_at: new Date().toISOString() })
        .eq("id", c.id);
      synced++;
      continue;
    }
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    await enrichContactFromEmail(
      supabase,
      c.id,
      email,
      name,
      { company: c.company ?? null, role: c.role ?? null, phone: c.phone ?? null },
      { ...ctx, accessToken: token },
    );
    synced++;
  }

  const { count: remaining } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("archived", false)
    .is("ai_summary_at", null);

  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/settings");
  redirect(`/settings?synced=${synced}&remaining=${remaining ?? 0}`);
}

const TAG_SCHEMA = {
  type: "OBJECT",
  properties: {
    assignments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          i: { type: "INTEGER" },
          interests: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["i", "interests"],
      },
    },
  },
  required: ["assignments"],
};

/**
 * AI-tag a batch of not-yet-tagged contacts against the master interest list,
 * based on their role / company / summary. Only assigns labels that exist in the
 * list. Bounded per run so a client can loop it until `remaining` hits 0.
 */
export async function autoTagInterestsBatch(
  limit = 20,
): Promise<{ processed: number; tagged: number; remaining: number; error?: string }> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("interest_options")
    .single();
  const options = (settings?.interest_options as string[] | null) ?? [];
  if (!options.length) {
    return { processed: 0, tagged: 0, remaining: 0, error: "Add interest tags first." };
  }
  const canonical = new Map(options.map((o) => [o.toLowerCase(), o]));

  // Cheap pass to find untagged ids, then fetch full fields for just this batch
  // (avoids re-pulling every contact's summary on every call).
  const { data: idRows } = await supabase
    .from("contacts")
    .select("id, interests")
    .eq("archived", false)
    .order("created_at");
  const untaggedIds = (idRows ?? [])
    .filter((c) => !((c.interests as string[] | null)?.length))
    .map((c) => c.id as string);
  if (!untaggedIds.length) return { processed: 0, tagged: 0, remaining: 0 };
  const take = untaggedIds.slice(0, limit);
  const { data: batch } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, company, role, ai_summary, notes")
    .in("id", take);
  if (!batch?.length) return { processed: 0, tagged: 0, remaining: 0 };

  const list = batch
    .map((c, idx) => {
      const bits = [
        [c.first_name, c.last_name].filter(Boolean).join(" "),
        c.role,
        c.company,
        (c.ai_summary || c.notes || "").slice(0, 300),
      ]
        .filter(Boolean)
        .join(" — ");
      return `[${idx + 1}] ${bits}`;
    })
    .join("\n");
  const prompt =
    `Tag each CRM contact with interest categories. Use ONLY these exact labels: ${options.join(", ")}.\n\n` +
    `Assign a category only when there is a clear signal (e.g. someone at a transport department → Transport; a builder or construction firm → Construction; a training/course provider → the relevant Courses label). Return an empty list when nothing clearly applies. Never invent a label outside the list.\n\n` +
    `People:\n${list}`;

  let out: { assignments: { i: number; interests: string[] }[] } | null = null;
  try {
    out = await geminiJson(prompt, TAG_SCHEMA);
  } catch {
    out = null;
  }
  if (!out?.assignments) {
    return {
      processed: 0,
      tagged: 0,
      remaining: untaggedIds.length,
      error: "AI tagging unavailable — check the Gemini key.",
    };
  }

  let tagged = 0;
  for (const a of out.assignments) {
    const c = batch[a.i - 1];
    if (!c) continue;
    const picked = [
      ...new Set(
        (a.interests ?? [])
          .map((x) => canonical.get(String(x).toLowerCase()))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    if (!picked.length) continue;
    const { error } = await supabase
      .from("contacts")
      .update({ interests: picked })
      .eq("id", c.id);
    if (!error) tagged++;
  }

  revalidatePath("/contacts");
  return {
    processed: batch.length,
    tagged,
    remaining: Math.max(0, untaggedIds.length - batch.length),
  };
}

/**
 * Bulk-assign one interest to every active contact matching a name/company/role
 * keyword. Adds the interest (never removes existing ones). For quickly applying
 * a newly-created category to a set of people.
 */
export async function bulkAssignInterestByKeyword(formData: FormData) {
  const interest = String(formData.get("interest") ?? "").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("interest_options")
    .single();
  const options = (settings?.interest_options as string[] | null) ?? [];
  if (!interest || !options.includes(interest)) {
    redirect(`/settings?ms_error=${encodeURIComponent("Pick a valid interest to assign.")}`);
  }
  if (!keyword) {
    redirect(`/settings?ms_error=${encodeURIComponent("Enter a keyword to match contacts.")}`);
  }

  const esc = keyword.replace(/[%,()]/g, " ").trim();
  const { data: matched } = await supabase
    .from("contacts")
    .select("id, interests")
    .eq("archived", false)
    .or(
      `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,company.ilike.%${esc}%,role.ilike.%${esc}%`,
    )
    .limit(1000);

  let assigned = 0;
  for (const c of matched ?? []) {
    const cur = (c.interests as string[] | null) ?? [];
    if (cur.includes(interest)) continue;
    const { error } = await supabase
      .from("contacts")
      .update({ interests: [...cur, interest] })
      .eq("id", c.id);
    if (!error) assigned++;
  }

  revalidatePath("/contacts");
  revalidatePath("/settings");
  redirect(`/settings?assigned=${assigned}&interest=${encodeURIComponent(interest)}`);
}

/** Manually run the delta sync (the scheduled version calls /api/sync/delta). */
export async function runDeltaSyncNow() {
  const supabase = await createClient();
  const tenantId = await authTenantId(supabase);
  if (!tenantId) redirect(`/settings?ms_error=no_tenant`);
  let interactions = 0;
  try {
    ({ interactions } = await deltaSyncCore(supabase, tenantId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    await supabase.from("sync_state").update({ last_error: msg });
    redirect(`/settings?ms_error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/");
  revalidatePath("/settings");
  redirect(`/settings?delta=${interactions}`);
}

/** Manually pull recent + upcoming calendar meetings now (narrow window). */
export async function runCalendarSyncNow() {
  const supabase = await createClient();
  const tenantId = await authTenantId(supabase);
  if (!tenantId) redirect(`/settings?ms_error=no_tenant`);
  let logged = 0;
  try {
    ({ meetingsLogged: logged } = await calendarBackfillCore(supabase, tenantId, 1, 2));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    redirect(`/settings?ms_error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/");
  revalidatePath("/settings");
  redirect(`/settings?calendar=${logged}`);
}

/** Manually pull + summarise Teams meeting transcripts now. */
export async function runTranscriptSyncNow() {
  const supabase = await createClient();
  const tenantId = await authTenantId(supabase);
  if (!tenantId) redirect(`/settings?ms_error=no_tenant`);
  let summarised = 0;
  let err: string | null = null;
  try {
    const r = await syncTeamsTranscriptsCore(supabase, tenantId);
    summarised = r.summarised;
    err = r.error ?? null;
  } catch (e) {
    err = e instanceof Error ? e.message : "sync_failed";
  }
  revalidatePath("/");
  revalidatePath("/settings");
  if (err) redirect(`/settings?ms_error=${encodeURIComponent(err)}`);
  redirect(`/settings?transcripts=${summarised}`);
}

/**
 * Kick off the server-side enrichment drain (/api/sync/enrich), which processes
 * a batch then re-triggers itself until the whole backlog is done — no browser
 * tab required. Fire-and-forget: we dispatch the request and abort the wait,
 * and Vercel keeps the triggered function running independently.
 */
export async function startBackgroundEnrich(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const secret = process.env.CRON_SECRET;
  const site = siteBaseUrl();
  if (!secret) return { ok: false, error: "CRON_SECRET is not set on the server." };
  if (!site) return { ok: false, error: "Could not resolve the site URL." };
  try {
    await fetch(`${site}/api/sync/enrich`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Expected — the server function keeps running after we stop waiting.
  }
  return { ok: true };
}

/**
 * One enrichment batch (15) — returns counts so a client can loop it until
 * done without hitting the function time limit.
 */
export async function syncBatch(): Promise<{ synced: number; remaining: number }> {
  const supabase = await createClient();
  const ctx = await ownerContext(supabase);
  if (!ctx) return { synced: 0, remaining: 0 };
  const token = await getAccessToken(ctx.tenantId);
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, emails, first_name, last_name, company, role, phone")
    .eq("archived", false)
    .is("ai_summary_at", null)
    .order("created_at")
    .limit(3);

  let synced = 0;
  for (const c of contacts ?? []) {
    const email = (c.emails as string[] | null)?.[0];
    if (!email) {
      // No email to enrich from (e.g. LinkedIn-only) — mark attempted so the
      // queue keeps advancing instead of stalling on it.
      await supabase
        .from("contacts")
        .update({ ai_summary_at: new Date().toISOString() })
        .eq("id", c.id);
      synced++;
      continue;
    }
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    await enrichContactFromEmail(
      supabase,
      c.id,
      email,
      name,
      { company: c.company ?? null, role: c.role ?? null, phone: c.phone ?? null },
      { ...ctx, accessToken: token },
    );
    synced++;
  }

  const { count: remaining } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("archived", false)
    .is("ai_summary_at", null);

  revalidatePath("/");
  revalidatePath("/contacts");
  return { synced, remaining: remaining ?? 0 };
}

// Common non-human senders / mailing lists.
const NOISE =
  /(no-?reply|do-?not-?reply|notifications?|newsletter|usergroups?|mailer|mailchimp|postmaster|bounce|unsubscribe|@calendly|invoices?@|updates?@)/i;

type Party = { name?: string; addr: string };

function partiesOf(m: GraphMessage): Party[] {
  const out: Party[] = [];
  const push = (r?: { emailAddress?: { name?: string; address?: string } }) => {
    const addr = r?.emailAddress?.address?.toLowerCase();
    if (addr) out.push({ name: r?.emailAddress?.name, addr });
  };
  push(m.from);
  (m.toRecipients ?? []).forEach(push);
  (m.ccRecipients ?? []).forEach(push);
  return out;
}

/**
 * Crawl the mailbox for "catch up" subject threads, aggregate the people
 * involved, and add any not-yet-seen correspondents as pending suggestions
 * (source "catchup"). Reuses the existing review flow. Idempotent: emails
 * already present as a suggestion (any status) are skipped.
 */
export async function runCatchUpCrawl() {
  const supabase = createAdminClient();
  const tenantId = await authTenantId(await createClient());
  if (!tenantId) redirect(`/settings?ms_error=no_tenant`);
  // The tenant owner's own address to exclude from suggestions.
  const { data: ownS } = await supabase
    .from("settings")
    .select("owner_email")
    .eq("tenant_id", tenantId)
    .single();
  const myEmails = new Set(
    [ownS?.owner_email ?? ""].map((e) => e.trim().toLowerCase()).filter(Boolean),
  );

  let messages: GraphMessage[];
  try {
    const token = await getAccessToken(tenantId);
    messages = await searchCatchUps(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "crawl_failed";
    await supabase.from("sync_state").update({ last_error: msg }).eq("tenant_id", tenantId);
    redirect(`/settings?ms_error=${encodeURIComponent(msg)}`);
  }

  type Agg = {
    name?: string;
    email: string;
    domain: string;
    count: number;
    first: string;
    last: string;
    subjects: string[];
    snippet: string;
  };
  const agg = new Map<string, Agg>();

  for (const m of messages) {
    const when = m.receivedDateTime ?? "";
    for (const p of partiesOf(m)) {
      if (myEmails.has(p.addr) || NOISE.test(p.addr)) continue;
      const domain = p.addr.split("@")[1] ?? "";
      const cur =
        agg.get(p.addr) ??
        ({
          name: p.name,
          email: p.addr,
          domain,
          count: 0,
          first: when,
          last: when,
          subjects: [],
          snippet: m.bodyPreview ?? "",
        } satisfies Agg);
      cur.count += 1;
      if (p.name && !cur.name) cur.name = p.name;
      if (when && when < cur.first) cur.first = when;
      if (when && when >= cur.last) {
        cur.last = when;
        cur.snippet = m.bodyPreview ?? cur.snippet;
      }
      if (m.subject && cur.subjects.length < 3 && !cur.subjects.includes(m.subject)) {
        cur.subjects.push(m.subject);
      }
      agg.set(p.addr, cur);
    }
  }

  // Merge the same person appearing under multiple addresses (same normalised
  // name) into one suggestion carrying all their emails.
  const byName = new Map<string, Agg[]>();
  for (const a of agg.values()) {
    const key = parseContactName(a.name, a.email).display.toLowerCase();
    const list = byName.get(key);
    if (list) list.push(a);
    else byName.set(key, [a]);
  }
  const people = [...byName.values()].map((group) => {
    group.sort((x, y) => y.count - x.count);
    const primary = group[0];
    const firsts = group.map((g) => g.first).filter(Boolean).sort();
    const lasts = group.map((g) => g.last).filter(Boolean).sort();
    return {
      name: primary.name,
      email: primary.email,
      emails: [...new Set(group.map((g) => g.email))],
      domain: primary.domain,
      count: group.reduce((s, g) => s + g.count, 0),
      first: firsts[0] ?? primary.first,
      last: lasts[lasts.length - 1] ?? primary.last,
      subjects: [...new Set(group.flatMap((g) => g.subjects))].slice(0, 3),
      snippet: primary.snippet,
    };
  });

  // Skip anyone already surfaced (any suggestion, any status) OR already a
  // contact (active or archived) — never re-suggest an existing person.
  const { data: existing } = await supabase
    .from("suggestions")
    .select("payload")
    .eq("tenant_id", tenantId);
  const seen = new Set(
    (existing ?? []).map((r) =>
      String((r.payload as { email?: string })?.email ?? "").toLowerCase(),
    ),
  );
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("emails")
    .eq("tenant_id", tenantId);
  for (const c of existingContacts ?? []) {
    for (const e of (c.emails as string[] | null) ?? []) {
      seen.add(String(e).toLowerCase());
    }
  }

  const rows = people
    .filter((p) => !p.emails.some((e) => seen.has(e)))
    .map((p) => ({
      tenant_id: tenantId,
      type: "new_contact",
      source: "catchup",
      status: "pending" as const,
      payload: {
        name: p.name ?? null,
        email: p.email,
        emails: p.emails,
        domain: p.domain,
        company_guess: null,
        thread_count: p.count,
        first_seen: p.first || null,
        last_seen: p.last || null,
        sample_subjects: p.subjects,
        snippet: p.snippet.slice(0, 200),
      },
    }));

  let added = 0;
  if (rows.length) {
    const { error } = await supabase.from("suggestions").insert(rows);
    if (!error) added = rows.length;
  }

  await supabase
    .from("sync_state")
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq("tenant_id", tenantId);

  revalidatePath("/settings");
  revalidatePath("/review");
  revalidatePath("/");
  redirect(`/settings?crawl_new=${added}&crawl_people=${people.length}`);
}
