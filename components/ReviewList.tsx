"use client";

import { useMemo, useState, useTransition } from "react";
import { acceptSuggestions, rejectSuggestions } from "@/app/(app)/actions";
import { SuggestionRow } from "@/components/SuggestionRow";
import type { Suggestion } from "@/lib/types";

export function ReviewList({ suggestions }: { suggestions: Suggestion[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Deterministic order (crawl inserts share a timestamp): most threads first,
  // then most recently seen, then id.
  const rows = useMemo(
    () =>
      [...suggestions].sort((a, b) => {
        const t = (b.payload.thread_count ?? 0) - (a.payload.thread_count ?? 0);
        if (t) return t;
        const ls = (b.payload.last_seen ?? "").localeCompare(a.payload.last_seen ?? "");
        if (ls) return ls;
        return a.id.localeCompare(b.id);
      }),
    [suggestions],
  );

  // A row being edited can't be bulk-selected (its edits would be lost).
  const selectable = rows.filter((r) => r.id !== editingId);
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const count = selected.size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));
  }

  function toggleEdit(id: string) {
    setEditingId((cur) => (cur === id ? null : id));
    // Opening an editor deselects that row so it can't also be bulk-accepted.
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function bulk(fn: (ids: string[]) => Promise<void>) {
    const ids = [...selected];
    if (!ids.length) return;
    startTransition(async () => {
      await fn(ids);
      setSelected(new Set());
    });
  }

  return (
    <div>
      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-line px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 accent-accent"
            aria-label="Select all"
          />
          Select all
        </label>
        <span className="text-xs tabular-nums text-muted">
          {count > 0 ? `${count} selected` : `${rows.length} pending`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={count === 0 || pending}
            onClick={() => bulk(acceptSuggestions)}
            className="rounded-[10px] border-2 border-ink bg-ink px-3 py-1 text-xs font-bold text-card transition hover:-translate-y-px disabled:opacity-45 disabled:hover:translate-y-0"
          >
            {pending ? "Working…" : `Accept selected${count ? ` (${count})` : ""}`}
          </button>
          <button
            type="button"
            disabled={count === 0 || pending}
            onClick={() => bulk(rejectSuggestions)}
            className="rounded-[10px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px disabled:opacity-45 disabled:hover:translate-y-0"
          >
            Reject selected{count ? ` (${count})` : ""}
          </button>
        </div>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-line">
        {rows.map((s) => {
          const isEditing = editingId === s.id;
          return (
            <li key={s.id} className="flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                disabled={isEditing}
                onChange={() => toggle(s.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-accent disabled:opacity-30"
                aria-label={`Select ${s.payload.name || s.payload.email}`}
              />
              <SuggestionRow
                suggestion={s}
                editing={isEditing}
                onToggleEdit={() => toggleEdit(s.id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
