import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeAndStore } from "@/lib/graph";
import { createClient } from "@/lib/supabase/server";
import { authTenantId } from "@/lib/tenant";

/**
 * Microsoft OAuth callback. Verifies the CSRF state, exchanges the code for
 * tokens, and stores the refresh token in sync_state.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");
  const cookieState = request.cookies.get("ms_oauth_state")?.value;

  const back = (q: string) => NextResponse.redirect(`${origin}/settings?${q}`);

  if (err) {
    return back(`ms_error=${encodeURIComponent(err)}`);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return back("ms_error=state_mismatch");
  }

  const supabase = await createClient();
  const tenantId = await authTenantId(supabase);
  if (!tenantId) return back("ms_error=no_tenant");

  try {
    await exchangeCodeAndStore(code, tenantId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    return back(`ms_error=${encodeURIComponent(msg)}`);
  }

  const res = back("ms_connected=1");
  res.cookies.delete("ms_oauth_state");
  return res;
}
