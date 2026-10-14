import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deltaSyncCore } from "@/lib/sync";
import { calendarBackfillCore } from "@/lib/calendar";
import { syncTeamsTranscriptsCore } from "@/lib/teams";
import { tenantsToSync } from "@/lib/tenant";
import { siteBaseUrl } from "@/lib/site";

// Scheduled sync, run by Vercel Cron (which sends Authorization: Bearer
// CRON_SECRET automatically when the env var is set). Pulls new emails (delta)
// and recent/upcoming meetings, then stamps last_sync_at. Best-effort: one
// leg failing doesn't abort the other.
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const out: Record<string, unknown> = {};

  // Sync every tenant that has a Microsoft connection, each against its own
  // mailbox/calendar. deltaSyncCore stamps each tenant's last_sync_at.
  const tenants = await tenantsToSync();
  const results: Record<string, unknown>[] = [];
  for (const t of tenants) {
    const r: Record<string, unknown> = { tenant: t.tenantId };
    try {
      r.delta = await deltaSyncCore(supabase, t.tenantId);
    } catch (e) {
      r.deltaError = e instanceof Error ? e.message : String(e);
    }
    try {
      // Narrow window on a schedule: last month back, two months ahead.
      r.calendar = await calendarBackfillCore(supabase, t.tenantId, 1, 2);
    } catch (e) {
      r.calendarError = e instanceof Error ? e.message : String(e);
    }
    try {
      // Teams transcripts (no-op until the transcript scopes are consented).
      r.transcripts = await syncTeamsTranscriptsCore(supabase, t.tenantId);
    } catch (e) {
      r.transcriptsError = e instanceof Error ? e.message : String(e);
    }
    results.push(r);
  }
  out.tenants = results;

  // Kick the server-side enrichment drain for any contacts still missing an
  // AI summary (e.g. a fresh import). Fire-and-forget; it self-chains.
  const site = siteBaseUrl();
  if (site) {
    try {
      await fetch(`${site}/api/sync/enrich`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(3000),
      });
      out.enrichKicked = true;
    } catch {
      /* dispatched; wait aborted */
    }
  }

  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
