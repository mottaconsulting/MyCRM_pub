"use client";

import { useState, useTransition } from "react";
import { mergeContacts } from "@/app/(app)/contacts/actions";

export type DupContact = {
  id: string;
  name: string;
  emails: string[];
  company: string | null;
  role: string | null;
  last_contact_at: string | null;
  hasLinkedin: boolean;
};

/**
 * One potential-duplicate group: pick which record to keep, merge the rest in.
 * Same-name people who are genuinely different (e.g. two "Jane Smith"s) are
 * simply left alone — nothing merges until you choose and confirm.
 */
export function MergeGroup({
  contacts,
  sameEmail = false,
}: {
  contacts: DupContact[];
  sameEmail?: boolean;
}) {
  const [keeper, setKeeper] = useState(contacts[0].id);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const losers = contacts.filter((c) => c.id !== keeper);
  const keeperName = contacts.find((c) => c.id === keeper)?.name ?? "";
  const plural = losers.length === 1 ? "" : "s";

  const doMerge = () =>
    start(async () => {
      await mergeContacts(
        keeper,
        losers.map((c) => c.id),
      );
      setDone(true);
    });

  if (done) {
    return (
      <div className="win">
        <div className="win-bar win-bar--mint">
          <span className="text-[15px] font-bold text-ink">
            {contacts[0].name} · merged ✓
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="win">
      <div className="win-bar win-bar--yellow">
        <span className="text-[15px] font-bold text-ink">
          {contacts[0].name} · {contacts.length} records
        </span>
        {sameEmail && (
          <span className="rounded-full border-2 border-hot bg-card px-2 py-0.5 text-[11px] font-bold text-hot">
            same email
          </span>
        )}
      </div>
      <ul className="divide-y divide-line">
        {contacts.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-temail">
              <input
                type="radio"
                name={`keep-${contacts[0].id}`}
                checked={keeper === c.id}
                onChange={() => setKeeper(c.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">
                  {[c.role, c.company].filter(Boolean).join(" · ") || "—"}
                  {c.hasLinkedin && (
                    <span className="ml-2 text-xs font-semibold text-cold">
                      in
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted">
                  {c.emails.join(", ") || "no email"}
                </div>
              </div>
            </label>
          </li>
        ))}
      </ul>
      {confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line bg-bary/50 px-4 py-3">
          <span className="min-w-0 flex-1 text-xs font-semibold text-ink">
            Merge {losers.length} record{plural} into{" "}
            <span className="font-bold">{keeperName}</span>? Emails and history
            move over; the duplicate{plural} {plural ? "are" : "is"} deleted.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={doMerge}
              disabled={pending}
              className="rounded-[10px] border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
            >
              {pending ? "Merging…" : "Yes, merge"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-[10px] border-2 border-line bg-card px-3 py-1.5 text-sm font-bold text-muted transition hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-faint">
            Keep the selected record; merge the rest into it.
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-[10px] border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
          >
            Merge into selected
          </button>
        </div>
      )}
    </div>
  );
}
