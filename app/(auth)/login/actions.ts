"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  ok: boolean;
  message: string;
};

/**
 * Password sign-in. Any Supabase-authenticated user may sign in; per-tenant RLS
 * (tenant_id = auth_tenant_id()) isolates what they can see, and a user without
 * a profile simply lands on an empty app. On success the session cookie is set
 * and the user is redirected to the dashboard — no email round-trip, so it
 * avoids Supabase's rate-limited built-in mailer.
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, message: "Incorrect email or password." };
  }

  // redirect() throws NEXT_REDIRECT; the Set-Cookie from sign-in rides along.
  redirect("/");
}

/**
 * Magic-link sign-in (kept as a fallback; not used by the current login UI).
 */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { ok: false, message: "Enter your email address." };
  }

  const hdrs = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Check your inbox for the sign-in link." };
}
