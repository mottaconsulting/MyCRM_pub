"use client";

import { useRouter } from "next/navigation";

/**
 * Goes back to the previous page (restoring its scroll position — so you land
 * where you were in the contacts list), falling back to a URL if there's no
 * history.
 */
export function BackButton({
  fallback = "/contacts",
  label = "← Back",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="text-xs font-bold text-muted transition hover:text-ink hover:underline"
    >
      {label}
    </button>
  );
}
