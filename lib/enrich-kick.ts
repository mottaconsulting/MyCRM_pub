import "server-only";
import { siteBaseUrl } from "@/lib/site";

/**
 * Fire-and-forget kick of the server-side enrichment drain (/api/sync/enrich),
 * which processes a batch of not-yet-enriched contacts then re-triggers itself
 * until the whole backlog is clear — entirely on the server, so it keeps going
 * after the browser tab is closed. We dispatch the request and stop waiting
 * after a few seconds; the triggered Vercel function runs to completion on its
 * own. No-op (silently) if CRON_SECRET or the site URL isn't configured.
 */
export async function kickBackgroundEnrich(): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const site = siteBaseUrl();
  if (!secret || !site) return false;
  try {
    await fetch(`${site}/api/sync/enrich`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Expected — the server function keeps running after we stop waiting.
  }
  return true;
}
