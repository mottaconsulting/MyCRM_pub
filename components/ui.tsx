import type { InteractionType, PipelineStage, Temperature } from "@/lib/types";
import {
  MailIcon,
  PhoneIcon,
  LinkedinIcon,
  CoffeeIcon,
  AlertIcon,
} from "@/components/icons";

/** Red warning flag (timewaster / banned / do-not-contact). Null → nothing. */
export function WarningBadge({ warning }: { warning: string | null }) {
  if (!warning) return null;
  return (
    <span
      title={warning}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-crit bg-critbg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-crit"
    >
      <AlertIcon className="h-3 w-3" />
      {warning}
    </span>
  );
}

const TEMP_STYLES: Record<Temperature, string> = {
  hot: "bg-hot/15 text-hot",
  warm: "bg-warm/20 text-warm",
  cold: "bg-cold/20 text-cold",
};

const TEMP_DOT: Record<Temperature, string> = {
  hot: "bg-hot",
  warm: "bg-warm",
  cold: "bg-cold",
};

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  email_in: "Email in",
  email_out: "Email out",
  meeting: "Meeting",
  call: "Call",
  note: "Note",
  voice_note: "Voice note",
  linkedin_in: "LinkedIn in",
  linkedin_out: "LinkedIn out",
  system: "AI",
};

export const STAGE_LABELS: Record<PipelineStage, string> = {
  none: "No stage",
  lead: "Lead",
  in_discussion: "In discussion",
  proposal: "Proposal",
  won: "Won",
  project_work: "Project work",
  dormant: "Dormant",
};

export function TemperatureBadge({ value }: { value: Temperature }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${TEMP_STYLES[value]}`}
    >
      <span
        className={`h-2 w-2 rounded-full border border-ink/50 ${TEMP_DOT[value]}`}
      />
      {value}
    </span>
  );
}

export function TemperatureDot({ value }: { value: Temperature }) {
  return (
    <span
      title={value}
      className={`inline-block h-2.5 w-2.5 rounded-full border-2 border-ink ${TEMP_DOT[value]}`}
    />
  );
}

export function StageBadge({ value }: { value: PipelineStage }) {
  if (value === "none") return null;
  return (
    <span className="inline-flex items-center rounded-full border-2 border-line bg-temail px-2.5 py-0.5 text-xs font-bold text-ink">
      {STAGE_LABELS[value]}
    </span>
  );
}

/**
 * Cross-channel quick-action icon buttons: email, phone, LinkedIn and
 * "book a coffee". LinkedIn opens the person's profile if a URL is known,
 * otherwise a LinkedIn name search. Coffee opens an Outlook calendar event
 * prefilled to invite them.
 */
export function QuickActions({
  email,
  phone,
  name,
  company,
  linkedinUrl,
  subject = "Following up",
}: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  company?: string | null;
  linkedinUrl?: string | null;
  subject?: string;
}) {
  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-[10px] border-2 border-ink text-ink transition hover:-translate-y-px";

  const linkedin =
    linkedinUrl ||
    (name
      ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
          [name, company].filter(Boolean).join(" "),
        )}`
      : null);

  const first = (name ?? "").trim().split(/\s+/)[0] || "you";
  // Open in the local calendar app (consistent with mailto opening local mail)
  // via a downloadable .ics, rather than Outlook web. Placeholder time tomorrow.
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyCRM//EN",
    "BEGIN:VEVENT",
    `UID:${start.getTime()}-${(email ?? first).replace(/[^a-z0-9]/gi, "")}@mycrm`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Coffee with ${first}`,
    email ? `ATTENDEE:mailto:${email}` : "",
    "DESCRIPTION:Grabbing a coffee to catch up.",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const coffee = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  return (
    <span className="flex items-center gap-1.5">
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
          className={`${btn} bg-temail`}
          title={`Email ${email}`}
          aria-label={`Email ${email}`}
        >
          <MailIcon />
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          className={`${btn} bg-tcall`}
          title={`Call ${phone}`}
          aria-label={`Call ${phone}`}
        >
          <PhoneIcon />
        </a>
      )}
      {linkedin && (
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-tli`}
          title={linkedinUrl ? "Open LinkedIn profile" : "Find on LinkedIn"}
          aria-label="LinkedIn"
        >
          <LinkedinIcon />
        </a>
      )}
      <a
        href={coffee}
        download="coffee.ics"
        className={`${btn} bg-tcoffee`}
        title="Book a coffee (adds to your calendar)"
        aria-label="Book a coffee"
      >
        <CoffeeIcon />
      </a>
    </span>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border-2 border-line bg-desktop px-2 py-0.5 text-[11px] font-semibold text-muted sm:px-2.5 sm:text-xs">
      {children}
    </span>
  );
}

/** The three OS-style window controls: minimise / maximise / close. */
function WindowControls() {
  const box =
    "inline-flex h-[15px] w-[17px] items-center justify-center rounded-[4px] border-[1.5px] border-ink/70";
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5 text-ink/70">
      <span className={box}>
        <span className="h-[1.5px] w-2 rounded-full bg-ink/70" />
      </span>
      <span className={box}>
        <span className="h-[7px] w-[9px] rounded-[1px] border-[1.5px] border-ink/70" />
      </span>
      <span className={`${box} text-[9px] font-black leading-none`}>&#10005;</span>
    </span>
  );
}

type Tone = "violet" | "yellow" | "pink" | "mint";
const BAR_TONE: Record<Tone, string> = {
  violet: "win-bar--violet",
  yellow: "win-bar--yellow",
  pink: "win-bar--pink",
  mint: "win-bar--mint",
};

export function SectionCard({
  title,
  icon,
  action,
  tone = "violet",
  pad = false,
  overflowVisible = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: Tone;
  pad?: boolean;
  overflowVisible?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`win${overflowVisible ? " overflow-visible" : ""}`}>
      <div className={`win-bar ${BAR_TONE[tone]} rounded-t-[14px]`}>
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          {icon && <span aria-hidden="true">{icon}</span>}
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {action}
          <WindowControls />
        </div>
      </div>
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-faint">{children}</p>;
}
