"use client";

import { useState, useTransition } from "react";
import { updateInteractionNote } from "@/app/(app)/contacts/actions";

/**
 * Inline, editable note on a single timeline item (especially meetings). Shows
 * the saved note when present, otherwise a subtle "add note" affordance.
 */
export function InteractionNote({
  id,
  note,
}: {
  id: string;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(note ?? "");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      await updateInteractionNote(id, val);
      setEditing(false);
    });

  if (!editing) {
    return note ? (
      <div className="mt-2 rounded-[10px] border-2 border-warm/50 bg-bary/60 p-2.5">
        <div className="whitespace-pre-line text-xs text-ink">{note}</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1.5 text-xs font-bold text-accent hover:underline"
        >
          Edit note
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1.5 text-xs font-bold text-faint hover:text-accent hover:underline"
      >
        ＋ Add note
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={2}
        autoFocus
        placeholder="Your note on this…"
        className="field text-xs"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-[9px] border-2 border-ink bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        <button
          type="button"
          onClick={() => {
            setVal(note ?? "");
            setEditing(false);
          }}
          className="text-xs font-bold text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
