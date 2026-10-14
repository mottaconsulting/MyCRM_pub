import { formatDate, formatTime, timeAgo, melbourneDay } from "@/lib/date";
import { INTERACTION_LABELS } from "@/components/ui";
import { InteractionNote } from "@/components/InteractionNote";
import type { Interaction } from "@/lib/types";

const isLinkedin = (t: string) => t === "linkedin_in" || t === "linkedin_out";

function Head({ i }: { i: Interaction }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {INTERACTION_LABELS[i.type]}
        </span>
        <span className="text-xs text-faint" title={formatDate(i.occurred_at)}>
          {timeAgo(i.occurred_at)}
        </span>
      </div>
      {i.subject && (
        <div className="break-words text-sm font-bold text-ink">{i.subject}</div>
      )}
      {i.summary && (
        <div className="break-words text-sm text-muted">{i.summary}</div>
      )}
    </>
  );
}

/** A normal, single timeline entry (email / meeting / call / note / one msg). */
function SingleItem({ i }: { i: Interaction }) {
  const isMeeting = i.type === "meeting";
  const li = isLinkedin(i.type);
  const expandLabel = isMeeting
    ? "Details ▾"
    : li
      ? "Read message ▾"
      : "Read email ▾";
  const openLabel = isMeeting
    ? "Open in calendar →"
    : li
      ? "Open in LinkedIn →"
      : "Open in Outlook →";
  return (
    <>
      {i.body ? (
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <Head i={i} />
            <span className="mt-1 inline-block text-xs font-bold text-accent group-open:hidden">
              {expandLabel}
            </span>
          </summary>
          <div className="mt-2 rounded-[10px] border-2 border-line bg-desktop p-3">
            <div className="max-h-72 overflow-auto whitespace-pre-line break-words text-xs text-ink">
              {i.body}
            </div>
            {i.web_link && (
              <a
                href={i.web_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-bold text-accent hover:underline"
              >
                {openLabel}
              </a>
            )}
          </div>
        </details>
      ) : (
        <Head i={i} />
      )}
      <InteractionNote id={i.id} note={i.note} />
    </>
  );
}

/** Same-day LinkedIn messages collapsed into one conversation thread. */
function LinkedinThread({
  msgs,
  who,
}: {
  msgs: Interaction[]; // newest first
  who: string;
}) {
  const latest = msgs[0];
  const asc = [...msgs].reverse(); // read oldest → newest
  const dir = (m: Interaction) => (m.type === "linkedin_out" ? "You" : who);
  const link = msgs.find((m) => m.web_link)?.web_link ?? null;
  return (
    <>
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              LinkedIn · {msgs.length} messages
            </span>
            <span
              className="text-xs text-faint"
              title={formatDate(latest.occurred_at)}
            >
              {timeAgo(latest.occurred_at)}
            </span>
          </div>
          <div className="truncate text-sm text-muted">
            <span className="font-semibold">{dir(latest)}:</span>{" "}
            {latest.body}
          </div>
          <span className="mt-1 inline-block text-xs font-bold text-accent group-open:hidden">
            Read thread ▾
          </span>
        </summary>
        <div className="mt-2 max-h-96 space-y-2 overflow-auto rounded-[10px] border-2 border-line bg-desktop p-3">
          {asc.map((m) => (
            <div key={m.id}>
              <div className="text-[11px] font-bold text-faint">
                {dir(m)} · {formatTime(m.occurred_at)}
              </div>
              <div className="whitespace-pre-line break-words text-xs text-ink">{m.body}</div>
            </div>
          ))}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-bold text-accent hover:underline"
            >
              Open in LinkedIn →
            </a>
          )}
        </div>
      </details>
      {/* One note for the day's thread, stored on its latest message. */}
      <InteractionNote id={latest.id} note={latest.note} />
    </>
  );
}

/**
 * Contact timeline. Emails / meetings / calls / notes render individually;
 * multiple LinkedIn messages on the same day collapse into one thread item.
 */
export function Timeline({
  interactions,
  contactFirstName,
}: {
  interactions: Interaction[];
  contactFirstName: string;
}) {
  type Row = { ts: string; key: string; node: React.ReactNode };
  const rows: Row[] = [];
  const liByDay = new Map<string, Interaction[]>();

  for (const i of interactions) {
    if (isLinkedin(i.type)) {
      const day = melbourneDay(i.occurred_at);
      if (!liByDay.has(day)) liByDay.set(day, []);
      liByDay.get(day)!.push(i);
    } else {
      rows.push({ ts: i.occurred_at ?? "", key: i.id, node: <SingleItem i={i} /> });
    }
  }
  for (const [day, msgs] of liByDay) {
    msgs.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)); // newest first
    if (msgs.length === 1) {
      rows.push({ ts: msgs[0].occurred_at ?? "", key: msgs[0].id, node: <SingleItem i={msgs[0]} /> });
    } else {
      rows.push({
        ts: msgs[0].occurred_at ?? "",
        key: `li-${day}`,
        node: <LinkedinThread msgs={msgs} who={contactFirstName} />,
      });
    }
  }
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key} className="px-4 py-3">
          {r.node}
        </li>
      ))}
    </ul>
  );
}
