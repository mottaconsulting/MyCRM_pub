import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import { SectionCard, EmptyState } from "@/components/ui";
import { LinkedinIcon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { setLinkedin } from "@/app/(app)/contacts/actions";
import { LinkedinAutoFind } from "@/components/LinkedinAutoFind";
import { BulkAutoFind } from "@/components/BulkAutoFind";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
// Bulk Auto-find loops several searches server-side.
export const maxDuration = 60;

export default async function LinkedinMatchPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("archived", false)
    .is("linkedin_url", null)
    .order("first_name")
    .limit(400)
    .returns<Contact[]>();
  const contacts = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <LinkedinIcon className="h-6 w-6 text-accent" />
          Match LinkedIn
        </h1>
        <Link
          href="/contacts"
          className="text-xs font-bold text-muted hover:text-ink hover:underline"
        >
          ← Contacts
        </Link>
      </div>
      <p className="text-sm text-muted">
        Contacts without a LinkedIn URL. Hit{" "}
        <span className="font-bold">Auto-find</span> to search Google for their
        profile (verify it&apos;s the right person, then Use this), or{" "}
        <span className="font-bold">Search ↗</span> to look them up on LinkedIn
        yourself and paste the URL. Auto-find reads public search results — it
        doesn&apos;t use LinkedIn&apos;s API.
      </p>

      {contacts.length > 0 && <BulkAutoFind remaining={contacts.length} />}

      <SectionCard
        title={`Unmatched (${contacts.length})`}
        icon={<LinkedinIcon className="h-[18px] w-[18px] text-cold" />}
        tone="mint"
      >
        {contacts.length === 0 ? (
          <EmptyState>Everyone has a LinkedIn URL. 🎉</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {contacts.map((c) => {
              const search = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
                [contactName(c), c.company].filter(Boolean).join(" "),
              )}`;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-bold text-ink hover:underline"
                    >
                      {contactName(c)}
                    </Link>
                    {c.company && (
                      <span className="ml-2 text-sm text-faint">{c.company}</span>
                    )}
                  </div>
                  <LinkedinAutoFind id={c.id} />
                  <a
                    href={search}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-ink bg-tli px-3 py-1.5 text-xs font-bold text-ink transition hover:-translate-y-px"
                  >
                    <LinkedinIcon /> Search ↗
                  </a>
                  <form action={setLinkedin} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="linkedin_url"
                      placeholder="Paste profile URL"
                      className="field w-56 py-1.5"
                    />
                    <SubmitButton
                      className="rounded-[10px] border-2 border-ink bg-accent px-3 py-1.5 text-xs font-bold text-accent-fg transition hover:-translate-y-px"
                      pendingText="…"
                    >
                      Save
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
