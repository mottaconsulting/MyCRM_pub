# MyCRM

A small, opinionated CRM for independent consultants. **You decide who is in the CRM; the app keeps their records up to date from your Microsoft 365 mailbox and calendar.**

Built with Next.js, Supabase and Google Gemini. Multi-tenant with Postgres row-level security, so one deployment can serve several consultants who each see only their own data.

> Setup instructions are in [SETUP.md](SETUP.md). Working on the code with Claude Code or another coding agent? Point it at [CLAUDE.md](CLAUDE.md). The original design notes live in [docs/](docs/).

## What it does

- **Contacts** with multiple emails and phones, company, role, tags, interests, temperature (hot / warm / cold), pipeline stage, LinkedIn URL, website, warning flags and your own private notes.
- **Email sync** from Microsoft 365. A one-off catch-up crawl proposes contacts from ~2 years of mail. After that a scheduled delta sync logs every email exchanged with a known contact and suggests new contacts once an unknown correspondent reaches a thread threshold.
- **Calendar sync.** Past and upcoming Outlook meetings land on each attendee's timeline, grouped by meeting. Teams meeting transcripts can be pulled and summarised.
- **AI enrichment (Gemini).** Phone, title and company are extracted from the contact's own email signatures. Interactions get short summaries. Everything the AI writes is kept separate from the notes you type.
- **Follow-up cockpit.** Dashboard with a follow-up queue, outstanding commitments, awaiting-reply detection, recent meetings to review, and quick actions (email, phone, LinkedIn, book a coffee).
- **Nurture.** Pick people you have not spoken to in a while and have Gemini draft a short personal note in your voice, then redraft with steering instructions.
- **Campaigns.** Filter an audience by interest, stage or keyword, write one brief, and get one personalised email per person.
- **LinkedIn helpers.** Import your LinkedIn `Connections.csv` export, and auto-find profile URLs through a web search backend (Serper or Google Programmable Search). No LinkedIn scraping or automation.
- **Duplicate finder** that groups contacts sharing an email or a normalised name, with merge.
- **Installable PWA** with a mobile-first layout.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, TypeScript, Tailwind v4) |
| Database, auth | Supabase (Postgres with RLS, password auth) |
| Mail and calendar | Microsoft Graph API (delegated OAuth) |
| AI | Google Gemini via the REST API (no SDK) |
| Web search (optional) | Serper.dev or Google Programmable Search |
| Hosting | Vercel (any Node host works) |
| Background sync | Vercel Cron daily, plus optional Supabase pg_cron every 15 minutes |

## Security model

- Every data table carries a `tenant_id`. RLS policy `tenant_all` restricts reads and writes to `tenant_id = auth_tenant_id()`, and a trigger stamps the tenant on insert. A user without a profile sees nothing.
- A super admin can switch between tenants through a picker in the nav, but still sees one tenant at a time. Non-admins cannot promote themselves or change tenant.
- Server-side sync jobs use the Supabase service-role key, which bypasses RLS. That code loops tenants explicitly and sets `tenant_id` on every write.
- `/api/sync/*` endpoints are protected by a shared `CRON_SECRET` bearer token.
- Microsoft refresh tokens are stored per tenant in the `sync_state` table. Treat database access accordingly.
- All Graph, Gemini and search calls are server-side. No API keys reach the browser.

## Project structure

```
app/
  (auth)/login/          password sign-in
  (app)/                 authenticated shell with nav
    page.tsx             dashboard
    contacts/            list, detail with inline edit, server actions, CSV import
    review/              accept or reject suggested contacts
    nurture/             AI-drafted keep-in-touch notes
    campaigns/           audience filter + per-person AI emails
    linkedin/            auto-find LinkedIn profile URLs
    duplicates/          find and merge duplicate contacts
    note/                voice-note placeholder (not implemented)
    settings/            thresholds, interests, Microsoft connection, manual syncs
  api/ms/                Microsoft OAuth connect + callback
  api/sync/              cron entry point and enrichment drain (CRON_SECRET)
lib/
  graph.ts               Microsoft Graph client (auth, mail delta, calendar, transcripts)
  sync.ts, calendar.ts, teams.ts, enrich.ts
  gemini.ts              Gemini JSON client with house-style system instruction
  web-search.ts, linkedin-search.ts, linkedin-csv.ts
  tenant.ts              tenant and owner identity helpers
  supabase/              browser, server, admin and middleware clients
components/              UI components
supabase/migrations/     schema, applied in numeric order (0001 to 0016)
supabase/seed.sql        optional fake demo data
docs/                    original v1 design spec and build notes (historical)
```

## Things you will probably want to change

- `APP_TIMEZONE` in `lib/config.ts` (defaults to Australia/Melbourne).
- The Gemini house style in `lib/gemini.ts` (defaults to Australian English, no dashes).
- The founding tenant name and owner identity placeholders in `supabase/migrations/0016_multitenant.sql` (see SETUP.md).
- Branding in `app/layout.tsx`, `app/manifest.ts`, `components/Logo.tsx` and the icons in `public/`.

## Licence

MIT. See [LICENSE](LICENSE).

## Status

This is a working personal tool, published as-is. There is no test suite and no support. Pull requests are welcome but may not be merged.
