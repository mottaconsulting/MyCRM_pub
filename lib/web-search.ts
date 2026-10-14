import "server-only";

export type WebSnippet = { title: string; snippet: string; link: string };

/**
 * Web search with two possible backends, in priority order:
 *  1. Serper.dev (SERPER_API_KEY) — one key, no Google Cloud project/enable dance.
 *  2. Google Programmable Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX).
 * Throws on an API error or if neither is configured — callers that want
 * best-effort behaviour should use searchWeb (which swallows errors).
 */
export async function searchWebRaw(
  query: string,
  num = 4,
  dateRestrict?: string, // e.g. "m3" = last 3 months
): Promise<WebSnippet[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    const body: Record<string, unknown> = { q: query, num };
    if (dateRestrict) body.tbs = "qdr:m"; // Serper: recency bias (past month)
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 140)}`);
    }
    const data = (await res.json()) as {
      organic?: { title?: string; snippet?: string; link?: string }[];
    };
    return (data.organic ?? []).slice(0, num).map((o) => ({
      title: (o.title ?? "").trim(),
      snippet: (o.snippet ?? "").replace(/\s+/g, " ").trim(),
      link: o.link ?? "",
    }));
  }

  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (key && cx) {
    const url =
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}` +
      `&num=${num}&q=${encodeURIComponent(query)}` +
      (dateRestrict ? `&dateRestrict=${dateRestrict}` : "");
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Google search ${res.status}: ${(await res.text()).slice(0, 140)}`,
      );
    }
    const data = (await res.json()) as {
      items?: { title?: string; snippet?: string; link?: string }[];
    };
    return (data.items ?? []).slice(0, num).map((it) => ({
      title: (it.title ?? "").trim(),
      snippet: (it.snippet ?? "").replace(/\s+/g, " ").trim(),
      link: it.link ?? "",
    }));
  }

  throw new Error(
    "Web search not configured — set SERPER_API_KEY (recommended) or GOOGLE_CSE_KEY + GOOGLE_CSE_CX.",
  );
}

/** Best-effort variant: returns [] instead of throwing (used by nurture). */
export async function searchWeb(
  query: string,
  num = 4,
  dateRestrict?: string,
): Promise<WebSnippet[]> {
  if (!query.trim()) return [];
  try {
    return await searchWebRaw(query, num, dateRestrict);
  } catch {
    return [];
  }
}
