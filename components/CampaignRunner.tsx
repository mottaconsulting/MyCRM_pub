"use client";

import { useState } from "react";
import Link from "next/link";
import {
  draftCampaignEmail,
  markCampaignSent,
  type Draft,
} from "@/app/(app)/campaigns/actions";
import { SparkleIcon } from "@/components/icons";

export type CampaignContact = {
  id: string;
  name: string;
  firstName: string;
  email: string | null;
  company: string | null;
  role: string | null;
};

/**
 * Two campaign modes over the same audience:
 *  - AI personalised: a unique AI-written email per person.
 *  - Template: one email with merge fields ([Name], [Company]…) filled per person
 *    instantly, no AI — ideal for sending to everyone.
 */
export function CampaignRunner({
  contacts,
  ownerFirst = "",
}: {
  contacts: CampaignContact[];
  ownerFirst?: string;
}) {
  const [mode, setMode] = useState<"ai" | "template">("ai");
  const [sent, setSent] = useState<Set<string>>(new Set());

  const markSent = async (id: string) => {
    await markCampaignSent(id);
    setSent((s) => new Set(s).add(id));
  };

  const tab = (active: boolean) =>
    `rounded-[10px] border-2 px-3 py-1.5 text-sm font-bold transition ${
      active
        ? "border-ink bg-ink text-card"
        : "border-line bg-card text-muted hover:border-ink hover:text-ink"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("ai")} className={tab(mode === "ai")}>
          AI personalised
        </button>
        <button
          type="button"
          onClick={() => setMode("template")}
          className={tab(mode === "template")}
        >
          Template (merge fields)
        </button>
      </div>
      {mode === "ai" ? (
        <AiMode contacts={contacts} sent={sent} markSent={markSent} />
      ) : (
        <TemplateMode
          contacts={contacts}
          sent={sent}
          markSent={markSent}
          ownerFirst={ownerFirst}
        />
      )}
    </div>
  );
}

type ModeProps = {
  contacts: CampaignContact[];
  sent: Set<string>;
  markSent: (id: string) => Promise<void>;
  ownerFirst?: string;
};

/* ------------------------------- AI mode -------------------------------- */

type Row = {
  subject: string;
  body: string;
  guidance: string;
  status: "idle" | "drafting" | "done" | "error";
  error?: string;
  copied?: boolean;
};
const emptyRow: Row = { subject: "", body: "", guidance: "", status: "idle" };

function AiMode({ contacts, sent, markSent }: ModeProps) {
  const [brief, setBrief] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [runningAll, setRunningAll] = useState(false);

  const get = (id: string) => rows[id] ?? emptyRow;
  const set = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...get(id), ...patch } }));

  const draftOne = async (id: string, guidance?: string) => {
    if (!brief.trim()) return;
    set(id, { status: "drafting", error: undefined });
    const prev = rows[id];
    const opts =
      guidance && prev
        ? { guidance, previous: { subject: prev.subject, body: prev.body } as Draft }
        : undefined;
    const r = await draftCampaignEmail(id, brief, opts);
    if ("error" in r) set(id, { status: "error", error: r.error });
    else set(id, { subject: r.subject, body: r.body, status: "done", guidance: "" });
  };

  const draftAll = async () => {
    if (!brief.trim() || runningAll) return;
    setRunningAll(true);
    for (const c of contacts) {
      if (rows[c.id]?.status === "done" || sent.has(c.id)) continue;
      await draftOne(c.id);
    }
    setRunningAll(false);
  };

  const doneCount = contacts.filter((c) => rows[c.id]?.status === "done").length;
  const canDraft = brief.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="field-label">Campaign brief</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="What is this campaign about? The message, any offer, and the call to action."
          className="field"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={draftAll}
            disabled={!canDraft || runningAll}
            className="inline-flex items-center gap-2 rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
          >
            <SparkleIcon className="h-4 w-4" />
            {runningAll
              ? `Drafting… ${doneCount}/${contacts.length}`
              : `Draft all ${contacts.length}`}
          </button>
          <span className="text-xs text-faint">
            One AI-written email per person. For a big audience this runs a while —
            keep this tab open.
          </span>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {contacts.map((c) => {
          const row = get(c.id);
          const isSent = sent.has(c.id);
          const mailto =
            c.email && (row.subject || row.body)
              ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(row.subject)}&body=${encodeURIComponent(row.body)}`
              : undefined;
          const copy = async () => {
            await navigator.clipboard.writeText(`Subject: ${row.subject}\n\n${row.body}`);
            set(c.id, { copied: true });
            setTimeout(() => set(c.id, { copied: false }), 1500);
          };
          return (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <Link href={`/contacts/${c.id}`} className="font-bold text-ink hover:underline">
                    {c.name}
                  </Link>
                  {c.company && <span className="ml-2 text-sm text-faint">{c.company}</span>}
                  {!c.email && <span className="ml-2 text-xs font-semibold text-warm">no email</span>}
                </div>
                {isSent ? (
                  <span className="text-xs font-bold text-good">Sent ✓</span>
                ) : row.status === "idle" ? (
                  <button
                    type="button"
                    onClick={() => draftOne(c.id)}
                    disabled={!canDraft}
                    className="rounded-[9px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px disabled:opacity-50"
                  >
                    Draft
                  </button>
                ) : row.status === "drafting" ? (
                  <span className="text-xs font-semibold text-muted">Drafting…</span>
                ) : null}
              </div>

              {row.status === "error" && (
                <p className="mt-1 text-xs font-semibold text-hot">{row.error}</p>
              )}

              {row.status === "done" && !isSent && (
                <div className="mt-2 space-y-2 rounded-[10px] border-2 border-line bg-desktop p-3">
                  <input
                    value={row.subject}
                    onChange={(e) => set(c.id, { subject: e.target.value })}
                    className="field text-xs"
                    aria-label="Subject"
                  />
                  <textarea
                    value={row.body}
                    onChange={(e) => set(c.id, { body: e.target.value })}
                    rows={6}
                    className="field text-xs"
                    aria-label="Message"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      value={row.guidance}
                      onChange={(e) => set(c.id, { guidance: e.target.value })}
                      placeholder="Tweak this one (e.g. shorter, mention…)"
                      className="field flex-1 text-xs"
                      aria-label="Redraft instructions"
                    />
                    <button
                      type="button"
                      onClick={() => draftOne(c.id, row.guidance)}
                      className="rounded-[9px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px"
                    >
                      Redraft
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {mailto && (
                      <a
                        href={mailto}
                        className="rounded-[9px] border-2 border-ink bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition hover:-translate-y-px"
                      >
                        Open in email
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={copy}
                      className="rounded-[9px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px"
                    >
                      {row.copied ? "Copied ✓" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => markSent(c.id)}
                      className="ml-auto rounded-[9px] border-2 border-ink bg-good px-3 py-1 text-xs font-bold text-white transition hover:-translate-y-px"
                    >
                      Mark sent
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------- Template mode ----------------------------- */

function fillTemplate(t: string, c: CampaignContact): string {
  const first = c.firstName || c.name.split(" ")[0] || "";
  return t
    .replace(/\[\s*first\s*name\s*\]/gi, first)
    .replace(/\[\s*first\s*\]/gi, first)
    .replace(/\[\s*name\s*\]/gi, c.name)
    .replace(/\[\s*company\s*\]/gi, c.company ?? "")
    .replace(/\[\s*role\s*\]/gi, c.role ?? "");
}

function TemplateMode({ contacts, sent, markSent, ownerFirst = "" }: ModeProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    `Hi [First name],\n\n\n\nKind regards,\n${ownerFirst}`,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const preview = contacts[0];
  const missingCompany = /\[\s*company\s*\]/i.test(subject + body)
    ? contacts.filter((c) => !c.company).length
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="field-label">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. A quick idea for [Company]"
          className="field"
        />
      </div>
      <div>
        <label className="field-label">Message template</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="field"
        />
        <p className="mt-1 text-xs text-faint">
          Merge fields (filled per person):{" "}
          <span className="font-semibold text-muted">
            [Name] · [First name] · [Company] · [Role]
          </span>
          .
          {missingCompany > 0
            ? ` ${missingCompany} contact${missingCompany === 1 ? "" : "s"} have no company — [Company] will be blank for them.`
            : ""}
        </p>
      </div>

      {preview && (subject.trim() || body.trim()) && (
        <div className="rounded-[10px] border-2 border-line bg-desktop p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-accent">
            Preview · {preview.name}
          </div>
          <div className="mt-1 text-sm font-bold text-ink">
            {fillTemplate(subject, preview) || "(no subject)"}
          </div>
          <div className="mt-1 whitespace-pre-line break-words text-xs text-muted">
            {fillTemplate(body, preview)}
          </div>
        </div>
      )}

      <ul className="divide-y divide-line">
        {contacts.map((c) => {
          const isSent = sent.has(c.id);
          const subj = fillTemplate(subject, c);
          const bod = fillTemplate(body, c);
          const mailto = c.email
            ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bod)}`
            : undefined;
          const copy = async () => {
            await navigator.clipboard.writeText(`Subject: ${subj}\n\n${bod}`);
            setCopiedId(c.id);
            setTimeout(() => setCopiedId(null), 1500);
          };
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/contacts/${c.id}`} className="font-bold text-ink hover:underline">
                  {c.name}
                </Link>
                {c.company && <span className="ml-2 text-sm text-faint">{c.company}</span>}
                {!c.email && <span className="ml-2 text-xs font-semibold text-warm">no email</span>}
              </div>
              {isSent ? (
                <span className="text-xs font-bold text-good">Sent ✓</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {mailto && (
                    <a
                      href={mailto}
                      className="rounded-[9px] border-2 border-ink bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition hover:-translate-y-px"
                    >
                      Open in email
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-[9px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px"
                  >
                    {copiedId === c.id ? "Copied ✓" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => markSent(c.id)}
                    className="rounded-[9px] border-2 border-ink bg-good px-3 py-1 text-xs font-bold text-white transition hover:-translate-y-px"
                  >
                    Mark sent
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
