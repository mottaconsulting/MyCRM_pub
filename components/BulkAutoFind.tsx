"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { autoFindLinkedinBatch } from "@/app/(app)/contacts/actions";

type Result = Awaited<ReturnType<typeof autoFindLinkedinBatch>>;

/**
 * Bulk LinkedIn Auto-find. Processes up to BATCH contacts per click (quota-
 * aware — each is one Serper search), auto-applying confident hits. Applied
 * profiles are best guesses; spot-check any that matter.
 */
export function BulkAutoFind({ remaining }: { remaining: number }) {
  const BATCH = 20;
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setResult(await autoFindLinkedinBatch(BATCH));
    });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending || remaining === 0}
        className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
      >
        {pending
          ? "Searching…"
          : `Auto-find next ${Math.min(BATCH, remaining)} (of ${remaining})`}
      </button>
      <p className="text-xs text-faint">
        Uses up to {BATCH} Serper searches per run (2,500 free/month). Applied
        profiles are best guesses — spot-check important ones.
      </p>

      {result && (
        <div className="rounded-[10px] border-2 border-line bg-card p-3 text-xs">
          {result.error ? (
            <p className="font-semibold text-hot">{result.error}</p>
          ) : (
            <>
              <p className="font-bold text-ink">
                Applied {result.applied.length} of {result.processed} ·{" "}
                {result.remaining} still without a URL
              </p>
              {result.applied.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {result.applied.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contacts/${a.id}`}
                        className="font-semibold text-ink hover:underline"
                      >
                        {a.name}
                      </Link>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-cold hover:underline"
                      >
                        {a.url.replace(/^https?:\/\/(www\.)?/, "")} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
