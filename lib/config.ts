/**
 * App-wide configuration and constants.
 *
 * Only values prefixed with NEXT_PUBLIC_ are safe to read in client components.
 * Everything else must only ever be imported into server code.
 */

/** Timezone used for all date display and "today" logic (per spec §12). */
export const APP_TIMEZONE = "Australia/Melbourne";

/**
 * Email pre-filled on the login form as a convenience. Multi-tenant: this is
 * NOT an access gate — any authenticated user may sign in and RLS isolates
 * their data. Empty unless NEXT_PUBLIC_ALLOWED_USER_EMAIL is set.
 */
export const PUBLIC_ALLOWED_USER_EMAIL = (
  process.env.NEXT_PUBLIC_ALLOWED_USER_EMAIL ?? ""
)
  .trim()
  .toLowerCase();
