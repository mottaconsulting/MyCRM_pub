> **Historical document.** This is the original v1 build spec. The shipped app has since moved to Google Gemini (not Anthropic), password sign-in, and multi-tenant RLS. See the top-level README.md and SETUP.md for what actually runs.

# MyCRM — Build Instructions for Claude Code

Read this whole file before writing code. Build in the phase order given; each phase must be working and committed before starting the next.

## 1. Project overview

Single-user CRM for the owner (consultant, owner@example.com). Core concept: **the user decides who's in the CRM; the system keeps records up to date automatically from his Microsoft 365 mailbox.**

Three user-facing capabilities:

1. **Email sync** — a one-off backfill of ~2 years of mail proposes contacts for approval; thereafter a 15-minute delta sync logs interactions with known contacts, auto-applies detail updates (phone/title/company found in signatures), and suggests new contacts once an unknown correspondent reaches 3+ threads.
2. **Voice notes** — record a note after a meeting (mobile browser), transcribe with Whisper, summarise + extract action items and a suggested follow-up date with Claude Haiku, attach to one or more contacts.
3. **Dashboard** — follow-up queue (with `mailto:`/`tel:` quick actions), hot leads by pipeline stage, pending suggestions, recent activity.

Design principles: fewest tables and screens possible; rules not ML; curation manual, enrichment automatic; every phase ships something usable.

## 2. Stack

- **Next.js 15+ (App Router, TypeScript, Tailwind CSS)** deployed on Vercel
- **Supabase**: Postgres, Auth (magic link), Storage (bucket `voice-notes`), Edge Functions, pg_cron
- **Microsoft Graph API** (delegated auth) for mail + calendar
- **OpenAI Whisper API** (`whisper-1`) for transcription
- **Anthropic API** (`claude-haiku-4-5`) for extraction/summaries
- **GitHub** repo, Vercel auto-deploy from `main`

Use `@supabase/ssr` for the Next.js client/server helpers. Use plain `fetch` for Graph (no heavy SDK needed).

## 3. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
ALLOWED_USER_EMAIL=owner@example.com
MS_CLIENT_ID=                       # Azure app registration
MS_CLIENT_SECRET=
MS_TENANT_ID=common
MS_REDIRECT_URI=                    # https://<app>/api/ms/callback
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
CRON_SECRET=                        # shared secret for sync endpoints
```

Create `.env.example` with all keys and a README section explaining where each comes from, including step-by-step Azure app registration instructions (portal.azure.com → App registrations → new registration → add delegated permissions `Mail.Read`, `Calendars.Read`, `offline_access`, `User.Read` → create client secret → set redirect URI).

## 4. Database schema

Write as Supabase migrations (`supabase/migrations/`). Enable RLS on all tables with a policy allowing only the authenticated user whose email = `ALLOWED_USER_EMAIL` (store it in a config table or check `auth.jwt() ->> 'email'`). Server-side jobs use the service role key.

```sql
create type temperature as enum ('hot', 'warm', 'cold');
create type pipeline_stage as enum ('none', 'lead', 'in_discussion', 'proposal', 'won', 'dormant');
create type interaction_type as enum ('email_in', 'email_out', 'meeting', 'call', 'note', 'voice_note', 'system');
create type suggestion_status as enum ('pending', 'accepted', 'rejected');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  emails text[] not null default '{}',        -- lowercase; unique across rows, enforce in app code
  phone text,
  company text,
  role text,
  tags text[] not null default '{}',
  temperature temperature not null default 'warm',
  pipeline_stage pipeline_stage not null default 'none',
  next_followup_at date,
  followup_reason text,
  last_contact_at timestamptz,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on contacts using gin (emails);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  type interaction_type not null,
  occurred_at timestamptz not null,
  subject text,
  summary text,
  graph_message_id text,                       -- dedupe key for email interactions
  voice_note_id uuid,
  created_at timestamptz not null default now(),
  unique (contact_id, graph_message_id)
);
create index on interactions (contact_id, occurred_at desc);

create table voice_notes (
  id uuid primary key default gen_random_uuid(),
  audio_path text not null,                    -- Supabase Storage path
  transcript text,
  summary text,
  action_items jsonb not null default '[]',
  suggested_followup_at date,
  created_at timestamptz not null default now()
);

create table voice_note_contacts (
  voice_note_id uuid references voice_notes(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  primary key (voice_note_id, contact_id)
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'new_contact',
  payload jsonb not null,   -- {name, email, company_guess, thread_count, first_seen, last_seen, sample_subjects[]}
  status suggestion_status not null default 'pending',
  source text not null,     -- 'backfill' | 'sync'
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique ((payload->>'email'))
);

create table sync_state (
  id int primary key default 1 check (id = 1),  -- singleton row
  ms_refresh_token text,
  inbox_delta_link text,
  sent_delta_link text,
  backfill_done boolean not null default false,
  last_sync_at timestamptz,
  last_error text
);

create table settings (
  id int primary key default 1 check (id = 1),
  hot_days int not null default 7,
  warm_days int not null default 30,
  cold_days int not null default 90,
  suggestion_thread_threshold int not null default 3
);
insert into settings (id) values (1);
insert into sync_state (id) values (1);
```

Follow-up queue is a view:

```sql
create view followup_queue as
select c.*,
  greatest(
    coalesce(current_date - c.next_followup_at, 0),
    coalesce(extract(day from now() - c.last_contact_at)::int -
      case c.temperature when 'hot' then (select hot_days from settings)
                         when 'warm' then (select warm_days from settings)
                         else (select cold_days from settings) end, 0)
  ) as overdue_days,
  case when c.next_followup_at <= current_date then coalesce(c.followup_reason, 'Follow-up due')
       else extract(day from now() - c.last_contact_at)::int || ' days quiet' end as due_reason
from contacts c
where not c.archived
  and (c.next_followup_at <= current_date
       or c.last_contact_at < now() - (
         case c.temperature when 'hot' then (select hot_days from settings)
                            when 'warm' then (select warm_days from settings)
                            else (select cold_days from settings) end || ' days')::interval)
order by overdue_days desc;
```

## 5. App structure & routes

```
app/
  (auth)/login/page.tsx          # magic link; reject emails != ALLOWED_USER_EMAIL
  page.tsx                       # Dashboard
  contacts/page.tsx              # searchable list + add contact
  contacts/[id]/page.tsx         # detail: fields (inline edit), interaction timeline
  note/page.tsx                  # voice note recorder
  review/page.tsx                # suggestion review (backfill + ongoing)
  settings/page.tsx              # thresholds, MS connection status, run backfill
  api/ms/connect/route.ts        # redirect to Microsoft consent
  api/ms/callback/route.ts       # exchange code, store refresh token in sync_state
  api/sync/backfill/route.ts     # POST, long-running backfill (see §6); protect w/ auth
  api/sync/delta/route.ts        # POST, delta sync; protect w/ CRON_SECRET header
  api/voice/process/route.ts     # POST {voice_note_id}: Whisper + Haiku pipeline
lib/
  supabase/ (client.ts, server.ts, admin.ts)
  graph.ts                       # token refresh, delta queries, message paging
  extract.ts                     # Haiku prompts: signature extraction, note summary
supabase/
  migrations/
  functions/sync-cron/           # edge function: fetch app /api/sync/delta w/ CRON_SECRET
```

Scheduling: pg_cron job every 15 min invokes the edge function (or use `pg_net` to call the Vercel endpoint directly with the `CRON_SECRET` header). Document the `select cron.schedule(...)` statement in the README; it must be run once in the Supabase SQL editor.

## 6. Email sync — implementation detail

### Graph auth
Authorization-code flow with `offline_access`. Store the refresh token in `sync_state`. `lib/graph.ts` exposes `getAccessToken()` that refreshes on demand (refresh tokens rotate — always persist the new one). Handle revocation: on `invalid_grant`, set `last_error` and surface "Reconnect Microsoft" on the settings page.

### Backfill (one-off, from settings page)
1. Page through `/me/messages` (Inbox + Sent folders) with `$select=from,toRecipients,ccRecipients,subject,receivedDateTime,id&$top=100`, going back 2 years. Respect 429s (honor `Retry-After`). This may take many requests — run in batches; persist progress so it's resumable (store a cursor in `sync_state` as jsonb if needed).
2. Aggregate correspondents in memory/DB keyed by email (lowercase). Track: display name, thread/message count, first/last seen, up to 3 sample subjects, domain.
3. Filter noise before creating suggestions: skip his own address, `no-reply|noreply|donotreply|notifications|newsletter|mailer|@calendly|invoices?@` patterns, and any address seen in only 1 message that he never replied to.
4. Insert remaining as `suggestions` (source `backfill`). Do NOT create contacts directly.
5. `/review` page: table sorted by message count desc, columns: name, email, domain, count, last seen, sample subjects; accept / reject per row plus "accept all from domain" and multi-select bulk actions.
6. On accept: create contact, then (async, fire-and-forget or queued) fetch that correspondent's messages again to write historical `interactions` (dedupe on `graph_message_id`) and set `last_contact_at`. Direction: `email_in` if they sent it, `email_out` if the owner did.

### Delta sync (every 15 min)
1. Use Graph delta queries: `/me/mailFolders/inbox/messages/delta` and `/me/mailFolders/sentitems/messages/delta`; persist `deltaLink`s in `sync_state`. First run without a delta link: initialize from now (backfill covers history).
2. For each new message, collect counterpart addresses (from + to + cc, excluding the owner's).
3. **Known contact** (email in some `contacts.emails`):
   - Insert `interaction` (dedupe on unique constraint), update `last_contact_at` if newer.
   - If the message is *from* the contact, run signature extraction (§8) on the body (`$select=body`, strip HTML, take last ~1500 chars). Auto-apply non-empty extracted fields that differ from current values, but never overwrite a non-null phone/role/company with a *different* value silently — in that case append a line to `contacts.notes` ("Email signature on <date> showed phone X, current record has Y") and log a `system` interaction. Empty fields are filled directly.
4. **Unknown correspondent**: upsert a tally into the `suggestions` payload (increment `thread_count`, update `last_seen`). Only set status `pending`/visible once `thread_count >= settings.suggestion_thread_threshold`. Skip the noise patterns from backfill. Previously rejected emails stay rejected — never re-suggest.
5. Update `last_sync_at`; on failure write `last_error` (dashboard shows a subtle warning banner if sync is >2h stale or errored).

## 7. Voice notes — implementation detail

`/note` page (must work well on a phone):
1. Attendee picker: fetch today's calendar events via Graph (`/me/calendarview?startDateTime=...&endDateTime=...`), match attendee emails to contacts, offer each event as a one-tap chip ("Meeting: Project X — 3 attendees, 2 in CRM"). Also a plain contact search multi-select and an inline "quick add contact" (name + email only).
2. Record with `MediaRecorder` (audio/webm; fall back to mp4 on Safari). Show elapsed time; cap 15 min.
3. Upload to Supabase Storage bucket `voice-notes` (private), create `voice_notes` row + `voice_note_contacts` rows, then call `/api/voice/process`.
4. Process: download audio server-side → Whisper (`whisper-1`) → transcript. Then Haiku with the transcript + attendee names, returning JSON: `{summary, action_items: [{text, owner}], suggested_followup_at: date|null, temperature_hint: 'hot'|'warm'|'cold'|null}`. Prompt it to resolve relative dates ("in two weeks") against the note's creation date.
5. Save results; insert an `interaction` (type `voice_note`, summary = the summary) for every attendee; update their `last_contact_at`.
6. UI shows the summary with two one-tap confirmations: apply `suggested_followup_at` to next_followup_at, apply `temperature_hint`. These are NOT auto-applied.
7. Show processing state (transcribing → summarising → done); handle failure with a retry button (audio is already stored).

## 8. LLM extraction (lib/extract.ts)

Use `claude-haiku-4-5`, `max_tokens` small, temperature 0, and demand strict JSON (use a tool/structured output or parse defensively). Two prompts:

1. **Signature extraction** — input: sender name/email + message tail. Output: `{phone: string|null, role: string|null, company: string|null}`. Instruct it to return null when unsure and to ignore phone numbers of other people quoted in the thread.
2. **Voice note summary** — as in §7.4.

Never let extraction failures break sync — wrap in try/catch, log, continue.

## 9. Dashboard (app/page.tsx)

Three sections, in order:

1. **Follow-up queue** — from `followup_queue` view, top 15. Row: name, company, due_reason, overdue badge, actions: `mailto:` (prefilled subject "Following up"), `tel:` (if phone), snooze (+1w / +1m → sets next_followup_at), "done" (clears next_followup_at, sets last_contact_at = now, logs a `note` interaction "Marked followed-up").
2. **Hot leads** — contacts with pipeline_stage in (lead, in_discussion, proposal), grouped by stage, each row with temperature dot, days since last contact, same quick actions.
3. **Inbox** — pending suggestions (accept/reject inline, link to /review if >5) and last 10 interactions across all contacts.

Header: sync status chip (last synced Xm ago / error state / "Connect Microsoft" if not connected).

## 10. Auth & security

- Supabase magic-link auth; middleware protects all routes. Reject sign-in attempts for any email other than `ALLOWED_USER_EMAIL` (both in a `before` check on the login form and via RLS).
- RLS on every table; storage bucket private with signed URLs for playback.
- `api/sync/delta` requires `Authorization: Bearer ${CRON_SECRET}`. All Graph/OpenAI/Anthropic calls server-side only; no keys in client bundles.
- Never log email bodies or transcripts; log message IDs and counts only.

## 11. Build phases — commit and verify each before proceeding

**Phase 1 — Scaffold + manual CRM.** Repo, Tailwind, Supabase migrations, auth + single-user lockdown, contacts CRUD (list/search/detail/inline edit/archive), manual interactions (log a call/note), dashboard with follow-up queue + hot leads working off manual data, settings page shell. *Acceptance: can add a contact, set temperature/stage/follow-up date, see it in the queue, click mailto/tel, snooze/done.*

**Phase 2 — Microsoft connect + backfill.** Azure OAuth flow, token storage/refresh, backfill job + progress UI, /review screen with bulk accept, historical interaction import on accept. *Acceptance: connects a real mailbox, backfill produces sensible ranked suggestions, accepting creates a contact with a populated timeline.*

**Phase 3 — Ongoing sync.** Delta endpoint, edge function + pg_cron schedule (documented SQL), interaction logging, signature auto-enrichment with conflict-note behaviour, new-contact suggestion tally, sync status chip + staleness banner. *Acceptance: send/receive a test email with a known contact → interaction appears within 15 min; unknown sender crosses threshold → suggestion appears.*

**Phase 4 — Voice notes.** Recorder page, calendar-based attendee picker, storage upload, Whisper + Haiku pipeline, one-tap follow-up/temperature confirmations, retry on failure. *Acceptance: record a note on a phone against 2 contacts → both timelines show the summary; a spoken "check back in two weeks" yields the right suggested date.*

**Phase 5 — Polish.** Tags + filters on contacts list, threshold settings editable, empty states, mobile pass over dashboard and contact detail, README covering all setup (Azure, Supabase, Vercel, cron SQL, env vars).

## 12. Conventions

- TypeScript strict; zod-validate all API route inputs and LLM outputs.
- Server components by default; client components only where interactive.
- Keep it plain Tailwind (no component library) — clean, dense, desktop-first except /note and dashboard which must be great on mobile.
- Timezone: Australia/Melbourne for all date display and "today" logic.
- Seed script with ~10 fake contacts/interactions for local dev.

## 13. Out of scope — do not build

Multi-user, teams, companies as a table, deal values/forecasting, sending email from the app, Gmail support, duplicate-merge tooling, native mobile app, notification emails/push.
