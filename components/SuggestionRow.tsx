"use client";

import { acceptSuggestion, rejectSuggestion } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/date";
import { parseContactName } from "@/lib/names";
import type { Suggestion } from "@/lib/types";

const ghost =
  "rounded-[10px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px";
const dark =
  "rounded-[10px] border-2 border-ink bg-ink px-3 py-1 text-xs font-bold text-card transition hover:-translate-y-px";
const accent =
  "rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px";

export function SuggestionRow({
  suggestion: s,
  editing,
  onToggleEdit,
}: {
  suggestion: Suggestion;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const { first, last, display } = parseContactName(s.payload.name, s.payload.email);
  const domain = s.payload.domain ?? s.payload.email.split("@")[1] ?? "";
  const threads = s.payload.thread_count ?? 0;
  const subjects = s.payload.sample_subjects ?? [];
  const defTags = s.source === "catchup" ? "catch-up" : "";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">{display}</div>
          <div className="truncate text-xs text-muted">
            {s.payload.email}
            {(s.payload.emails?.length ?? 0) > 1 && (
              <span className="text-faint"> +{s.payload.emails!.length - 1} address</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
            {domain && <span>{domain}</span>}
            {domain && <span aria-hidden="true">·</span>}
            <span className="tabular-nums">
              {threads} {threads === 1 ? "thread" : "threads"}
            </span>
            {s.payload.last_seen && (
              <>
                <span aria-hidden="true">·</span>
                <span>seen {formatDate(s.payload.last_seen)}</span>
              </>
            )}
          </div>
          {subjects.length > 0 && (
            <div className="mt-0.5 truncate text-xs italic text-faint">
              {subjects.join(" · ")}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={onToggleEdit} className={ghost}>
            {editing ? "Cancel" : "Edit"}
          </button>
          {!editing && (
            <form action={acceptSuggestion}>
              <input type="hidden" name="id" value={s.id} />
              <SubmitButton className={dark} pendingText="Adding…">
                Accept
              </SubmitButton>
            </form>
          )}
          <form action={rejectSuggestion}>
            <input type="hidden" name="id" value={s.id} />
            <SubmitButton className={ghost}>Reject</SubmitButton>
          </form>
        </div>
      </div>

      {editing && (
        <form
          action={acceptSuggestion}
          className="mt-3 grid grid-cols-1 gap-2 rounded-[12px] border-2 border-line bg-desktop p-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={s.id} />
          <div>
            <label className="field-label">First name</label>
            <input name="first_name" defaultValue={first} className="field" />
          </div>
          <div>
            <label className="field-label">Last name</label>
            <input name="last_name" defaultValue={last ?? ""} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Emails (comma separated)</label>
            <input
              name="emails"
              defaultValue={(s.payload.emails ?? [s.payload.email]).join(", ")}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">Company</label>
            <input
              name="company"
              defaultValue={s.payload.company_guess ?? ""}
              placeholder={domain}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">Role</label>
            <input name="role" className="field" />
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input name="phone" className="field" />
          </div>
          <div>
            <label className="field-label">Tags (comma separated)</label>
            <input name="tags" defaultValue={defTags} className="field" />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className={accent} pendingText="Saving…">
              Save &amp; accept
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
