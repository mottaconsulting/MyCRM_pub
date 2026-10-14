import "server-only";

/**
 * Minimal Google Gemini client (plain fetch, no SDK). Returns validated JSON
 * for a given prompt + response schema, or null if not configured / empty.
 * The model defaults to the rolling "latest flash" alias so it isn't pinned
 * to a version that gets retired; override with GEMINI_MODEL.
 */
const DEFAULT_MODEL = "gemini-flash-latest";

/**
 * House style applied to EVERY Gemini call (as a system instruction), so all
 * generated text — summaries, nurture notes, campaign emails — follows it.
 */
const STYLE_INSTRUCTION =
  "Always write in Australian English and never use American spelling " +
  "(use organise, colour, centre, recognise, apologise, licence, enrol, etc.). " +
  "Never use em dashes (—) or en dashes (–) anywhere in your output; " +
  "use a comma, a full stop, or a separate sentence instead.";

export async function geminiJson<T>(
  prompt: string,
  responseSchema: object,
): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null; // not configured — caller treats as "no enrichment"

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: STYLE_INSTRUCTION }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text) as T;
}
