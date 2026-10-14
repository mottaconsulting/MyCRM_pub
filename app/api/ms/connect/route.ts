import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl } from "@/lib/graph";

/**
 * Start the Microsoft consent flow. Protected by middleware (only the allowed
 * user reaches it). Stores a CSRF state in an httpOnly cookie for the callback.
 */
export async function GET(request: NextRequest) {
  let url: string;
  const state = crypto.randomUUID();
  try {
    url = buildAuthUrl(state);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config_error";
    return NextResponse.redirect(
      `${request.nextUrl.origin}/settings?ms_error=${encodeURIComponent(msg)}`,
    );
  }

  const res = NextResponse.redirect(url);
  res.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
