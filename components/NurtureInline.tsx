"use client";

import { useState, useTransition } from "react";
import {
  draftNurture,
  markNurtured,
  type Draft,
} from "@/app/(app)/nurture/actions";
import { PencilIcon, LinkedinIcon } from "@/components/icons";

/**
 * Compact "draft a personal note" control for the Keep-in-touch list. Click to
 * AI-draft a reconnection email, edit it, open it in your mail client (or copy
 * it for LinkedIn), then mark it sent (which resets the contact's clock and
 * drops them off the list).
 */
export function NurtureInline({
  id,
  email,
  name,
  linkedinUrl,
}: {
  id: string;
  email: string | null;
  name: string;
  linkedinUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [guidance, setGuidance] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [liCopied, setLiCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const generate = (guide?: string) =>
    start(async () => {
      setErr(null);
      setOpen(true);
      const r = await draftNurture(
        id,
        guide?.trim()
          ? { guidance: guide, previous: draft ?? { subject, body } }
          : undefined,
      );
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setDraft(r);
      setSubject(r.subject);
      setBody(r.body);
      setGuidance("");
    });

  const mailto =
    email && (subject || body)
      ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : undefined;

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // LinkedIn has no way to pre-fill a message like mailto does, so copy the body
  // and open their profile — one tap to Message + paste. Open the window first,
  // synchronously within the click, so it isn't caught by the popup blocker.
  const openLinkedin = () => {
    if (!linkedinUrl) return;
    window.open(linkedinUrl, "_blank", "noopener,noreferrer");
    navigator.clipboard
      .writeText(body)
      .then(() => {
        setLiCopied(true);
        setTimeout(() => setLiCopied(false), 2500);
      })
      .catch(() => {});
  };

  const markSent = () => start(async () => { await markNurtured(id); setSent(true); });

  if (sent) {
    return <span className="text-xs font-bold text-good">Note sent ✓</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => generate()}
        disabled={pending}
        title={`Draft a personal note to ${name}`}
        className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-ink bg-card px-2.5 py-1 text-xs font-bold text-ink transition hover:-translate-y-px disabled:opacity-60"
      >
        <PencilIcon className="h-3.5 w-3.5" />
        {pending ? "Drafting…" : "Draft note"}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-[10px] border-2 border-line bg-desktop p-3">
      {err && <p className="text-xs font-semibold text-hot">{err}</p>}
      {!draft && pending && <p className="text-xs text-muted">Drafting a personal note…</p>}
      {draft && (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="field text-xs"
            aria-label="Subject"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="field text-xs"
            aria-label="Message"
          />
          <div className="flex items-center gap-1.5">
            <input
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && guidance.trim() && !pending) {
                  e.preventDefault();
                  generate(guidance);
                }
              }}
              placeholder="Tell the AI how to redraft (e.g. shorter, mention…)"
              className="field flex-1 text-xs"
              aria-label="Redraft instructions"
            />
            <button
              type="button"
              onClick={() => generate(guidance)}
              disabled={pending}
              className="rounded-[9px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px disabled:opacity-60"
            >
              {pending ? "…" : guidance.trim() ? "Redraft" : "New draft"}
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
            {linkedinUrl && (
              <button
                type="button"
                onClick={openLinkedin}
                title="Copy the note and open their LinkedIn profile to paste it as a message"
                className="inline-flex items-center gap-1.5 rounded-[9px] border-2 border-ink bg-tli px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px"
              >
                <LinkedinIcon className="h-3.5 w-3.5" />
                {liCopied ? "Copied — paste in LinkedIn" : "LinkedIn"}
              </button>
            )}
            <button
              type="button"
              onClick={copy}
              className="rounded-[9px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button
              type="button"
              onClick={markSent}
              disabled={pending}
              className="ml-auto rounded-[9px] border-2 border-ink bg-good px-3 py-1 text-xs font-bold text-white transition hover:-translate-y-px disabled:opacity-60"
            >
              Mark sent
            </button>
          </div>
        </>
      )}
    </div>
  );
}
