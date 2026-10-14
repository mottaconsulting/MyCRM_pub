# MyCRM

Instructions for Claude Code (or any coding agent) working in this repository. Read this file first. It is the source of truth for how the app is built, how to set it up, and the rules that must not be broken.

If you are being asked to **set up and run** the app, follow the "Build and run" section below, which points at SETUP.md for the manual dashboard steps. If you are being asked to **change** the app, read "Architecture" and "Invariants" before editing anything.

---

## 1. What this is

A multi-tenant CRM for independent consultants. The owner decides who is in the CRM; the app keeps those records current from the owner's Microsoft 365 mailbox and calendar, and uses Google Gemini for enrichment, summaries and drafting.

Core loop:

1. Connect Microsoft 365 → a catch-up crawl proposes contacts from ~2 years of mail → owner accepts or rejects on `/review`.
2. A scheduled delta sync logs every email and meeting with a known contact, extracts phone / title / company from signatures, and suggests new contacts when an unknown correspondent passes a thread threshold.
3. The dashboard surfaces who to follow up, what was promised, who has not replied, and recent meetings to annotate.
4. `/nurture` and `/campaigns` draft personal emails with Gemini in the owner's voice.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js 16, App Router, TypeScript, Tailwind v4 | React 19, server actions, `proxy.ts` is the middleware |
| Database and auth | Supabase Postgres + Supabase Auth | Password sign-in, no email sending, RLS per tenant |
| Mail and calendar | Microsoft Graph (delegated OAuth) | Plain `fetch`, no SDK. `lib/graph.ts` |
| AI | Google Gemini REST (`generateContent`) | Plain `fetch`, structured JSON output. `lib/gemini.ts` |
| Web search | Serper.dev or Google Programmable Search | Optional. Only for LinkedIn profile lookup |
| Hosting | Vercel | Any Node host works. 60 s function cap shapes the sync design |
| Scheduling | Vercel Cron (daily) + optional Supabase pg_cron (15 min) | Both hit `/api/sync/cron` with `CRON_SECRET` |

Do not introduce an ORM, a Graph SDK, a Gemini SDK, or an auth provider other than Supabase without asking.

## 3. Build and run

```bash
npm install
cp .env.example .env.local      # fill in, see SETUP.md
npm run dev                     # http://localhost:3000
npx tsc --noEmit                # typecheck (must pass)
npx eslint .                    # lint (9 pre-existing react-hooks/purity findings are known)
npm run build                   # production build (must pass)
```

Minimum env for the app to boot: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Everything else degrades gracefully: without `GEMINI_API_KEY` the AI helpers return null, without `MS_*` the Settings page shows "Not connected", without a search key LinkedIn auto-find is disabled.

The database must exist before the app is useful. The schema is `supabase/migrations/0001` through `0016`, applied in order. `0016_multitenant.sql` contains placeholder emails and names that must be edited before it is run. SETUP.md has the full dashboard walkthrough (keys, first user, migrations, Azure app registration, Gemini key, cron). Those steps are manual clicks in third-party dashboards; do them with the human, do not try to script them.

There is no test suite. Verify changes with typecheck, build, and by exercising the page in the browser.

## 4. Architecture

```
proxy.ts                      Next middleware: refreshes the Supabase session, redirects
                              unauthenticated users to /login. /api/sync/* is public to the
                              middleware and enforces CRON_SECRET itself.
app/(auth)/login/             password sign-in (server action in actions.ts)
app/(app)/layout.tsx          authenticated shell: Nav, TenantPicker for super admins
app/(app)/page.tsx            dashboard
app/(app)/contacts/           list + search + sort + filters; [id] detail with inline edit;
                              actions.ts holds every contact mutation and the CSV import
app/(app)/review/             accept / reject suggested contacts (accept runs Gemini enrichment)
app/(app)/nurture/            keep-in-touch drafts
app/(app)/campaigns/          audience filter → one brief → one email per person
app/(app)/linkedin/           find missing LinkedIn URLs via web search
app/(app)/duplicates/         group by shared email or normalised name, merge
app/(app)/settings/           thresholds, interests, Microsoft connect, manual sync buttons
app/(app)/note/               placeholder only (voice notes were never built)
app/api/ms/connect, callback  Microsoft OAuth: CSRF state cookie, refresh token → sync_state
app/api/sync/cron             scheduled entry: for every tenant with a Microsoft connection run
                              delta mail sync, calendar sync, Teams transcript sync, then kick enrich
app/api/sync/enrich           enrichment drain: works ~45 s then re-triggers itself via siteBaseUrl()
lib/supabase/                 client (browser), server (RLS, cookie session), admin (service role),
                              middleware (session refresh)
lib/tenant.ts                 authTenantId(), ownerContext(), tenantsToSync()
lib/graph.ts                  auth URL, token exchange and refresh, mail delta, calendar, transcripts
lib/sync.ts                   deltaSyncCore: Graph delta → interactions + suggestions
lib/calendar.ts               calendarBackfillCore: events → meeting interactions, grouped per meeting
lib/teams.ts                  transcripts → Gemini summary on the meeting interaction
lib/enrich.ts                 signature extraction, thread labels, summaries (Gemini)
lib/gemini.ts                 geminiJson<T>(prompt, schema): house-style system instruction applied to all calls
lib/web-search.ts             searchWebRaw(): Serper first, then Google CSE
lib/linkedin-csv.ts           pure parser for LinkedIn Connections.csv
lib/contacts.ts, names.ts     normalisation helpers (emails, names, website from domain)
lib/types.ts                  Contact, Interaction, Suggestion, enums
components/ui.tsx             SectionCard, EmptyState, Badge, TemperatureBadge, StageBadge, QuickActions
supabase/migrations/          0001 base schema … 0016 tenants + profiles + RLS rewrite
supabase/seed.sql             ten fake contacts; truncates first, never run on real data
docs/                         original v1 spec and build notes, historical, partly superseded
```

### Data model

Tables: `tenants`, `profiles` (auth user → home tenant, `is_super_admin`, `active_tenant_id`), `contacts`, `interactions`, `suggestions`, `contact_updates` (AI-proposed field changes awaiting approval), `settings` (one row per tenant: thresholds, interest options, owner identity), `sync_state` (one row per tenant: Microsoft refresh token, delta links, `last_sync_at`), `voice_notes` and `voice_note_contacts` (unused).

Enums: `temperature` hot/warm/cold; `pipeline_stage` none/lead/in_discussion/proposal/won/project_work/dormant; `interaction_type` email_in/email_out/meeting/call/note/voice_note/system plus LinkedIn message types; `suggestion_status` and `update_status` pending/accepted/rejected.

Every data table has `tenant_id` and a BEFORE INSERT trigger that stamps it from `auth_tenant_id()`.

### Request flow conventions

- Pages are server components that call `createClient()` from `lib/supabase/server.ts` and read under RLS. Most are `export const dynamic = "force-dynamic"`.
- Mutations are server actions in the sibling `actions.ts`, called from small client components. Actions revalidate with `revalidatePath`.
- Anything that must see more than one tenant, or that runs without a user session (cron, OAuth callback, self-triggered drains), uses `createAdminClient()` and passes `tenantId` explicitly everywhere.
- Long jobs are chunked to fit Vercel's 60 s limit and re-trigger themselves or are driven by a client loop (`syncBatch`, `autoTagInterestsBatch`, the campaign runner).

## 5. Invariants (do not break these)

1. **Tenant isolation is RLS, not app code.** Policy `tenant_all` on every data table is `tenant_id = auth_tenant_id()` for USING and WITH CHECK. Never add a policy that widens this, never disable RLS, never add a "see all tenants" path. A super admin switches tenant via `set_active_tenant()` and still sees one tenant at a time.
2. **Service-role code sets `tenant_id` on every insert and filters every read by it.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS, so `lib/sync.ts`, `lib/calendar.ts`, `lib/teams.ts`, `lib/enrich.ts` and the `/api/sync/*` routes must loop `tenantsToSync()` and carry the tenant through. The NOT NULL constraint on `tenant_id` is the safety net; do not remove it.
3. **Secrets stay server-side.** Only `NEXT_PUBLIC_*` variables may be read in client components. `import "server-only"` guards the modules that hold keys; keep it on any new module that reads a secret.
4. **`/api/sync/*` require `Authorization: Bearer <CRON_SECRET>`** and return 401 otherwise. New background endpoints follow the same check.
5. **Microsoft token refresh never passes `scope`.** It returns whatever is currently consented, so adding scopes later does not break existing connections. Keep it that way.
6. **The owner's own notes are never written by AI.** `contacts.notes` and `interactions.note` are human-only. AI output goes to `summary`, `contact_updates`, or dedicated columns.
7. **Owner identity is per tenant**, read from `settings.owner_*` via `ownerContext()`. Never hard-code a person's name or email in code, prompts or migrations.
8. **Migrations are additive and idempotent** (`add column if not exists`, `create or replace`, `on conflict do nothing`). A new migration is a new numbered file; existing files are never edited once applied anywhere.
9. **No LinkedIn automation.** The app imports the user's own CSV export and looks up public profile URLs via web search. Do not add scraping, cookie-based access, or message sending.

## 6. Coding conventions

- TypeScript strict. No `any` unless unavoidable, and then with a comment.
- Server components by default; add `"use client"` only for components that need state or browser APIs.
- Small components with one job. Shared primitives live in `components/ui.tsx` and `components/icons.tsx`; reuse them before adding new ones.
- Tailwind utility classes with the theme tokens defined in `app/globals.css` (`text-ink`, `text-muted`, `bg-card`, `border-line`, `text-accent`, `text-hot`, and so on). Do not add a second styling system.
- Dates: all "today" and display logic uses `APP_TIMEZONE` from `lib/config.ts` through helpers in `lib/date.ts`. Never call `toLocaleDateString()` without a timezone. The helpers are named `todayInMelbourne` and `melbourneDay` after the original deployment; if you change `APP_TIMEZONE`, the names are the only thing that is Melbourne-specific.
- Gemini calls go through `geminiJson()` with an explicit response schema and a Zod or manual validation of the result. Prompts receive owner identity from `ownerContext()`.
- Graph calls go through helpers in `lib/graph.ts`; add a helper rather than calling the API from a page or action.
- Mobile first. Every list row and card must survive a 360 px wide screen (`min-w-0`, `break-words`, no fixed widths).
- Generated text follows the house style in `lib/gemini.ts`: Australian English, no em or en dashes. The nurture redraft strips dashes defensively; keep that.
- File naming: `PascalCase.tsx` for components, `kebab-case.ts` for lib modules, `actions.ts` for server actions next to their page.

## 7. Working with the human

- Dashboard steps (Supabase, Azure, Vercel, Google AI Studio) cannot be done from the terminal. Describe exactly what to click and what value to paste back.
- Never ask the human to paste a secret into the chat. Ask them to put it in `.env.local` or Vercel and confirm.
- Before any SQL that writes to a live database, show the statement and say what it changes. `seed.sql` truncates `contacts`; never run it against real data.
- When a sync job misbehaves, check `sync_state` (`last_sync_at`, `ms_refresh_token` present?) and, for pg_cron, `net._http_response` for 401s before changing code.
- Keep README.md and SETUP.md in step with any change to env vars, migrations, or the setup flow.

## 8. Known gaps

- Voice notes (`/note`) are a placeholder; the Whisper pipeline was never built.
- No automated tests.
- Nine `react-hooks/purity` lint findings predate this repo's publication and are harmless; fix them if touching those files.
- Teams transcript scopes need Azure admin consent; without it the two scopes should be removed from `MS_SCOPES` in `lib/graph.ts`.
