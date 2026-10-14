"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signInWithPassword, type LoginState } from "./actions";
import { PUBLIC_ALLOWED_USER_EMAIL } from "@/lib/config";
import { Logo } from "@/components/Logo";

const initialState: LoginState = { ok: false, message: "" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );
  const params = useSearchParams();
  const notAllowed = params.get("error") === "not_allowed";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="win w-full max-w-sm">
        <div className="win-bar win-bar--violet">
          <span className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
            <Logo className="h-5 w-5" />
            MyCRM
          </span>
          <span aria-hidden="true" className="text-xs font-bold text-ink/60">
            sign in
          </span>
        </div>

        <div className="p-7">
          <p className="text-sm text-muted">
            Sign in with your email and password.
          </p>

          {notAllowed && (
            <p className="mt-4 rounded-[10px] border-2 border-ink bg-bary px-3 py-2 text-sm font-semibold text-ink">
              That account isn&apos;t permitted. Sign in with the authorised
              email.
            </p>
          )}

          <form action={formAction} className="mt-6 space-y-3">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={PUBLIC_ALLOWED_USER_EMAIL || "you@example.com"}
              defaultValue={PUBLIC_ALLOWED_USER_EMAIL}
              className="field"
            />
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              className="field"
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-[11px] border-2 border-ink bg-accent px-3 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {state.message && (
            <p
              className={`mt-4 text-sm font-semibold ${
                state.ok ? "text-good" : "text-crit"
              }`}
            >
              {state.message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
