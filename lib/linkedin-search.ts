import "server-only";
import { searchWebRaw } from "@/lib/web-search";

/**
 * Find a likely LinkedIn profile URL for a person via a web search backend
 * (Serper.dev or Google Programmable Search — see lib/web-search). Reads public
 * search results only; never touches LinkedIn's API or scrapes LinkedIn. Returns
 * the top /in/ profile hit, or null. Throws on a search-API error.
 */
export async function searchLinkedinUrl(
  name: string,
  company: string | null,
): Promise<string | null> {
  const q = `${name} ${company ?? ""} site:linkedin.com/in`.trim();
  const results = await searchWebRaw(q, 5);
  for (const r of results) {
    const m = r.link.match(
      /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+/i,
    );
    if (m) return m[0].replace(/\/+$/, "");
  }
  return null;
}
