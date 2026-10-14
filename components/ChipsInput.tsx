"use client";

import { useState } from "react";

/**
 * Edits a list of short values (emails, phone numbers) as removable chips and
 * submits them through a single hidden input as a comma-joined string, so the
 * existing form action (which already parses comma-separated values) needs no
 * change. Add a value with Enter or comma; Backspace on an empty box removes the
 * last chip. The first chip is the primary.
 */
export function ChipsInput({
  name,
  initial,
  placeholder,
  inputMode,
}: {
  name: string;
  initial: string[];
  placeholder?: string;
  inputMode?: "email" | "tel" | "text";
}) {
  const [items, setItems] = useState<string[]>(initial.filter(Boolean));
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      setItems((cur) => {
        const next = [...cur];
        for (const p of parts) {
          if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
        }
        return next;
      });
    }
    setDraft("");
  };

  const remove = (i: number) =>
    setItems((cur) => cur.filter((_, idx) => idx !== i));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && items.length) {
      remove(items.length - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-[11px] border-2 border-line bg-card px-2 py-1.5 focus-within:border-accent">
      <input type="hidden" name={name} value={items.join(", ")} />
      {items.map((it, i) => (
        <span
          key={`${it}-${i}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full border-2 border-line bg-desktop py-0.5 pl-2.5 pr-1 text-xs font-semibold text-ink"
        >
          <span className="min-w-0 break-all">{it}</span>
          {i === 0 && items.length > 1 && (
            <span className="shrink-0 text-[9px] font-bold uppercase text-faint">
              primary
            </span>
          )}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${it}`}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-critbg hover:text-crit"
          >
            &#10005;
          </button>
        </span>
      ))}
      <input
        type="text"
        inputMode={inputMode ?? "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={items.length ? "Add another…" : placeholder}
        className="min-w-[10ch] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-ink outline-none"
      />
    </div>
  );
}
