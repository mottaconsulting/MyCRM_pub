import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import { timeAgo } from "@/lib/date";
import { Badge, QuickActions, WarningBadge } from "@/components/ui";
import { ContactPipeline } from "@/components/InlinePickers";
import { SearchIcon, PlusIcon, UsersIcon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { ContactSort } from "@/components/ContactSort";
import { ContactSearch } from "@/components/ContactSearch";
import { FilterSelect } from "@/components/FilterSelect";
import { FlagButton } from "@/components/FlagButton";
import { ScrollRestore } from "@/components/ScrollRestore";
import { createContact, bulkImport, importLinkedinCsv } from "./actions";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_OPTIONS = [
  { v: "", label: "All stages" },
  { v: "lead", label: "Lead" },
  { v: "in_discussion", label: "In discussion" },
  { v: "proposal", label: "Proposal" },
  { v: "won", label: "Won" },
  { v: "dormant", label: "Dormant" },
  { v: "none", label: "No stage" },
];
const TEMP_OPTIONS = [
  { v: "", label: "All heat" },
  { v: "hot", label: "Hot" },
  { v: "warm", label: "Warm" },
  { v: "cold", label: "Cold" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    archived?: string;
    sort?: string;
    stage?: string;
    temp?: string;
    interest?: string;
    imported?: string;
    skipped?: string;
    noemail?: string;
  }>;
}) {
  const { q, archived, sort, stage, temp, interest, imported, skipped, noemail } =
    await searchParams;
  const showArchived = archived === "1";
  const sortKey = sort ?? "recent";
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("interest_options")
    .single();
  const interestOptions = (settings?.interest_options as string[] | null) ?? [];

  let query = supabase
    .from("contacts")
    .select("*")
    .eq("archived", showArchived)
    .limit(200);

  if (sortKey === "name") {
    query = query.order("first_name").order("last_name");
  } else if (sortKey === "surname") {
    query = query
      .order("last_name", { nullsFirst: false })
      .order("first_name");
  } else if (sortKey === "meeting") {
    query = query.order("last_meeting_at", {
      ascending: false,
      nullsFirst: false,
    });
  } else if (sortKey === "temperature") {
    query = query
      .order("temperature")
      .order("last_contact_at", { ascending: false, nullsFirst: false });
  } else if (sortKey === "company") {
    query = query.order("company", { nullsFirst: false });
  } else {
    query = query.order("last_contact_at", {
      ascending: false,
      nullsFirst: false,
    });
  }

  if (stage) query = query.eq("pipeline_stage", stage);
  if (temp) query = query.eq("temperature", temp);
  if (interest) query = query.contains("interests", [interest]);

  if (q && q.trim()) {
    // Each word must match somewhere (name or company) so a full "First Last"
    // query works — an AND of per-word OR groups.
    for (const tok of q.trim().split(/\s+/).filter(Boolean).slice(0, 4)) {
      const esc = tok.replace(/[%,()]/g, " ").trim();
      if (!esc) continue;
      query = query.or(
        `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,company.ilike.%${esc}%`,
      );
    }
  }

  const { data } = await query.returns<Contact[]>();
  const contacts = data ?? [];

  // "Clear search" target — drops q but keeps sort / filters / archived.
  const clearParams = new URLSearchParams();
  if (showArchived) clearParams.set("archived", "1");
  if (sortKey !== "recent") clearParams.set("sort", sortKey);
  if (stage) clearParams.set("stage", stage);
  if (temp) clearParams.set("temp", temp);
  if (interest) clearParams.set("interest", interest);
  const clearHref = `/contacts${clearParams.toString() ? `?${clearParams}` : ""}`;

  return (
    <div className="space-y-4">
      <ScrollRestore />
      {imported !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Imported {imported} new contact{imported === "1" ? "" : "s"}.
          {Number(skipped) > 0 ? ` ${skipped} already existed.` : ""}
          {Number(noemail) > 0 ? ` ${noemail} skipped (no email).` : ""} Their
          names, phone numbers and summaries are being filled in{" "}
          <span className="font-bold">automatically in the background</span> — you
          can close this tab; refresh in a minute or two to see them.
        </p>
      )}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <UsersIcon className="h-6 w-6 text-accent" />
          Contacts
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/linkedin"
            className="text-xs font-bold text-muted hover:text-ink hover:underline"
          >
            Match LinkedIn
          </Link>
          <Link
            href="/duplicates"
            className="text-xs font-bold text-muted hover:text-ink hover:underline"
          >
            Duplicates
          </Link>
          <Link
            href={
              showArchived
                ? `/contacts?sort=${sortKey}`
                : `/contacts?archived=1&sort=${sortKey}`
            }
            className="text-xs font-bold text-muted hover:text-ink hover:underline"
          >
            {showArchived ? "← Active contacts" : "View archived"}
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <form method="get" className="flex gap-2">
          <ContactSearch defaultValue={q ?? ""} />
          {showArchived && <input type="hidden" name="archived" value="1" />}
          <input type="hidden" name="sort" value={sortKey} />
          {stage && <input type="hidden" name="stage" value={stage} />}
          {temp && <input type="hidden" name="temp" value={temp} />}
          {interest && <input type="hidden" name="interest" value={interest} />}
          <button className="inline-flex shrink-0 items-center gap-2 rounded-[11px] border-2 border-ink bg-card px-4 py-2 text-sm font-bold text-ink transition hover:-translate-y-px">
            <SearchIcon />
            <span className="hidden sm:inline">Search</span>
          </button>
          {q && q.trim() && (
            <Link
              href={clearHref}
              className="inline-flex shrink-0 items-center rounded-[11px] border-2 border-line bg-card px-3 py-2 text-sm font-bold text-muted transition hover:-translate-y-px hover:text-ink"
              title="Clear search"
            >
              Clear
            </Link>
          )}
        </form>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <FilterSelect
            param="stage"
            value={stage ?? ""}
            label="Filter by stage"
            options={STAGE_OPTIONS}
          />
          <FilterSelect
            param="temp"
            value={temp ?? ""}
            label="Filter by heat"
            options={TEMP_OPTIONS}
          />
          {interestOptions.length > 0 && (
            <FilterSelect
              param="interest"
              value={interest ?? ""}
              label="Filter by interest"
              options={[
                { v: "", label: "All interests" },
                ...interestOptions.map((i) => ({ v: i, label: i })),
              ]}
            />
          )}
          <div className="col-span-2 sm:col-auto">
            <ContactSort value={sortKey} />
          </div>
        </div>
      </div>

      {/* Add contacts — one quiet, greyed collapsible for both add + import */}
      <details className="win">
        <summary className="win-bar win-bar--subtle cursor-pointer list-none text-[15px] font-bold text-muted [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <PlusIcon />
            Add contacts
          </span>
          <span className="text-xs font-semibold text-faint">
            add one · import a list
          </span>
        </summary>
        <div className="divide-y divide-line">
          <form action={createContact} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <div className="text-xs font-bold uppercase tracking-wide text-faint sm:col-span-2">
              Add one
            </div>
            <input name="first_name" required placeholder="First name *" className="field" />
            <input name="last_name" placeholder="Last name" className="field" />
            <input
              name="emails"
              placeholder="Emails (comma separated — optional)"
              className="field sm:col-span-2"
            />
            <input
              name="linkedin_url"
              placeholder="LinkedIn URL (optional)"
              className="field sm:col-span-2"
            />
            <input name="company" placeholder="Company" className="field" />
            <input name="role" placeholder="Role" className="field" />
            <input name="phone" placeholder="Phone" className="field" />
            <p className="text-xs text-faint sm:col-span-2">
              Only a first name is required — add just a LinkedIn URL for people
              you only talk to there.
            </p>
            <div className="sm:col-span-2">
              <SubmitButton
                className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
                pendingText="Creating…"
              >
                Create contact
              </SubmitButton>
            </div>
          </form>

          <form action={bulkImport} className="space-y-3 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-faint">
              Import a list
            </div>
            <p className="text-sm text-muted">
              Paste one person per line, e.g.{" "}
              <span className="font-mono text-xs">Name - Company - email</span>. The
              email is the key; lines without one are skipped, and existing
              contacts are ignored.
            </p>
            <textarea
              name="list"
              rows={8}
              placeholder={"Jane Doe - Acme - jane@acme.com\nJohn Smith - john@smith.io"}
              className="field font-mono text-xs"
            />
            <SubmitButton
              className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
              pendingText="Importing…"
            >
              Import contacts
            </SubmitButton>
          </form>

          <form
            action={importLinkedinCsv}
            className="space-y-3 border-t-2 border-line p-5"
          >
            <div className="text-xs font-bold uppercase tracking-wide text-faint">
              Import LinkedIn connections
            </div>
            <p className="text-sm text-muted">
              Export your data from LinkedIn (Settings → Data Privacy → Get a copy
              of your data → Connections), then point this at the{" "}
              <span className="font-mono text-xs">Connections.csv</span>. It keeps
              each person&apos;s profile URL and role, and imports them even when
              LinkedIn hides the email. Existing contacts are skipped.
            </p>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="block w-full text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-[10px] file:border-2 file:border-ink file:bg-card file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-ink hover:file:-translate-y-px"
            />
            <SubmitButton
              className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
              pendingText="Importing…"
            >
              Import CSV
            </SubmitButton>
          </form>
        </div>
      </details>

      {/* List */}
      <div className="win">
        <div className="win-bar win-bar--violet">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <UsersIcon className="h-[18px] w-[18px] text-cold" />
            {showArchived ? "Archived" : "Active"} · {contacts.length}
          </h2>
        </div>
        {contacts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-faint">
            {q ? "No contacts match your search." : "No contacts yet."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {contacts.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                <div className="min-w-0 flex-1 pr-2">
                  <Link
                    href={`/contacts/${c.id}`}
                    title={contactName(c)}
                    className="block truncate font-bold text-ink hover:underline"
                  >
                    {contactName(c)}
                  </Link>
                  <div
                    className="truncate text-xs text-muted"
                    title={
                      [c.role, c.company].filter(Boolean).join(" · ") ||
                      c.emails[0] ||
                      undefined
                    }
                  >
                    {[c.role, c.company].filter(Boolean).join(" · ") ||
                      c.emails[0] ||
                      "—"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <WarningBadge warning={c.warning} />
                <ContactPipeline
                  id={c.id}
                  stage={c.pipeline_stage}
                  temperature={c.temperature}
                />
                {c.tags
                  .filter((t) => t !== "catch-up")
                  .slice(0, 3)
                  .map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                <span className="text-xs text-faint">
                  {c.last_contact_at ? timeAgo(c.last_contact_at) : "no contact"}
                </span>
                <QuickActions
                  email={c.emails[0]}
                  phone={c.phone}
                  name={contactName(c)}
                  company={c.company}
                  linkedinUrl={c.linkedin_url}
                />
                <FlagButton id={c.id} />
                </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
