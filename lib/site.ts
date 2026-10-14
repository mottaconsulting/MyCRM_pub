import "server-only";

/**
 * Resolve this app's own base URL for server-to-server self-calls (e.g. the
 * enrichment drain triggering itself). Prefers an explicit NEXT_PUBLIC_SITE_URL,
 * then Vercel's auto-provided production / deployment domains — so no env var
 * needs to be set by hand.
 */
export function siteBaseUrl(): string | null {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  if (explicit) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const dep = process.env.VERCEL_URL;
  if (dep) return `https://${dep}`;
  return null;
}
