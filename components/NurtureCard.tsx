"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { draftNurture, markNurtured, type Draft } from "@/app/(app)/nurture/actions";
import { PencilIcon, LinkedinIcon } from "@/components/icons";

export type NurtureContact = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  lastContact: string | null;
  linkedinUrl: string | null;
};

export function NurtureCard({ c }: { c: NurtureContact }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [guidance, setGuidance] = useState("");
  const [copied, setCopied] = useState(false);
  const [liCopied, setLiCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  // LinkedIn can't pre-fill a message, so copy the note and open their profile.
  const openLinkedin = () => {
    if (!c.linkedinUrl) return;
    window.open(c.linkedinUrl, "_blank", "noopener,noreferrer");
    navigator.clipboard
      .writeText(body)
      .then(() => {
        setLiCopied(true);
        setTimeout(() => setLiCopied(false), 2500);
      })
      .catch(() => {});
  };

  const generate = (guide?: string) =>
    start(async () => {
      setErr(null);
      const r = await draftNurture(
        c.id,
        guide?.trim()
          ? { guidance: guide, previous: draft ?? { subject, body } }
          : undefined,
      );
      if ("error" in r) { setErr(r.error); return; }
      setDraft(r); setSubject(r.subject); setBody(r.body); setGuidance("");
    });

  const mailto = c.email
    ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : undefined;

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const markSent = () => start(async () => { await markNurtured(c.id); setSent(true); });

  return (
    <div className={`win ${sent ? "opacity-60" : ""}`}>
      <div className="win-bar win-bar--violet flex-wrap gap-1">
        <span className="text-[15px] font-bold text-ink">
          <Link href={`/contacts/${c.id}`} className="hover:underline">{c.name}</Link>
          {c.company && <span className="ml-2 text-xs font-semibold text-muted">{c.company}</span>}
        </span>
        <span className="text-xs text-faint">
          {c.lastContact ? `last contact ${c.lastContact}` : "no contact logged"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {sent ? (
          <p className="text-sm font-semibold text-good">Marked as sent ✓</p>
        ) : !draft ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => generate()}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-[10px] border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-accent-fg transition hover:-translate-y-px disabled:opacity-60"
            >
              <PencilIcon className="h-4 w-4" />
              {pending ? "Drafting…" : "Draft a personal note"}
            </button>
            {err && <span className="text-xs font-semibold text-hot">{err}</span>}
          </div>
        ) : (
          <>
            <div>
              <label className="field-label">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="field" />
            </div>
            <div>
              <label className="field-label">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="field" />
            </div>
            <div>
              <label className="field-label">Redraft instructions (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && guidance.trim() && !pending) {
                      e.preventDefault();
                      generate(guidance);
                    }
                  }}
                  placeholder="e.g. make it shorter, mention the Acme project, more formal…"
                  className="field flex-1"
                  aria-label="Redraft instructions"
                />
                <button
                  type="button"
                  onClick={() => generate(guidance)}
                  disabled={pending}
                  className="shrink-0 rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-sm font-bold text-ink transition hover:-translate-y-px disabled:opacity-60"
                >
                  {pending ? "…" : guidance.trim() ? "Redraft" : "New draft"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mailto && (
                <a
                  href={mailto}
                  className="rounded-[10px] border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
                >
                  Open in email
                </a>
              )}
              {c.linkedinUrl && (
                <button
                  type="button"
                  onClick={openLinkedin}
                  title="Copy the note and open their LinkedIn profile to paste it as a message"
                  className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-ink bg-tli px-3 py-1.5 text-sm font-bold text-ink transition hover:-translate-y-px"
                >
                  <LinkedinIcon className="h-4 w-4" />
                  {liCopied ? "Copied — paste in LinkedIn" : "LinkedIn"}
                </button>
              )}
              <button
                type="button"
                onClick={copy}
                className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-sm font-bold text-ink transition hover:-translate-y-px"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                type="button"
                onClick={markSent}
                disabled={pending}
                className="ml-auto rounded-[10px] border-2 border-ink bg-good px-3 py-1.5 text-sm font-bold text-white transition hover:-translate-y-px disabled:opacity-60"
              >
                Mark as sent
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
