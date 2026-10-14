"use client";

import { useState } from "react";
import { syncBatch } from "@/app/(app)/settings/actions";

/**
 * Runs the enrichment in a loop (3 contacts per batch) until everyone's done,
 * so a big backlog (e.g. a fresh import of hundreds) enriches from one click.
 * A transient batch error is retried once before giving up, and progress is
 * never lost — re-clicking resumes from whoever's still un-enriched. Keep the
 * tab open while it runs.
 */
export function AutoSync() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setFinished(false);
    setError(null);
    setDone(0);
    let total = 0;
    try {
      for (let i = 0; i < 400; i++) {
        let r;
        try {
          r = await syncBatch();
        } catch {
          // One retry for a transient blip (token refresh, slow batch) so a
          // long run doesn't abort on a single hiccup.
          r = await syncBatch();
        }
        total += r.synced;
        setDone(total);
        setRemaining(r.remaining);
        if (r.remaining === 0 || r.synced === 0) break;
      }
      setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {running ? "Syncing…" : "Sync all contacts (auto)"}
      </button>
      {(running || finished) && !error && (
        <p className="text-xs text-muted">
          Enriched {done}
          {remaining !== null ? ` · ${remaining} remaining` : ""}
          {finished ? " · done ✓" : "…"}
        </p>
      )}
      {error && <p className="text-xs font-semibold text-crit">{error}</p>}
    </div>
  );
}
