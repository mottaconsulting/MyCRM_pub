import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccessToken,
  deltaMessages,
  deltaStartUrl,
  type GraphMessage,
} from "@/lib/graph";

/**
 * Incremental delta sync: for new inbox/sent messages since last run, log an
 * interaction with any KNOWN contact involved and keep last_contact_at current.
 * The first run per folder just captures the delta bookmark (no history dump).
 * New-contact discovery stays with the manual catch-up crawl for now.
 */
export async function deltaSyncCore(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ interactions: number }> {
  const token = await getAccessToken(tenantId);
  const { data: settings } = await supabase
    .from("settings")
    .select("owner_email")
    .eq("tenant_id", tenantId)
    .single();
  const me = (settings?.owner_email ?? "").toLowerCase();
  const myEmails = new Set([me].filter(Boolean));

  const { data: state } = await supabase
    .from("sync_state")
    .select("inbox_delta_link, sent_delta_link")
    .eq("tenant_id", tenantId)
    .single();

  // email → contact id (this tenant only)
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, emails")
    .eq("tenant_id", tenantId);
  const contactByEmail = new Map<string, string>();
  for (const c of contacts ?? []) {
    for (const e of (c.emails as string[] | null) ?? []) {
      contactByEmail.set(String(e).toLowerCase(), c.id as string);
    }
  }

  const parties = (m: GraphMessage) =>
    [m.from, ...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]
      .map((r) => r?.emailAddress?.address?.toLowerCase())
      .filter((a): a is string => Boolean(a) && !myEmails.has(a!));

  let interactions = 0;

  for (const folder of ["inbox", "sentitems"] as const) {
    const stored =
      folder === "inbox" ? state?.inbox_delta_link : state?.sent_delta_link;
    const firstRun = !stored;
    const { messages, deltaLink } = await deltaMessages(
      token,
      stored ?? deltaStartUrl(folder),
    );

    if (!firstRun) {
      for (const m of messages) {
        if (!m.id) continue; // skip @removed / tombstones
        const from = m.from?.emailAddress?.address?.toLowerCase();
        const occurred = m.receivedDateTime ?? new Date().toISOString();
        for (const addr of new Set(parties(m))) {
          const contactId = contactByEmail.get(addr);
          if (!contactId) continue;
          const { error } = await supabase.from("interactions").upsert(
            {
              tenant_id: tenantId,
              contact_id: contactId,
              type: from === addr ? "email_in" : "email_out",
              occurred_at: occurred,
              subject: m.subject ?? null,
              graph_message_id: m.id,
            },
            { onConflict: "contact_id,graph_message_id", ignoreDuplicates: true },
          );
          if (!error) interactions++;
          await supabase
            .from("contacts")
            .update({ last_contact_at: occurred })
            .eq("id", contactId)
            .or(`last_contact_at.is.null,last_contact_at.lt.${occurred}`);
        }
      }
    }

    if (deltaLink) {
      const col = folder === "inbox" ? "inbox_delta_link" : "sent_delta_link";
      await supabase.from("sync_state").update({ [col]: deltaLink }).eq("tenant_id", tenantId);
    }
  }

  await supabase
    .from("sync_state")
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq("tenant_id", tenantId);

  return { interactions };
}
