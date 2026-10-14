import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import {
  timeAgo,
  formatDate,
  formatMeetingTime,
  todayInMelbourne,
  addDays,
} from "@/lib/date";
import {
  SectionCard,
  EmptyState,
  TemperatureDot,
  QuickActions,
  STAGE_LABELS,
  INTERACTION_LABELS,
  WarningBadge,
} from "@/components/ui";
import {
  snoozeFollowup,
  markFollowedUp,
  markContacted,
  dismissKeepInTouch,
  dismissAwaitingReply,
  applyContactUpdate,
  dismissContactUpdate,
} from "./actions";
import { SuggestionButtons } from "@/components/SuggestionButtons";
import { NurtureInline } from "@/components/NurtureInline";
import { RecentMeeting } from "@/components/RecentMeeting";
import { SubmitButton } from "@/components/SubmitButton";
import { SyncChip } from "@/components/SyncChip";
import {
  HomeIcon,
  InboxIcon,
  FlameIcon,
  WrenchIcon,
  SparkleIcon,
  ClockIcon,
  PencilIcon,
  PhoneIcon,
  MailIcon,
} from "@/components/icons";
import type {
  Contact,
  Interaction,
  Suggestion,
  SyncState,
  ContactUpdate,
  PipelineStage,
  Temperature,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// Accepting a suggestion (from the Pending panel) runs Gemini enrichment.
export const maxDuration = 60;

const snoozeBtn =
  "rounded-[10px] border-2 border-ink bg-card px-2.5 py-1 text-xs font-bold text-ink transition hover:-translate-y-px";

// Auto-generated / calendar-system emails that arrive inbound but never need a
// reply (meeting accepts + cancellations, auto-replies, bounces). Kept out of
// the "Awaiting your reply" list.
const AUTO_EMAIL_SUBJECT =
  /^\s*(re:\s*|fw:\s*|fwd:\s*)*(accepted|declined|tentative|tentatively accepted|canceled|cancelled|updated invitation|invitation|automatic reply|out of office|undeliverable|delivery status|read:)\b/i;

export default async function DashboardPage() {
  const supabase = await createClient();

  // Keep-in-touch: anyone not contacted in 4+ months (or never).
  const reconnectCutoff = new Date(
    Date.now() - 120 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const today = todayInMelbourne();
  const weekAhead = addDays(today, 7); // follow-up window: overdue → +7 days
  const nowIso = new Date().toISOString();

  const [
    queueRes,
    leadsRes,
    sugRes,
    actRes,
    syncRes,
    updRes,
    reconnectRes,
    upcomingRes,
  ] = await Promise.all([
      supabase
        .from("contacts")
        .select("*")
        .eq("archived", false)
        .not("next_followup_at", "is", null)
        .lte("next_followup_at", weekAhead)
        .order("next_followup_at", { ascending: true })
        .limit(30)
        .returns<Contact[]>(),
      supabase
        .from("contacts")
        .select("*")
        .eq("archived", false)
        .or("temperature.eq.hot,pipeline_stage.eq.project_work")
        .neq("pipeline_stage", "none")
        .order("last_contact_at", { ascending: true, nullsFirst: true })
        .returns<Contact[]>(),
    supabase
      .from("suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<Suggestion[]>(),
    supabase
      .from("interactions")
      .select("*, contacts(id,first_name,last_name,company,ai_summary,notes)")
      .lte("occurred_at", nowIso) // real past events only — not upcoming meetings
      .neq("type", "system") // skip contentless ingest markers
      .order("occurred_at", { ascending: false })
      .limit(10),
    supabase.from("sync_state").select("*").single<SyncState>(),
    supabase
      .from("contact_updates")
      .select("*, contacts(id,first_name,last_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("*")
      .eq("archived", false)
      .eq("keep_in_touch", true)
      .is("warning", null)
      .or(`last_contact_at.is.null,last_contact_at.lt.${reconnectCutoff}`)
      .order("last_contact_at", { ascending: true, nullsFirst: true })
      .limit(12)
      .returns<Contact[]>(),
    supabase
      .from("interactions")
      .select(
        "id, occurred_at, subject, body, graph_message_id, contacts(id,first_name,last_name,company,pipeline_stage,temperature,warning)",
      )
      .eq("type", "meeting")
      .gte("occurred_at", nowIso)
      .order("occurred_at", { ascending: true })
      .limit(40),
  ]);

  const queue = queueRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const suggestions = sugRes.data ?? [];
  const activity = (actRes.data ?? []) as (Interaction & {
    contacts: {
      id: string;
      first_name: string;
      last_name: string | null;
      company: string | null;
      ai_summary: string | null;
      notes: string | null;
    } | null;
  })[];
  const sync = syncRes.data ?? null;
  const updates = (updRes.data ?? []) as (ContactUpdate & {
    contacts: { id: string; first_name: string; last_name: string | null } | null;
  })[];
  const reconnect = reconnectRes.data ?? [];
  const upcomingRows = (upcomingRes.data ?? []) as unknown as (Pick<
    Interaction,
    "id" | "occurred_at" | "subject" | "body" | "graph_message_id"
  > & {
    contacts: {
      id: string;
      first_name: string;
      last_name: string | null;
      company: string | null;
      pipeline_stage: PipelineStage;
      temperature: Temperature;
      warning: string | null;
    } | null;
  })[];

  // Group a meeting's per-attendee rows into ONE upcoming meeting with an
  // attendee list, so a meeting with many contacts isn't shown many times.
  type UpcomingParticipant = {
    id: string;
    name: string;
    company: string | null;
    pipeline_stage: PipelineStage;
    temperature: Temperature;
    warning: string | null;
  };
  const upcomingMap = new Map<
    string,
    {
      key: string;
      occurred_at: string;
      subject: string;
      location: string | null;
      participants: UpcomingParticipant[];
    }
  >();
  for (const m of upcomingRows) {
    const key = m.graph_message_id ?? m.id;
    let g = upcomingMap.get(key);
    if (!g) {
      const loc = (m.body?.match(/Where:\s*(.+)/)?.[1] ?? "").trim();
      g = {
        key,
        occurred_at: m.occurred_at,
        subject: m.subject || "Meeting",
        location: loc && loc !== "—" ? loc : null,
        participants: [],
      };
      upcomingMap.set(key, g);
    }
    const c = m.contacts;
    if (c && !g.participants.some((p) => p.id === c.id)) {
      g.participants.push({
        id: c.id,
        name: contactName(c),
        company: c.company,
        pipeline_stage: c.pipeline_stage,
        temperature: c.temperature,
        warning: c.warning,
      });
    }
  }
  const upcomingMeetings = [...upcomingMap.values()]
    .sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1))
    .slice(0, 12);

  // Recent meetings (last 30 days) so you can add notes after they happen.
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: recentMtgData } = await supabase
    .from("interactions")
    .select(
      "id, occurred_at, subject, note, graph_message_id, contacts(id,first_name,last_name,company,next_followup_at)",
    )
    .eq("type", "meeting")
    .is("reviewed_at", null)
    .lte("occurred_at", nowIso)
    .gte("occurred_at", thirtyDaysAgo)
    .order("occurred_at", { ascending: false })
    .limit(50);
  const recentRows = (recentMtgData ?? []) as unknown as (Pick<
    Interaction,
    "id" | "occurred_at" | "subject" | "note" | "graph_message_id"
  > & {
    contacts: {
      id: string;
      first_name: string;
      last_name: string | null;
      company: string | null;
      next_followup_at: string | null;
    } | null;
  })[];
  // Group a meeting's per-attendee interactions into one item.
  const meetingMap = new Map<
    string,
    {
      key: string;
      occurred_at: string;
      subject: string | null;
      note: string | null;
      followupAt: string | null;
      interactionIds: string[];
      participants: { id: string; name: string; interactionId: string }[];
    }
  >();
  for (const m of recentRows) {
    const key = m.graph_message_id ?? m.id;
    let g = meetingMap.get(key);
    if (!g) {
      g = { key, occurred_at: m.occurred_at, subject: m.subject, note: m.note, followupAt: null, interactionIds: [], participants: [] };
      meetingMap.set(key, g);
    }
    g.interactionIds.push(m.id);
    if (!g.note && m.note) g.note = m.note;
    if (m.contacts) {
      g.participants.push({ id: m.contacts.id, name: contactName(m.contacts), interactionId: m.id });
      if (!g.followupAt && m.contacts.next_followup_at) g.followupAt = m.contacts.next_followup_at;
    }
  }
  const recentMeetings = [...meetingMap.values()]
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    .slice(0, 15);

  // Awaiting your reply: contacts whose MOST RECENT interaction is an inbound
  // email (they wrote last, you haven't answered), past a short grace period,
  // with no follow-up already scheduled. Direction-based, so it clears itself
  // the moment your reply syncs in as an email_out.
  const replyWindowStart = new Date(Date.now() - 45 * 86400000).toISOString();
  const { data: replyInts } = await supabase
    .from("interactions")
    .select(
      "contact_id, type, occurred_at, subject, contacts(id,first_name,last_name,company,emails,phone,archived,warning,next_followup_at,reply_dismissed_at)",
    )
    .in("type", ["email_in", "email_out", "meeting", "call"])
    .gte("occurred_at", replyWindowStart)
    .lte("occurred_at", nowIso)
    .order("occurred_at", { ascending: false })
    .limit(1000);
  type ReplyRow = {
    contact_id: string;
    type: string;
    occurred_at: string;
    subject: string | null;
    contacts: {
      id: string;
      first_name: string;
      last_name: string | null;
      company: string | null;
      emails: string[];
      phone: string | null;
      archived: boolean;
      warning: string | null;
      next_followup_at: string | null;
      reply_dismissed_at: string | null;
    } | null;
  };
  const latestByContact = new Map<string, ReplyRow>();
  for (const r of (replyInts ?? []) as unknown as ReplyRow[]) {
    if (r.contact_id && !latestByContact.has(r.contact_id)) {
      latestByContact.set(r.contact_id, r);
    }
  }
  const replyGraceCutoff = Date.now() - 2 * 86400000; // 2-day grace before nagging
  const awaitingReply = [...latestByContact.values()]
    .filter((r) => {
      const c = r.contacts;
      if (!c || c.archived || c.warning) return false;
      if (r.type !== "email_in") return false; // your reply/meeting since = handled
      if (r.subject && AUTO_EMAIL_SUBJECT.test(r.subject)) return false; // calendar/auto
      const t = Date.parse(r.occurred_at);
      if (t > replyGraceCutoff) return false; // too recent — you may still reply
      if (c.next_followup_at) return false; // already on the follow-up queue
      if (c.reply_dismissed_at && Date.parse(c.reply_dismissed_at) >= t) return false;
      return true;
    })
    .sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1)) // longest-waiting first
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <HomeIcon className="h-6 w-6 text-accent" />
          Dashboard
        </h1>
        <SyncChip
          connected={Boolean(sync?.ms_refresh_token)}
          lastSyncAt={sync?.last_sync_at ?? null}
          lastError={sync?.last_error ?? null}
        />
      </div>

      {/* Follow-up queue */}
      <SectionCard
        title="Follow-up queue"
        icon={<InboxIcon className="h-[18px] w-[18px] text-crit" />}
        tone="violet"
      >
        {queue.length === 0 ? (
          <EmptyState>Nothing due or overdue in the next 7 days. Nice work.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((c) => {
              const overdue = c.next_followup_at
                ? Math.round(
                    (Date.parse(today) - Date.parse(c.next_followup_at)) /
                      86400000,
                  )
                : 0;
              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
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
                    <div className="text-xs text-muted">
                      {c.followup_reason ?? "Follow-up due"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                  {c.pipeline_stage === "project_work" ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border-2 border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent"
                      title="Project work in progress"
                    >
                      <WrenchIcon className="h-3.5 w-3.5" />
                      Project
                    </span>
                  ) : c.temperature === "hot" && c.pipeline_stage !== "none" ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border-2 border-hot/50 bg-hot/10 px-2 py-0.5 text-[11px] font-bold text-hot"
                      title="Hot lead"
                    >
                      <FlameIcon className="h-3.5 w-3.5 fill-hot stroke-ink" />
                      Hot
                    </span>
                  ) : null}
                  <WarningBadge warning={c.warning} />
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                      overdue > 0
                        ? "bg-critbg text-crit"
                        : overdue === 0
                          ? "bg-bary text-ink"
                          : "border-2 border-line bg-desktop text-muted"
                    }`}
                  >
                    {overdue > 0
                      ? `${overdue}d overdue`
                      : overdue === 0
                        ? "due today"
                        : `in ${-overdue}d`}
                  </span>
                <QuickActions email={c.emails[0]} phone={c.phone} name={contactName(c)} />
                  <form action={snoozeFollowup.bind(null, c.id, "1w")}>
                    <SubmitButton className={snoozeBtn}>+1w</SubmitButton>
                  </form>
                  <form action={snoozeFollowup.bind(null, c.id, "1m")}>
                    <SubmitButton className={snoozeBtn}>+1m</SubmitButton>
                  </form>
                  <form action={markFollowedUp.bind(null, c.id)}>
                    <SubmitButton className="rounded-[10px] border-2 border-ink bg-good px-2.5 py-1 text-xs font-bold text-white transition hover:-translate-y-px">
                      Done
                    </SubmitButton>
                  </form>
                  </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Awaiting your reply — their last email is unanswered */}
      {awaitingReply.length > 0 && (
        <SectionCard
          title="Awaiting your reply"
          icon={<MailIcon className="h-[18px] w-[18px] text-crit" />}
          tone="pink"
        >
          <ul className="divide-y divide-line">
            {awaitingReply.map((r) => {
              const c = r.contacts!;
              const days = Math.max(
                1,
                Math.round((Date.now() - Date.parse(r.occurred_at)) / 86400000),
              );
              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
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
                      <div className="truncate text-xs text-muted">
                        {r.subject ? `“${r.subject}”` : "Emailed you"} · {days}d
                        waiting on you
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <QuickActions
                        email={c.emails[0]}
                        phone={c.phone}
                        name={contactName(c)}
                        subject={r.subject ? `Re: ${r.subject}` : "Following up"}
                      />
                      <form action={snoozeFollowup.bind(null, c.id, "1w")}>
                        <SubmitButton className={snoozeBtn}>Follow up +1w</SubmitButton>
                      </form>
                      <form action={dismissAwaitingReply.bind(null, c.id)}>
                        <SubmitButton
                          className="rounded-[10px] border-2 border-line bg-card px-2.5 py-1 text-xs font-bold text-muted transition hover:-translate-y-px hover:text-ink"
                          pendingText="…"
                        >
                          Dismiss
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* Upcoming meetings — one card per meeting, attendees listed */}
      <SectionCard
        title="Upcoming meetings"
        icon={<ClockIcon className="h-[18px] w-[18px] text-cold" />}
        tone="yellow"
      >
        {upcomingMeetings.length === 0 ? (
          <EmptyState>No meetings booked in your synced calendar window.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {upcomingMeetings.map((mtg) => (
              <li key={mtg.key} className="px-4 py-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-bold text-ink">
                      {mtg.subject}
                    </div>
                    {mtg.location && (
                      <div className="break-words text-xs text-muted">
                        {mtg.location}
                      </div>
                    )}
                    <ul className="mt-1 space-y-0.5">
                      {mtg.participants.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                        >
                          <Link
                            href={`/contacts/${p.id}`}
                            className="font-semibold text-ink hover:underline"
                          >
                            {p.name}
                          </Link>
                          {p.company && <span className="text-faint">{p.company}</span>}
                          {p.warning && <WarningBadge warning={p.warning} />}
                          {p.pipeline_stage !== "none" && (
                            <span className="inline-flex items-center gap-1">
                              {p.pipeline_stage === "project_work" ? (
                                <WrenchIcon className="h-3.5 w-3.5 text-accent" />
                              ) : p.temperature === "hot" ? (
                                <FlameIcon className="h-3.5 w-3.5 fill-hot stroke-ink" />
                              ) : (
                                <TemperatureDot value={p.temperature} />
                              )}
                              <span className="rounded-full border-2 border-line bg-temail px-1.5 text-[10px] font-bold text-ink">
                                {STAGE_LABELS[p.pipeline_stage]}
                              </span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-ink">
                    {formatMeetingTime(mtg.occurred_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Recent meetings — last 30 days, add notes after the fact */}
      <SectionCard
        title="Recent meetings"
        icon={<ClockIcon className="h-[18px] w-[18px] text-good" />}
        tone="mint"
      >
        {recentMeetings.length === 0 ? (
          <EmptyState>No meetings in the last 30 days.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {recentMeetings.map((g) => (
              <RecentMeeting
                key={g.key}
                participants={g.participants}
                subject={g.subject ?? "Meeting"}
                timeLabel={formatMeetingTime(g.occurred_at)}
                note={g.note}
                followupLabel={g.followupAt ? formatDate(g.followupAt) : null}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Suggested data-change updates */}
      {updates.length > 0 && (
        <SectionCard
          title="Suggested updates"
          icon={<PencilIcon className="h-[18px] w-[18px] text-accent" />}
          tone="pink"
        >
          <ul className="divide-y divide-line">
            {updates.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  {u.contacts ? (
                    <Link
                      href={`/contacts/${u.contacts.id}`}
                      className="font-bold text-ink hover:underline"
                    >
                      {contactName(u.contacts)}
                    </Link>
                  ) : (
                    <span className="font-bold text-ink">Contact</span>
                  )}
                  <div className="text-xs text-muted">
                    <span className="font-bold uppercase tracking-wide">
                      {u.field}
                    </span>
                    :{" "}
                    {u.current_value && (
                      <span className="text-faint line-through">
                        {u.current_value}
                      </span>
                    )}{" "}
                    <span className="font-bold text-ink">
                      → {u.suggested_value}
                    </span>
                    {u.evidence ? ` · ${u.evidence}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <form action={applyContactUpdate}>
                    <input type="hidden" name="id" value={u.id} />
                    <SubmitButton className="rounded-[10px] border-2 border-ink bg-ink px-3 py-1 text-xs font-bold text-card transition hover:-translate-y-px">
                      Apply
                    </SubmitButton>
                  </form>
                  <form action={dismissContactUpdate}>
                    <input type="hidden" name="id" value={u.id} />
                    <SubmitButton className="rounded-[10px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px">
                      Dismiss
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Hot leads */}
      <SectionCard
        title="Hot leads"
        icon={<FlameIcon className="h-[18px] w-[18px] text-hot" />}
        tone="pink"
      >
        {leads.length === 0 ? (
          <EmptyState>
            No hot leads yet — mark a contact <span className="font-bold">hot</span>{" "}
            on the Contacts page.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {leads.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                {c.pipeline_stage === "project_work" ? (
                  <WrenchIcon className="h-4 w-4 text-accent" />
                ) : (
                  <TemperatureDot value={c.temperature} />
                )}
                <Link
                  href={`/contacts/${c.id}`}
                  className="font-bold text-ink hover:underline"
                >
                  {contactName(c)}
                </Link>
                {c.company && (
                  <span className="text-sm text-faint">{c.company}</span>
                )}
                <span className="text-xs text-faint">
                  {c.last_contact_at
                    ? `last contact ${timeAgo(c.last_contact_at)}`
                    : "no contact yet"}
                </span>
                <span className="ml-auto">
                  <QuickActions email={c.emails[0]} phone={c.phone} name={contactName(c)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Keep in touch — nobody should go quiet for 4+ months */}
      <SectionCard
        title="Keep in touch"
        icon={<PhoneIcon className="h-[18px] w-[18px] text-good" />}
        tone="mint"
      >
        {reconnect.length === 0 ? (
          <EmptyState>Everyone&apos;s been in touch within 4 months. 👍</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {reconnect.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
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
                  <div className="text-xs text-muted">
                    {c.last_contact_at
                      ? `last contact ${timeAgo(c.last_contact_at)}`
                      : "never contacted"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <QuickActions email={c.emails[0]} phone={c.phone} name={contactName(c)} />
                <NurtureInline
                  id={c.id}
                  email={c.emails[0] ?? null}
                  name={contactName(c)}
                  linkedinUrl={c.linkedin_url}
                />
                <form action={markContacted.bind(null, c.id)}>
                  <SubmitButton className="rounded-[10px] border-2 border-ink bg-good px-2.5 py-1 text-xs font-bold text-white transition hover:-translate-y-px">
                    Done
                  </SubmitButton>
                </form>
                <form action={dismissKeepInTouch.bind(null, c.id)}>
                  <SubmitButton
                    className="rounded-[10px] border-2 border-line bg-card px-2.5 py-1 text-xs font-bold text-muted transition hover:-translate-y-px hover:text-ink"
                    pendingText="…"
                  >
                    Dismiss
                  </SubmitButton>
                </form>
                </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Inbox: suggestions + recent activity */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <SectionCard
          title="Pending suggestions"
          icon={<SparkleIcon className="h-[18px] w-[18px] text-warm" />}
          tone="mint"
          action={
            suggestions.length > 5 ? (
              <Link
                href="/review"
                className="text-xs font-bold text-ink hover:underline"
              >
                Review all &rarr;
              </Link>
            ) : undefined
          }
        >
          {suggestions.length === 0 ? (
            <EmptyState>No new-contact suggestions.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {suggestions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink">
                      {s.payload.name || s.payload.email}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {s.payload.email}
                      {s.payload.thread_count
                        ? ` · ${s.payload.thread_count} threads`
                        : ""}
                    </div>
                  </div>
                  <SuggestionButtons id={s.id} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          icon={<ClockIcon className="h-[18px] w-[18px] text-cold" />}
          tone="yellow"
          overflowVisible
        >
          {activity.length === 0 ? (
            <EmptyState>No interactions logged yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((i) => {
                const c = i.contacts;
                const who = c ? contactName(c) : "Unknown";
                const pop = c?.ai_summary || i.summary || c?.notes;
                const inner = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-bold text-ink"
                        title={who}
                      >
                        {who}
                      </span>
                      <span className="shrink-0 text-xs text-faint">
                        {timeAgo(i.occurred_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="shrink-0 rounded-full border border-line bg-desktop px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                        {INTERACTION_LABELS[i.type]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">
                        {i.subject ?? i.summary ?? ""}
                        {i.subject && i.summary ? ` — ${i.summary}` : ""}
                      </span>
                    </div>
                    {pop && (
                      <div className="pointer-events-none invisible absolute left-3 right-3 top-full z-30 mt-1 rounded-[12px] border-2 border-ink bg-card p-3 opacity-0 shadow-[4px_5px_0_rgba(97,94,140,0.14)] transition-opacity group-hover:visible group-hover:opacity-100">
                        <div className="mb-1 text-xs font-bold text-ink">
                          {who}
                          {c?.company ? ` · ${c.company}` : ""}
                        </div>
                        <div className="whitespace-pre-line text-xs text-muted">
                          {pop}
                        </div>
                      </div>
                    )}
                  </>
                );
                return (
                  <li key={i.id} className="relative">
                    {c?.id ? (
                      <Link
                        href={`/contacts/${c.id}`}
                        className="group block px-4 py-3 transition hover:bg-temail"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
