import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side background jobs (sync, voice
 * processing). Bypasses RLS — never import this into client code.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
