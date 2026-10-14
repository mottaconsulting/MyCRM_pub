"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  saveMeetingNoteAll,
  dismissMeetingAll,
  setMeetingFollowupAll,
} from "@/app/(app)/contacts/actions";
import { BellIcon } from "@/components/icons";

export type MeetingParticipant = {
  id: string;
  name: string;
  interactionId: string;
};

/**
 * One recent meeting, grouped across all attendee-contacts. The note and
 * follow-up apply to the attendees you keep ticked — untick anyone who did not
 * actually attend before saving. Dismiss clears the whole meeting from the list.
 */
export function RecentMeeting({
  participants,
  subject,
  timeLabel,
  note: initialNote,
  followupLabel,
}: {
  participants: MeetingParticipant[];
  subject: string;
  timeLabel: string;
  note: string | null;
  followupLabel: string | null;
}) {
  const [note, setNote] = useState(initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote ?? "");
  const [showDate, setShowDate] = useState(false);
  const [date, setDate] = useState("");
  const [changing, setChanging] = useState(false);
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(participants.map((p) => p.id)),
  );
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setIncluded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Note / follow-up act on the attendees still ticked; Dismiss on the whole set.
  const active = participants.filter((p) => included.has(p.id));
  const activeIids = active.map((p) => p.interactionId);
  const activeCids = active.map((p) => p.id);
  const allIids = participants.map((p) => p.interactionId);

  const defaultReason = subject
    ? `Follow up after "${subject}"`
    : "Follow up after meeting";
  const [reason, setReason] = useState(defaultReason);
  // Instant local confirmation of a just-scheduled follow-up (the server also
  // sets it, but this shows "saved" immediately without waiting for the reload).
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const labelFor = (when: string) => {
    const d = new Date();
    if (when === "1w") d.setDate(d.getDate() + 7);
    else if (when === "1m") d.setMonth(d.getMonth() + 1);
    else if (when === "3m") d.setMonth(d.getMonth() + 3);
    else return fmtDate(new Date(`${when}T00:00:00`));
    return fmtDate(d);
  };

  const saveNote = () =>
    start(async () => {
      if (activeIids.length) await saveMeetingNoteAll(activeIids, draft);
      setNote(draft.trim() || null);
      setEditing(false);
    });
  const schedule = (when: string) => {
    if (!activeCids.length) return;
    const label = labelFor(when);
    start(async () => {
      await setMeetingFollowupAll(activeIids, activeCids, when, reason);
      setSavedLabel(label);
      setChanging(false);
      setShowDate(false);
    });
  };
  const dismiss = () => start(() => dismissMeetingAll(allIids));

  const shownLabel = savedLabel ?? followupLabel;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 pr-2">
          <div className="break-words text-sm font-bold text-ink">
            {subject || "Meeting"}
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted">{timeLabel}</span>
      </div>

      {/* Attendees — untick anyone who didn't attend before saving */}
      {participants.length > 0 && (
        <div className="mt-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {participants.map((p) => {
              const on = included.has(p.id);
              return (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1 rounded-full border-2 border-line px-2 py-0.5 text-xs ${
                    on ? "bg-desktop" : "bg-card"
                  }`}
                >
                  <Link
                    href={`/contacts/${p.id}`}
                    className={`font-semibold hover:underline ${
                      on ? "text-ink" : "text-faint line-through"
                    }`}
                  >
                    {p.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    title={on ? "Didn't attend — exclude" : "Include"}
                    aria-label={on ? `Exclude ${p.name}` : `Include ${p.name}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-faint transition hover:bg-line hover:text-ink"
                  >
                    {on ? "×" : "＋"}
                  </button>
                </span>
              );
            })}
          </div>
          {participants.length > 1 && (
            <p className="mt-1 text-[11px] text-faint">
              Untick anyone who didn&apos;t attend — the note and follow-up only
              apply to those left ticked.
            </p>
          )}
        </div>
      )}

      {/* Note (saved to every participant's timeline) */}
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Note (added to each participant)…"
            className="field text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveNote}
              disabled={pending}
              className="rounded-[9px] border-2 border-ink bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save note"}
            </button>
            <button
              type="button"
              onClick={() => { setDraft(note ?? ""); setEditing(false); }}
              className="text-xs font-bold text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : note ? (
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
      )}

      {/* Follow-up + dismiss (whole meeting) */}
      {shownLabel && !changing ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border-2 border-good/50 bg-good/10 px-2.5 py-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-good">
            <BellIcon className="h-3.5 w-3.5" /> Follow-up saved · {shownLabel}
          </span>
          {reason.trim() && (
            <span className="min-w-0 truncate text-xs text-muted">
              “{reason.trim()}”
            </span>
          )}
          <button
            type="button"
            onClick={() => { setChanging(true); setSavedLabel(null); }}
            className="text-xs font-bold text-accent hover:underline"
          >
            Change
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold text-faint transition hover:text-ink disabled:opacity-60"
          >
            {pending ? "…" : "Dismiss"}
          </button>
        </div>
      ) : (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-1 text-xs font-semibold text-muted">
          <BellIcon className="h-3.5 w-3.5" /> Schedule a follow-up
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason / title (e.g. “Lunch catch-up”, “Send proposal”)"
          className="field text-xs"
          aria-label="Follow-up reason"
        />
        <div className="flex flex-wrap items-center gap-1.5">
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
      </div>
      )}
    </li>
  );
}
