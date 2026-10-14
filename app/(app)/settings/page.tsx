import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/date";
import { SectionCard } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SlidersIcon, LinkIcon, CoffeeIcon, BellIcon, SparkleIcon } from "@/components/icons";
import {
  updateSettings,
  updateInterestOptions,
  bulkAssignInterestByKeyword,
  runCatchUpCrawl,
  runDeltaSyncNow,
  runCalendarSyncNow,
  runTranscriptSyncNow,
} from "./actions";
import { AutoSync } from "@/components/AutoSync";
import { AutoTagInterests } from "@/components/AutoTagInterests";
import { ChipsInput } from "@/components/ChipsInput";
import { BackgroundEnrichButton } from "@/components/BackgroundEnrichButton";
import type { Settings, SyncState } from "@/lib/types";

export const dynamic = "force-dynamic";
// The catch-up crawl pages through the mailbox — give it room beyond the
// default serverless timeout.
export const maxDuration = 60;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ms_connected?: string;
    ms_error?: string;
    crawl_new?: string;
    crawl_people?: string;
    synced?: string;
    remaining?: string;
    delta?: string;
    calendar?: string;
    transcripts?: string;
    assigned?: string;
    interest?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: sync }] = await Promise.all([
    supabase.from("settings").select("*").single<Settings>(),
    supabase.from("sync_state").select("*").single<SyncState>(),
  ]);

  const s = settings!;
  const connected = Boolean(sync?.ms_refresh_token);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <SlidersIcon className="h-6 w-6 text-accent" />
        Settings
      </h1>

      {sp.ms_connected && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Microsoft connected. You can run the catch-up crawl below.
        </p>
      )}
      {sp.crawl_new !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Catch-up crawl done — {sp.crawl_people ?? "0"} people found,{" "}
          {sp.crawl_new} new added to{" "}
          <a href="/review" className="underline">
            Review
          </a>
          .
        </p>
      )}
      {sp.synced !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Synced {sp.synced} contact{sp.synced === "1" ? "" : "s"}.
          {Number(sp.remaining) > 0
            ? ` ${sp.remaining} still to go — click "Sync all contact emails" again.`
            : " All caught up."}
        </p>
      )}
      {sp.delta !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Delta sync done — {sp.delta} new interaction
          {sp.delta === "1" ? "" : "s"} logged.
        </p>
      )}
      {sp.calendar !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Calendar sync done — {sp.calendar} meeting
          {sp.calendar === "1" ? "" : "s"} logged.
        </p>
      )}
      {sp.transcripts !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Teams transcripts — {sp.transcripts} meeting
          {sp.transcripts === "1" ? "" : "s"} summarised.
          {sp.transcripts === "0"
            ? " (Nothing new with a transcript — make sure Transcribe was on and the scopes are consented.)"
            : ""}
        </p>
      )}
      {sp.assigned !== undefined && (
        <p className="rounded-[11px] border-2 border-ink bg-barm px-3 py-2 text-sm font-semibold text-ink">
          Assigned <span className="font-bold">{sp.interest}</span> to {sp.assigned}{" "}
          contact{sp.assigned === "1" ? "" : "s"}.
        </p>
      )}
      {sp.ms_error && (
        <p className="rounded-[11px] border-2 border-crit/40 bg-critbg px-3 py-2 text-sm font-semibold text-crit">
          Microsoft error: {sp.ms_error}
        </p>
      )}

      {/* Microsoft connection */}
      <SectionCard
        title="Microsoft connection"
        icon={<LinkIcon className="h-[18px] w-[18px] text-cold" />}
        tone="pink"
        pad
      >
        <p className="text-sm text-muted">
          Connect your mailbox to crawl past threads and (soon) auto-log
          interactions.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${
              connected
                ? "border-ink bg-barm text-ink"
                : "border-line bg-desktop text-muted"
            }`}
          >
            {connected ? "Connected" : "Not connected"}
          </span>
          {sync?.last_sync_at && (
            <span className="text-xs text-faint">
              Last activity {timeAgo(sync.last_sync_at)}
            </span>
          )}
        </div>
        {sync?.last_error && (
          <p className="mt-2 rounded-[10px] border-2 border-crit/40 bg-critbg px-3 py-2 text-xs font-semibold text-crit">
            {sync.last_error}
          </p>
        )}
        <div className="mt-4">
          <a
            href="/api/ms/connect"
            className="inline-block rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
          >
            {connected ? "Reconnect Microsoft" : "Connect Microsoft"}
          </a>
        </div>
      </SectionCard>

      {/* Catch-up crawl */}
      {connected && (
        <SectionCard
          title="Catch-up crawl"
          icon={<CoffeeIcon className="h-[18px] w-[18px] text-warm" />}
          tone="mint"
          pad
        >
          <p className="text-sm text-muted">
            Scan your mailbox for threads with “catch up” / “catchup” in the
            subject and propose the people involved as contacts (tagged{" "}
            <span className="font-bold">catch-up</span>). Review and accept them
            on the{" "}
            <a href="/review" className="font-bold text-ink underline">
              Review
            </a>{" "}
            page.
          </p>
          <form action={runCatchUpCrawl} className="mt-4">
            <SubmitButton
              className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
              pendingText="Crawling…"
            >
              Run catch-up crawl
            </SubmitButton>
          </form>

          <p className="mt-5 text-sm text-muted">
            Backfill AI summaries + email timelines + last-contact for contacts
            that don&apos;t have one yet.{" "}
            <span className="font-semibold text-ink">Recommended:</span> run it on
            the server — it keeps going after you close the tab and clears the
            whole backlog on its own.
          </p>
          <div className="mt-3">
            <BackgroundEnrichButton />
          </div>

          <p className="mt-4 text-xs text-faint">
            Or run it in this tab (stops if you close the page, but resumes where
            it left off next time):
          </p>
          <div className="mt-2">
            <AutoSync />
          </div>

          <p className="mt-5 text-sm text-muted">
            Log new inbox/sent emails and calendar meetings with existing
            contacts. The scheduled sync handles this automatically in the
            background — these run it right now.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={runDeltaSyncNow}>
              <SubmitButton
                className="rounded-[11px] border-2 border-ink bg-card px-4 py-2 text-sm font-bold text-ink transition hover:-translate-y-px"
                pendingText="Syncing…"
              >
                Sync new emails now
              </SubmitButton>
            </form>
            <form action={runCalendarSyncNow}>
              <SubmitButton
                className="rounded-[11px] border-2 border-ink bg-card px-4 py-2 text-sm font-bold text-ink transition hover:-translate-y-px"
                pendingText="Syncing…"
              >
                Sync calendar now
              </SubmitButton>
            </form>
            <form action={runTranscriptSyncNow}>
              <SubmitButton
                className="rounded-[11px] border-2 border-ink bg-card px-4 py-2 text-sm font-bold text-ink transition hover:-translate-y-px"
                pendingText="Summarising…"
              >
                Sync Teams transcripts now
              </SubmitButton>
            </form>
          </div>
          <p className="mt-2 text-xs text-faint">
            Teams transcripts need the extra Graph permissions consented (see
            below) and Transcribe/Record turned on in the meeting.
          </p>
        </SectionCard>
      )}

      {/* Interest tags (master list for campaign targeting) */}
      <SectionCard
        title="Interest tags"
        icon={<SparkleIcon className="h-[18px] w-[18px] text-warm" />}
        tone="mint"
        pad
      >
        <p className="mb-3 text-sm text-muted">
          The master list of interest tags you can assign to contacts and target
          with campaigns. Type a tag and press Enter or comma to add; click the ✕
          on a tag to remove it, then Save.
        </p>
        <form action={updateInterestOptions} className="space-y-3">
          <ChipsInput
            name="interest_options"
            initial={s.interest_options ?? []}
            placeholder="e.g. AI, Property, Fitness, Startups, Grants…"
          />
          <SubmitButton
            className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
            pendingText="Saving…"
          >
            Save interests
          </SubmitButton>
        </form>

        {(s.interest_options ?? []).length > 0 && (
          <>
            <div className="mt-5 border-t-2 border-line pt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-faint">
                Assign to contacts
              </div>
              <div className="mt-3">
                <AutoTagInterests />
              </div>
            </div>

            <div className="mt-4 border-t-2 border-line pt-4">
              <p className="mb-2 text-sm text-muted">
                Or bulk-assign one category to everyone matching a keyword (name,
                company or role) — handy after adding a new category.
              </p>
              <form
                action={bulkAssignInterestByKeyword}
                className="flex flex-wrap items-end gap-2"
              >
                <div>
                  <label className="field-label">Category</label>
                  <select
                    name="interest"
                    className="w-full cursor-pointer rounded-[11px] border-2 border-ink bg-card px-3 py-2 text-sm font-bold text-ink outline-none sm:w-auto"
                  >
                    {(s.interest_options ?? []).map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 flex-1">
                  <label className="field-label">Keyword matches</label>
                  <input
                    name="keyword"
                    placeholder="e.g. Transport, University, builder…"
                    className="field"
                  />
                </div>
                <SubmitButton
                  className="rounded-[11px] border-2 border-ink bg-card px-4 py-2 text-sm font-bold text-ink transition hover:-translate-y-px"
                  pendingText="Assigning…"
                >
                  Assign
                </SubmitButton>
              </form>
            </div>
          </>
        )}
      </SectionCard>

      {/* Follow-up thresholds */}
      <SectionCard
        title="Follow-up thresholds"
        icon={<BellIcon className="h-[18px] w-[18px] text-hot" />}
        tone="violet"
        pad
      >
        <form action={updateSettings} className="space-y-4">
          <p className="text-sm text-muted">
            A contact is due when this many days of silence pass, based on their
            temperature.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Hot (days)</label>
              <input type="number" name="hot_days" defaultValue={s.hot_days} className="field" />
            </div>
            <div>
              <label className="field-label">Warm (days)</label>
              <input type="number" name="warm_days" defaultValue={s.warm_days} className="field" />
            </div>
            <div>
              <label className="field-label">Cold (days)</label>
              <input type="number" name="cold_days" defaultValue={s.cold_days} className="field" />
            </div>
          </div>
          <div>
            <label className="field-label">
              New-contact suggestion threshold (threads)
            </label>
            <input
              type="number"
              name="suggestion_thread_threshold"
              defaultValue={s.suggestion_thread_threshold}
              className="field max-w-[8rem]"
            />
          </div>
          <SubmitButton
            className="rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px"
            pendingText="Saving…"
          >
            Save settings
          </SubmitButton>
        </form>
      </SectionCard>
    </div>
  );
}
