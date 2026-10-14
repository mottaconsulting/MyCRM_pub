"use client";

import { useState, useTransition } from "react";
import {
  setMeetingFollowup,
  dismissMeetingReview,
} from "@/app/(app)/contacts/actions";
import { BellIcon } from "@/components/icons";

/**
 * Post-meeting control: schedule a follow-up (quick period or a specific date),
 * or dismiss the meeting. Any choice marks the meeting reviewed so it drops off
 * the dashboard Recent-meetings list on the next render.
 */
export function MeetingFollowup({
  interactionId,
  contactId,
  subject,
}: {
  interactionId: string;
  contactId: string;
  subject: string | null;
}) {
  const [showDate, setShowDate] = useState(false);
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();

  const reason = subject ? `Follow up after "${subject}"` : "Follow up after meeting";

  const schedule = (when: string) =>
    start(async () => {
      await setMeetingFollowup(interactionId, contactId, when, reason);
    });
  const dismiss = () => start(async () => { await dismissMeetingReview(interactionId); });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
        <BellIcon className="h-3.5 w-3.5" /> Follow up
      </span>
      {(
        [
          ["1w", "1 week"],
          ["1m", "1 month"],
          ["3m", "3 months"],
        ] as const
      ).map(([p, label]) => (
        <button
          key={p}
          type="button"
          onClick={() => schedule(p)}
          disabled={pending}
          className="rounded-full border-2 border-line bg-card px-2.5 py-0.5 text-xs font-bold text-ink transition hover:-translate-y-px hover:border-ink disabled:opacity-60"
        >
          {label}
        </button>
      ))}

      {showDate ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-[9px] border-2 border-line bg-card px-2 py-0.5 text-xs font-semibold text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => date && schedule(date)}
            disabled={pending || !date}
            className="rounded-full border-2 border-ink bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
          >
            Set
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setShowDate(true)}
          disabled={pending}
          className="rounded-full border-2 border-line bg-card px-2.5 py-0.5 text-xs font-bold text-ink transition hover:-translate-y-px hover:border-ink disabled:opacity-60"
        >
          Pick date…
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold text-faint transition hover:text-ink disabled:opacity-60"
      >
        {pending ? "…" : "Dismiss"}
      </button>
    </div>
  );
}
