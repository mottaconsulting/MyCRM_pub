import type { Contact } from "./types";

/** Display name for a contact ("First Last" or just first name). */
export function contactName(c: Pick<Contact, "first_name" | "last_name">): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

/** Split "a@x.com, b@y.com" into a lowercased, de-duped, trimmed array. */
export function normalizeEmails(input: string | null | undefined): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );
}

/**
 * Free / personal webmail domains — a business website can't be inferred from
 * these, and they're rarely a company contact worth a website link.
 */
export const FREE_WEBMAIL = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.au", "outlook.com", "live.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.com.au", "aol.com",
  "bigpond.com", "bigpond.net.au", "optusnet.com.au", "proton.me",
]);

/**
 * Best-guess company website from a contact's email domain, e.g.
 * `jane@example.com` → `https://example.com`. Skips free webmail; returns
 * null if no business-domain email is present.
 */
export function deriveWebsite(
  emails: string[] | null | undefined,
): string | null {
  for (const e of emails ?? []) {
    const domain = (e.split("@")[1] ?? "").trim().toLowerCase();
    if (domain && !FREE_WEBMAIL.has(domain)) return `https://${domain}`;
  }
  return null;
}

/** Split "a, b, c" into a de-duped, trimmed tag array. */
export function normalizeTags(input: string | null | undefined): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
}
