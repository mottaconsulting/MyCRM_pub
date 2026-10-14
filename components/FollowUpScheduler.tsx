"use client";

import { useState, useTransition } from "react";
import { scheduleFollowup, clearFollowup } from "@/app/(app)/contacts/actions";

const chip =
  "rounded-[10px] border-2 border-line bg-card px-2.5 py-1 text-xs font-bold text-ink transition hover:border-ink hover:-translate-y-px";
const chipReason =
  "rounded-full border-2 border-line bg-desktop px-2.5 py-0.5 text-xs font-semibold text-muted transition hover:border-ink hover:text-ink";
const primary =
  "rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0";
const ghost =
  "rounded-[11px] border-2 border-ink bg-card px-3 py-2 text-sm font-bold text-ink transition hover:-translate-y-px";

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function FollowUpScheduler({
  id,
  current,
  currentReason,
}: {
  id: string;
  current: string | null;
  currentReason: string | null;
}) {
  const [date, setDate] = useState(current ?? "");
  const [reason, setReason] = useState(currentReason ?? "");
  const [pending, start] = useTransition();

  const save = () => {
    if (!date) return;
    start(() => scheduleFollowup(id, date, reason));
  };
  const clear = () => {
    setDate("");
    setReason("");
    start(() => clearFollowup(id));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setDate(isoInDays(0))} className={chip}>
          Today
        </button>
        <button type="button" onClick={() => setDate(isoInDays(1))} className={chip}>
          Tomorrow
        </button>
        <button type="button" onClick={() => setDate(isoInDays(7))} className={chip}>
          +1 week
        </button>
        <button type="button" onClick={() => setDate(isoInDays(14))} className={chip}>
          +2 weeks
        </button>
        <button type="button" onClick={() => setDate(isoInDays(30))} className={chip}>
          +1 month
        </button>
        <button type="button" onClick={() => setDate(isoInDays(90))} className={chip}>
          +3 months
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="field-label">When</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="field-label">Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Call about proposal"
            className="field"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["Call", "Email", "Coffee", "Send proposal"].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={chipReason}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending || !date} className={primary}>
          {current ? "Update follow-up" : "Schedule follow-up"}
        </button>
        {current && (
          <button type="button" onClick={clear} disabled={pending} className={ghost}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
