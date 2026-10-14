"use client";

import { useState, useTransition } from "react";
import { startBackgroundEnrich } from "@/app/(app)/settings/actions";

/**
 * Starts the server-side enrichment drain and returns immediately. Unlike the
 * browser loop, this keeps running on the server after you close the tab.
 */
export function BackgroundEnrichButton() {
  const [state, setState] = useState<"idle" | "started" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await startBackgroundEnrich();
      if (r.ok) setState("started");
      else {
        setState("error");
        setMsg(r.error ?? "Could not start.");
      }
    });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending || state === "started"}
        className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending
          ? "Starting…"
          : state === "started"
            ? "Running on the server ✓"
            : "Enrich everyone (runs on the server)"}
      </button>
      {state === "started" && (
        <p className="text-xs text-muted">
          Enrichment is running on the server — you can close this tab. Refresh
          Settings later to watch the remaining count fall.
        </p>
      )}
      {state === "error" && (
        <p className="text-xs font-semibold text-crit">{msg}</p>
      )}
    </div>
  );
}
