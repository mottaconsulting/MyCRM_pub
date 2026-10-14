/**
 * Normalise a messy correspondent name into first / last / display.
 * Handles the common patterns seen in mail:
 *   - "Last, First"          → "First Last"      (Outlook directory format)
 *   - "andrew.young"         → "Andrew Young"     (email-local style)
 *   - "ANDREW YOUNG"         → "Andrew Young"     (shouty)
 *   - missing name / an email as the name → derive from the email local part
 *   - already-clean "First Last" is preserved (incl. McDonald / O'Brien case).
 */
export function parseContactName(
  rawName: string | null | undefined,
  email: string,
): { first: string; last: string | null; display: string } {
  const local = (email.split("@")[0] ?? email).trim();
  let base = (rawName ?? "").trim();

  // No usable name, or the "name" is actually an address → use the local part.
  if (!base || base.includes("@")) base = local;

  // "Last, First Middle" → "First Middle Last"
  if (base.includes(",")) {
    const [lastPart, ...restParts] = base.split(",");
    const last = lastPart.trim();
    const rest = restParts.join(",").trim();
    base = last && rest ? `${rest} ${last}` : last || rest;
  }

  // Email-local style with separators but no spaces → split into words.
  if (!/\s/.test(base) && /[._-]/.test(base)) {
    base = base.replace(/[._-]+/g, " ");
  }

  const tokens = base.split(/\s+/).map(titleCaseToken).filter(Boolean);
  const first = tokens[0] || titleCaseToken(local);
  const last = tokens.length > 1 ? tokens.slice(1).join(" ") : null;
  const display = tokens.length ? tokens.join(" ") : first;
  return { first, last, display };
}

/**
 * Capitalise all-lower / all-upper tokens (incl. hyphen/apostrophe segments),
 * but leave already-mixed-case tokens untouched so "McDonald" / "DeSilva"
 * survive.
 */
function titleCaseToken(token: string): string {
  const t = token.trim();
  if (!t) return "";
  const allLower = t === t.toLowerCase();
  const allUpper = t === t.toUpperCase();
  if (!allLower && !allUpper) return t; // preserve intentional casing
  return t
    .toLowerCase()
    .replace(/(^|[-'’])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
