"use client";

import { useState, useTransition } from "react";
import { suggestLinkedin, setLinkedinUrl } from "@/app/(app)/contacts/actions";
import { SearchIcon } from "@/components/icons";

/**
 * Auto-find a contact's LinkedIn profile via Google search, then let the user
 * verify (open it) and save. A candidate is only a best guess — never saved
 * without a click.
 */
export function LinkedinAutoFind({ id }: { id: string }) {
  const [found, setFound] = useState<string | null>(null);
  const [state, setState] = useState<
    "idle" | "none" | "found" | "error" | "saved"
  >("idle");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const find = () =>
    start(async () => {
      setMsg("");
      const r = await suggestLinkedin(id);
      if ("error" in r) {
        setState("error");
        setMsg(r.error);
        return;
      }
      if (!r.url) {
        setState("none");
        return;
      }
      setFound(r.url);
      setState("found");
    });

  const save = () =>
    start(async () => {
      if (found) {
        await setLinkedinUrl(id, found);
        setState("saved");
      }
    });

  if (state === "saved") {
    return <span className="text-xs font-bold text-good">Saved ✓</span>;
  }

  if (state === "found" && found) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={found}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[220px] truncate rounded-[9px] border-2 border-line bg-card px-2 py-1 text-xs font-semibold text-cold hover:underline"
          title={found}
        >
          {found.replace(/^https?:\/\/(www\.)?/, "")} ↗
        </a>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-[9px] border-2 border-ink bg-accent px-2.5 py-1 text-xs font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
        >
          {pending ? "…" : "Use this"}
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-xs font-bold text-faint hover:text-ink"
        >
          Not it
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={find}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-xs font-bold text-ink transition hover:-translate-y-px disabled:opacity-60"
      >
        <SearchIcon />
        {pending ? "Finding…" : "Auto-find"}
      </button>
      {state === "none" && (
        <span className="text-xs text-faint">No match</span>
      )}
      {state === "error" && (
        <span className="max-w-[320px] text-xs font-semibold text-hot" title={msg}>
          {msg}
        </span>
      )}
    </div>
  );
}
