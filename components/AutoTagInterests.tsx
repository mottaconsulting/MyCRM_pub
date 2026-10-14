"use client";

import { useState, useTransition } from "react";
import { autoTagInterestsBatch } from "@/app/(app)/settings/actions";
import { SparkleIcon } from "@/components/icons";

/**
 * Runs the AI interest-tagger over all not-yet-tagged contacts, batch by batch,
 * until none remain — showing running progress. Only adds interests from the
 * master list; never touches contacts you've already tagged.
 */
export function AutoTagInterests() {
  const [running, setRunning] = useState(false);
  const [tagged, setTagged] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [, start] = useTransition();

  const run = () =>
    start(async () => {
      setRunning(true);
      setError(null);
      setDone(false);
      setTagged(0);
      setProcessed(0);
      // Loop until nothing is left to tag (cap iterations as a safety net).
      try {
        for (let i = 0; i < 100; i++) {
          const r = await autoTagInterestsBatch(20);
          if (r.error) {
            setError(r.error);
            break;
          }
          setTagged((t) => t + r.tagged);
          setProcessed((p) => p + r.processed);
          setRemaining(r.remaining);
          if (r.remaining === 0 || r.processed === 0) {
            setDone(true);
            break;
          }
        }
      } catch {
        setError("Something interrupted the run — click again to resume.");
      }
      setRunning(false);
    });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
      >
        <SparkleIcon className="h-4 w-4" />
        {running ? "Tagging…" : "Auto-tag contacts with AI"}
      </button>
      <p className="text-xs text-faint">
        Reads each untagged contact&apos;s role, company and summary and assigns
        matching categories from your list. Only adds tags — it never removes
        ones you set, and skips contacts you&apos;ve already tagged.{" "}
        <span className="font-semibold">
          Keep this tab open while it runs (it works through everyone in
          batches).
        </span>
      </p>
      {(running || done || error) && (
        <p className="text-xs font-semibold text-ink">
          {error ? (
            <span className="text-hot">{error}</span>
          ) : (
            <>
              Tagged {tagged} of {processed} processed
              {remaining !== null && remaining > 0 ? ` · ${remaining} to go` : ""}
              {done ? " · done ✓" : "…"}
            </>
          )}
        </p>
      )}
    </div>
  );
}
