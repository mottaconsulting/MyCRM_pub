"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayInMelbourne, addDays, addMonths } from "@/lib/date";
import { parseContactName } from "@/lib/names";
import { deriveWebsite } from "@/lib/contacts";
import { enrichContactFromEmail } from "@/lib/enrich";
import { ownerContext } from "@/lib/tenant";

/** Snooze a follow-up by +1 week or +1 month from today (Melbourne). */
export async function snoozeFollowup(id: string, period: "1w" | "1m") {
  const today = todayInMelbourne();
  const next = period === "1w" ? addDays(today, 7) : addMonths(today, 1);

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ next_followup_at: next })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/**
 * Mark a contact as followed-up: clears the scheduled follow-up, sets
 * last_contact_at = now, and logs a `note` interaction.
 */
export async function markFollowedUp(id: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("contacts")
    .update({
      next_followup_at: null,
      followup_reason: null,
      last_contact_at: now,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("interactions").insert({
    contact_id: id,
    type: "note",
    summary: "Marked followed-up",
    occurred_at: now,
  });

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
}

/** Record that you reached out (resets the keep-in-touch clock). */
export async function markContacted(id: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("contacts")
    .update({ last_contact_at: now })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("interactions").insert({
    contact_id: id,
    type: "note",
    summary: "Reached out",
    occurred_at: now,
  });
  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
}

/**
 * Dismiss a contact from the "Keep in touch" 4-month reconnect list without
 * pretending they were contacted. They stay a normal contact everywhere else.
 */
export async function dismissKeepInTouch(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ keep_in_touch: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
}

/**
 * Super admin only: switch which tenant they're viewing. The DB function rejects
 * non-super-admins, so this can't be used to escape a tenant.
 */
export async function switchTenant(tenantId: string) {
  const id = z.string().uuid().parse(tenantId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_tenant", { target: id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * Dismiss a contact from the "Awaiting your reply" list — you've decided you
 * don't owe them a reply (or you handled it outside the CRM). They reappear
 * only if a NEWER inbound email arrives after this moment.
 */
export async function dismissAwaitingReply(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ reply_dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Create a contact from a pending suggestion and mark it accepted. Uses edited
 * form fields when present (Review "Edit" form); otherwise derives sensible
 * defaults from the payload. No-op if the suggestion is not pending.
 */
async function acceptSuggestionCore(
  supabase: SupabaseServer,
  id: string,
  form?: FormData,
  enrich = false,
) {
  const { data: sug, error: readErr } = await supabase
    .from("suggestions")
    .select("id, payload, status, source")
    .eq("id", id)
    .single();
  if (readErr) throw new Error(readErr.message);
  if (sug.status !== "pending") return;

  const payload = sug.payload as {
    name?: string;
    email: string;
    emails?: string[];
    company_guess?: string;
  };

  const parsed = parseContactName(payload.name, payload.email);
  const defFirst = parsed.first;
  const defLast = parsed.last;

  const str = (k: string) => ((form?.get(k) as string | null) ?? "").trim();
  const firstName = str("first_name") || defFirst;
  const lastName = str("last_name") || defLast;
  const emailsIn = str("emails");
  const emails = emailsIn
    ? [
        ...new Set(
          emailsIn
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      ]
    : [
        ...new Set(
          (payload.emails?.length ? payload.emails : [payload.email]).map((e) =>
            e.toLowerCase(),
          ),
        ),
      ];
  const company = str("company") || payload.company_guess || null;
  const role = str("role") || null;
  const phone = str("phone") || null;
  const tagsIn = str("tags");
  let tags = tagsIn
    ? tagsIn
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  if (sug.source === "catchup" && !tags.includes("catch-up")) {
    tags = ["catch-up", ...tags];
  }

  const { data: inserted, error: insErr } = await supabase
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      emails,
      company,
      role,
      phone,
      website: deriveWebsite(emails),
      tags,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  await supabase
    .from("suggestions")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", id);

  // Single accepts enrich via Gemini (bulk stays fast). Best-effort.
  if (enrich && inserted?.id) {
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    const ctx = await ownerContext(supabase);
    if (ctx) {
      await enrichContactFromEmail(
        supabase,
        inserted.id as string,
        emails[0],
        displayName,
        { company, role, phone },
        ctx,
      );
    }
  }
}

function revalidateAccept() {
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/contacts");
}

/** Accept one suggestion (optionally with edited fields from the form). */
export async function acceptSuggestion(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await acceptSuggestionCore(supabase, id, formData, true);
  revalidateAccept();
}

/** Accept many suggestions at once (bulk), using payload defaults. */
export async function acceptSuggestions(ids: string[]) {
  const valid = z.array(z.string().uuid()).min(1).parse(ids);
  const supabase = await createClient();
  for (const id of valid) await acceptSuggestionCore(supabase, id);
  revalidateAccept();
}

const UPDATE_FIELDS = new Set(["company", "role", "phone"]);

/** Apply a suggested data-change to the contact. */
export async function applyContactUpdate(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { data: u, error } = await supabase
    .from("contact_updates")
    .select("contact_id, field, suggested_value, status")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (u.status !== "pending" || !UPDATE_FIELDS.has(u.field)) return;

  await supabase
    .from("contacts")
    .update({ [u.field]: u.suggested_value })
    .eq("id", u.contact_id);
  await supabase
    .from("contact_updates")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/");
  revalidatePath(`/contacts/${u.contact_id}`);
}

/** Dismiss a suggested data-change. */
export async function dismissContactUpdate(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_updates")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/** Reject one suggestion. */
export async function rejectSuggestion(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("suggestions")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/review");
}

/** Reject many suggestions at once (bulk). */
export async function rejectSuggestions(ids: string[]) {
  const valid = z.array(z.string().uuid()).min(1).parse(ids);
  const supabase = await createClient();
  const { error } = await supabase
    .from("suggestions")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .in("id", valid);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/review");
}
