import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import { formatDate, timeAgo } from "@/lib/date";
import {
  QuickActions,
  SectionCard,
  EmptyState,
  STAGE_LABELS,
  WarningBadge,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { FollowUpScheduler } from "@/components/FollowUpScheduler";
import { WarningPicker } from "@/components/WarningPicker";
import { ChipsInput } from "@/components/ChipsInput";
import { InterestPicker } from "@/components/InterestPicker";
import { NurtureInline } from "@/components/NurtureInline";
import { Timeline } from "@/components/Timeline";
import { BackButton } from "@/components/BackButton";
import {
  PencilIcon,
  PlusIcon,
  ClockIcon,
  SparkleIcon,
  BellIcon,
  LinkedinIcon,
  AlertIcon,
  MailIcon,
  PhoneIcon,
  LinkIcon,
  FunnelIcon,
  FlameIcon,
  SproutIcon,
} from "@/components/icons";
import { LinkedinAutoFind } from "@/components/LinkedinAutoFind";
import {
  updateContact,
  addInteraction,
  setArchived,
  refreshEnrichment,
} from "../actions";
import type { Contact, Interaction, PipelineStage, Temperature } from "@/lib/types";

export const dynamic = "force-dynamic";
// "Sync emails" re-runs Gemini enrichment — allow time beyond the default.
export const maxDuration = 60;

const TEMPS: Temperature[] = ["hot", "warm", "cold"];
const STAGES: PipelineStage[] = [
  "none",
  "lead",
  "in_discussion",
  "proposal",
  "won",
  "dormant",
];
const INTERACTION_TYPES = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "note", label: "Note" },
  { value: "email_out", label: "Email sent" },
  { value: "email_in", label: "Email received" },
];

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: contact }, { data: interactions }, { data: settings }] =
    await Promise.all([
      supabase.from("contacts").select("*").eq("id", id).maybeSingle<Contact>(),
      supabase
        .from("interactions")
        .select("*")
        .eq("contact_id", id)
        .order("occurred_at", { ascending: false })
        .limit(200)
        .returns<Interaction[]>(),
      supabase.from("settings").select("interest_options").single(),
    ]);

  if (!contact) notFound();
  const interestOptions = (settings?.interest_options as string[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <BackButton />
          <h1 className="break-words text-2xl font-bold text-ink">
            {contactName(contact)}
          </h1>
          <div className="break-words text-sm text-muted">
            {[contact.role, contact.company].filter(Boolean).join(" · ")}
          </div>
          {contact.warning && (
            <div className="mt-2">
              <WarningBadge warning={contact.warning} />
            </div>
          )}
          {contact.website && (
            <a
              href={contact.website}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all text-xs font-bold text-accent hover:underline"
            >
              {contact.website.replace(/^https?:\/\//, "")} ↗
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuickActions
            email={contact.emails[0]}
            phone={contact.phone}
            name={contactName(contact)}
            company={contact.company}
            linkedinUrl={contact.linkedin_url}
          />
          <form action={refreshEnrichment.bind(null, id)}>
            <SubmitButton
              className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-xs font-bold text-ink transition hover:-translate-y-px"
              pendingText="Syncing…"
            >
              ↻ Sync emails
            </SubmitButton>
          </form>
          <form action={setArchived.bind(null, id, !contact.archived)}>
            <SubmitButton className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-xs font-bold text-ink transition hover:-translate-y-px">
              {contact.archived ? "Unarchive" : "Archive"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {contact.archived && (
        <p className="rounded-[11px] border-2 border-ink bg-bary px-3 py-2 text-sm font-semibold text-ink">
          This contact is archived.
        </p>
      )}

      {contact.ai_summary && (
        <SectionCard
          title="AI summary"
          icon={<SparkleIcon className="h-[18px] w-[18px] text-accent" />}
          tone="mint"
          pad
        >
          <p className="whitespace-pre-line break-words text-sm text-ink">
            {contact.ai_summary}
          </p>
          <p className="mt-2 text-xs text-faint">
            Auto-generated
            {contact.ai_summary_at ? ` · ${timeAgo(contact.ai_summary_at)}` : ""}. Your
            own notes below are never changed by AI.
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="Schedule follow-up"
        icon={<BellIcon className="h-[18px] w-[18px] text-hot" />}
        tone="pink"
        pad
      >
        <FollowUpScheduler
          id={id}
          current={contact.next_followup_at}
          currentReason={contact.followup_reason}
        />
      </SectionCard>

      <SectionCard
        title="Draft a personal note"
        icon={<SproutIcon className="h-[18px] w-[18px] text-good" />}
        tone="mint"
        pad
      >
        <p className="mb-3 text-sm text-muted">
          AI-draft a warm, personal check-in to {contact.first_name}, grounded in
          your history and their recent activity. Edit it or redraft with your own
          instructions, then open it in your mail app.
        </p>
        <NurtureInline
          id={id}
          email={contact.emails[0] ?? null}
          name={contactName(contact)}
          linkedinUrl={contact.linkedin_url}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Editable fields */}
        <SectionCard
          title="Details"
          icon={<PencilIcon className="h-[18px] w-[18px] text-accent" />}
          tone="violet"
          pad
        >
          <form action={updateContact} className="space-y-4">
            <input type="hidden" name="id" value={id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">First name</label>
                <input name="first_name" defaultValue={contact.first_name} className="field" />
              </div>
              <div>
                <label className="field-label">Last name</label>
                <input name="last_name" defaultValue={contact.last_name ?? ""} className="field" />
              </div>
            </div>

            <div>
              <label className="field-label inline-flex items-center gap-1.5">
                <MailIcon className="h-3.5 w-3.5 text-muted" /> Emails
              </label>
              <ChipsInput
                name="emails"
                initial={contact.emails}
                placeholder="name@company.com"
                inputMode="email"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label inline-flex items-center gap-1.5">
                  <PhoneIcon className="h-3.5 w-3.5 text-muted" /> Phone(s)
                </label>
                <ChipsInput
                  name="phones"
                  initial={
                    contact.phones?.length
                      ? contact.phones
                      : contact.phone
                        ? [contact.phone]
                        : []
                  }
                  placeholder="0412 345 678"
                  inputMode="tel"
                />
              </div>
              <div>
                <label className="field-label">Role</label>
                <input name="role" defaultValue={contact.role ?? ""} className="field" />
              </div>
            </div>

            <div>
              <label className="field-label">Company</label>
              <input name="company" defaultValue={contact.company ?? ""} className="field" />
            </div>

            <div>
              <label className="field-label inline-flex items-center gap-1.5">
                <LinkedinIcon className="h-3.5 w-3.5 text-muted" /> LinkedIn URL
              </label>
              <input
                name="linkedin_url"
                defaultValue={contact.linkedin_url ?? ""}
                placeholder="https://www.linkedin.com/in/…"
                className="field"
              />
              <div className="mt-1.5">
                {contact.linkedin_url ? (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-ink bg-tli px-3 py-1.5 text-xs font-bold text-ink transition hover:-translate-y-px"
                  >
                    <LinkedinIcon /> Open profile ↗
                  </a>
                ) : (
                  <LinkedinAutoFind id={id} />
                )}
              </div>
            </div>

            <div>
              <label className="field-label inline-flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-muted" /> Website
              </label>
              <input
                name="website"
                defaultValue={contact.website ?? ""}
                placeholder="https://company.com"
                className="field"
              />
            </div>

            <div>
              <label className="field-label inline-flex items-center gap-1.5">
                <AlertIcon
                  className={`h-3.5 w-3.5 ${contact.warning ? "text-crit" : "text-faint"}`}
                />
                Warning
              </label>
              <WarningPicker initial={contact.warning} />
            </div>

            <div>
              <label className="field-label">Tags (comma separated)</label>
              <input name="tags" defaultValue={contact.tags.join(", ")} className="field" />
            </div>

            <div>
              <label className="field-label inline-flex items-center gap-1.5">
                <SparkleIcon className="h-3.5 w-3.5 text-warm" /> Interests
              </label>
              <InterestPicker
                name="interests"
                options={interestOptions}
                initial={contact.interests ?? []}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label inline-flex items-center gap-1.5">
                  <FunnelIcon className="h-3.5 w-3.5 text-cold" /> Pipeline stage
                </label>
                <select
                  name="pipeline_stage"
                  defaultValue={contact.pipeline_stage}
                  className="field"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label inline-flex items-center gap-1.5">
                  <FlameIcon className="h-3.5 w-3.5 text-faint" /> Temperature
                </label>
                <div className="relative">
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-ink ${
                      contact.temperature === "hot"
                        ? "bg-hot"
                        : contact.temperature === "warm"
                          ? "bg-warm"
                          : "bg-cold"
                    }`}
                  />
                  <select
                    name="temperature"
                    defaultValue={contact.temperature}
                    className="field pl-8"
                  >
                    {TEMPS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">Next follow-up</label>
                <input
                  type="date"
                  name="next_followup_at"
                  defaultValue={contact.next_followup_at ?? ""}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">Follow-up reason</label>
                <input
                  name="followup_reason"
                  defaultValue={contact.followup_reason ?? ""}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="field-label">Notes</label>
              <textarea name="notes" defaultValue={contact.notes ?? ""} rows={4} className="field" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-faint">
                Last contact:{" "}
                {contact.last_contact_at
                  ? `${formatDate(contact.last_contact_at)} (${timeAgo(contact.last_contact_at)})`
                  : "never"}
              </span>
              <SubmitButton
                className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
                pendingText="Saving…"
              >
                Save
              </SubmitButton>
            </div>
          </form>
        </SectionCard>

        {/* Interactions */}
        <div className="space-y-6">
          <SectionCard
            title="Log interaction"
            icon={<PlusIcon className="h-[18px] w-[18px] text-warm" />}
            tone="yellow"
            pad
          >
            <form action={addInteraction} className="space-y-3">
              <input type="hidden" name="contact_id" value={id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select name="type" defaultValue="call" className="field">
                  {INTERACTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input type="datetime-local" name="occurred_at" className="field" />
              </div>
              <input name="subject" placeholder="Subject (optional)" className="field" />
              <textarea name="summary" placeholder="What happened?" rows={2} className="field" />
              <SubmitButton
                className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
                pendingText="Adding…"
              >
                Add
              </SubmitButton>
            </form>
          </SectionCard>

          <SectionCard
            title="Timeline"
            icon={<ClockIcon className="h-[18px] w-[18px] text-good" />}
            tone="mint"
          >
            {(interactions ?? []).length === 0 ? (
              <EmptyState>No interactions yet.</EmptyState>
            ) : (
              <Timeline
                interactions={interactions ?? []}
                contactFirstName={contact.first_name}
              />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
