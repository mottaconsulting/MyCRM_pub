> **Historical document.** This is the original v1 build spec. The shipped app has since moved to Google Gemini (not Anthropic), password sign-in, and multi-tenant RLS. See the top-level README.md and SETUP.md for what actually runs.

# MyCRM — Design Spec (v1)

Single-user CRM for consulting work. Core idea: **you decide who's in the CRM; the system keeps them up to date automatically.**

## Guiding principles

1. Curation is manual, enrichment is automatic. You approve a person once; after that, email sync updates their record without asking.
2. Rules over ML. Follow-up logic is simple, transparent rules you can tweak.
3. Fewest possible tables and screens. Anything that can be a field instead of a table, is.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | Next.js (App Router) on Vercel | One repo, one deploy, API routes included |
| DB / Auth / Storage | Supabase (Postgres, magic-link auth, Storage for audio) | Free tier is plenty for one user |
| Email + Calendar | Microsoft Graph API (delegated) | Your M365 mailbox |
| Background sync | Supabase Edge Function + pg_cron | Vercel Hobby cron is once/day only; pg_cron runs every 15 min free |
| Transcription | OpenAI Whisper API | ~$0.006/min, accurate |
| Extraction / summaries | Claude Haiku API | Signature parsing, note summaries, action items |
| Repo / CI | GitHub → Vercel auto-deploy | |

## Data model (6 tables)

**contacts** — name, emails[] (people have multiple), phone, company (plain text, no companies table in v1), role, tags[], temperature (`hot | warm | cold`), pipeline_stage (`none | lead | in_discussion | proposal | won | dormant`), next_followup_at, followup_reason, last_contact_at, notes, archived.

**interactions** — contact_id, type (`email_in | email_out | meeting | call | note | voice_note`), occurred_at, subject, summary, graph_message_id (dedupe), voice_note_id.

**voice_notes** — audio_url, transcript, summary, action_items jsonb, created_at.

**voice_note_contacts** — join: one note → many attendees.

**suggestions** — type (`new_contact`), payload jsonb (name, email, company, thread count, last seen), status (`pending | accepted | rejected`), source (`backfill | sync`).

**sync_state** — Graph delta tokens, last run, error log.

Field updates to *existing* contacts (new phone/title found in a signature) apply automatically and get logged as an interaction of type `note` — no suggestion queue for those, per your preference.

## Feature 1 — Email sync

**One-off backfill (bootstrap):**
- Page through mailbox history (Inbox + Sent, ~2 years) via Graph.
- Aggregate by correspondent: name, email, domain, thread count, first/last contact.
- Filter obvious noise (no-reply@, newsletters, calendar invites).
- Present a ranked review screen — you tick who becomes a contact, bulk-accept by domain. Accepted contacts get their historical interactions logged and last_contact_at set.

**Ongoing (every 15 min):**
- Graph delta query on Inbox + Sent.
- Known contact involved → log interaction, update last_contact_at, run Haiku over signature/body to extract phone, title, company changes → auto-apply.
- Unknown correspondent → count threads; at ≥3 threads (tunable) create a `new_contact` suggestion. You accept/reject from the dashboard.

**Auth:** one Azure app registration (free), delegated `Mail.Read`, `Calendars.Read`, `offline_access`. One-time consent; refresh token stored server-side in Supabase.

## Feature 2 — Voice notes

Mobile-friendly `/note` page:

1. Pick attendees — defaults offered from today's calendar events (Graph), or search contacts manually. Can add a new contact inline.
2. Tap record, speak, stop. Audio → Supabase Storage.
3. Whisper transcribes → Haiku produces: clean summary, action items, and a suggested next_followup_at ("said to check back in two weeks" → date).
4. Saved as an interaction against every attendee. Suggested follow-up date shown for one-tap accept.

## Feature 3 — Dashboard

Single page, three sections:

**Follow-up queue** — contacts due for contact, sorted most-overdue first. Due when next_followup_at has passed, or silence exceeds the temperature threshold: hot 7 days, warm 30, cold 90 (tunable). Each row: name, company, reason ("14 days quiet", "promised proposal"), `mailto:` and `tel:` links, snooze, done.

**Hot leads** — contacts with pipeline_stage in (lead, in_discussion, proposal), grouped by stage, sorted by temperature then recency. Same quick actions.

**Inbox** — pending new-contact suggestions (accept/reject) + recent activity feed.

Plus a plain contacts list with search, and a contact detail page showing the full interaction timeline.

## Build phases

1. **Scaffold** — repo, Supabase schema, auth, contacts CRUD, dashboard shell. *Usable as a manual CRM immediately.*
2. **Graph auth + backfill** — connect mailbox, run bootstrap, suggestion review screen.
3. **Ongoing sync** — pg_cron delta sync, auto-enrichment, new-contact suggestions.
4. **Voice notes** — record → transcribe → summarise → link.
5. **Polish** — tags, filters, mobile tweaks, temperature threshold settings.

Each phase ships something usable; stop anywhere and it still works.

## Costs

Supabase free, Vercel Hobby free, GitHub free, Azure app registration free. Whisper + Haiku usage for one person: well under **$5/month**. Only real dependency to set up: the Azure app registration for Graph access.

## Deliberately out of scope (v1)

Multi-user/teams, companies as entities, deal values & revenue forecasting, email sending from the app, Gmail, duplicate-merge tooling, mobile app (responsive web instead).
