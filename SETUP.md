# Setting up MyCRM

This walks through a fresh deployment: Supabase database, your first user, the app on Vercel, then the optional integrations (Microsoft 365, Gemini, web search, scheduled sync).

Allow about an hour. Nothing here costs money on the free tiers except Gemini and web-search usage, which are tiny for one person.

## 0. Prerequisites

- Node 20 or newer and npm 10 or newer
- A [Supabase](https://supabase.com) project (free tier is fine)
- A [Vercel](https://vercel.com) account (or any host that runs Next.js)
- Optional: a Microsoft 365 account plus access to [Azure App registrations](https://portal.azure.com)
- Optional: a [Google AI Studio](https://aistudio.google.com) Gemini API key
- Optional: a [Serper.dev](https://serper.dev) key or a Google Programmable Search engine

## 1. Clone and install

```bash
git clone https://github.com/mottaconsulting/MyCRM_pub.git mycrm
cd mycrm
npm install
cp .env.example .env.local
```

Fill in `.env.local` as you go through the steps below. The file is gitignored.

## 2. Supabase: keys

In the Supabase dashboard open **Project Settings, then API** and copy:

| Dashboard value | Env var |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key | `SUPABASE_SERVICE_ROLE_KEY` |

The service-role key bypasses row-level security. It is only read in server code. Never put it in a `NEXT_PUBLIC_` variable.

## 3. Supabase: your first user

The app uses password sign-in and does not send emails, so create users by hand.

1. **Authentication, then Users, then Add user.** Enter your email and a password and tick **Auto confirm**.
2. Repeat for an admin account if you want a separate super-admin login that can switch between tenants. One account is fine to start with.
3. **Authentication, then Providers, then Email:** turn **off** "Allow new users to sign up". Accounts are provisioned manually.

## 4. Supabase: schema

The schema is a chain of migrations in `supabase/migrations/`, applied in numeric order from `0001` to `0016`. Before running them, edit the placeholders in `0016_multitenant.sql`:

| Placeholder | Replace with |
|---|---|
| `'My Company'` | your company or tenant name |
| `'owner@example.com'` (appears twice) | the email of the user you created in step 3 |
| `'admin@example.com'` | the super-admin email, or the same email as above |
| `'Owner Name'`, `'Owner'`, `'your-linkedin-slug'` | your full name, first name and LinkedIn slug (the part after `linkedin.com/in/`) |

Then apply the migrations. Either:

- **SQL editor:** paste each file in order, `0001` through `0016`, and run it. The editor can choke on `do $$ ... $$` blocks if it appends trailing comments; if that happens, run the statements inside the block one at a time.
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.

Optionally run `supabase/seed.sql` for ten fake contacts to click around with. It truncates the contacts table first, so never run it against real data.

After the migrations, confirm your profile row exists:

```sql
select p.email, t.name as tenant, p.is_super_admin
from profiles p join tenants t on t.id = p.tenant_id;
```

If it is empty, your auth user did not exist yet when `0016` ran. Insert it now:

```sql
insert into profiles (id, tenant_id, email)
select id, '00000000-0000-0000-0000-000000000001', email
from auth.users where lower(email) = 'you@yourdomain.com'
on conflict (id) do nothing;
```

## 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000 and sign in with the user from step 3. You should see an empty dashboard. Add a contact by hand to confirm reads and writes work.

Set `CRON_SECRET` to any long random string now, even locally, because the manual sync buttons in Settings call the same protected endpoints.

## 6. Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add every variable from `.env.example` that you have filled in. `NEXT_PUBLIC_SITE_URL` can be left empty on Vercel; the app derives it from Vercel's own variables.
3. Deploy. `vercel.json` registers a daily cron that hits `/api/sync/cron`. Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when that env var is set.

## 7. Microsoft 365 (mail and calendar sync)

1. Go to **portal.azure.com, then App registrations, then New registration**.
2. Name it, choose **Accounts in any organizational directory and personal Microsoft accounts**, and add a **Web** redirect URI of `https://<your-app>/api/ms/callback`. Add `http://localhost:3000/api/ms/callback` as well for local use.
3. **API permissions, then Add a permission, then Microsoft Graph, then Delegated.** Add:
   - `Mail.Read`
   - `Calendars.Read`
   - `User.Read`
   - `offline_access`
   - `OnlineMeetings.Read` and `OnlineMeetingTranscript.Read.All` (only for Teams transcript summaries; these need admin consent)
4. **Certificates and secrets, then New client secret.** Copy the value immediately.
5. Fill the env:

```
MS_CLIENT_ID=<Application (client) ID>
MS_CLIENT_SECRET=<secret value>
MS_TENANT_ID=common
MS_REDIRECT_URI=https://<your-app>/api/ms/callback
```

6. In the app open **Settings** and click **Connect Microsoft**. The refresh token is stored against your tenant. Then run the **catch-up crawl** once to get contact suggestions from your mailbox, and review them on the **Review** page.

If you cannot grant admin consent for the two transcript scopes, remove them from `MS_SCOPES` in `lib/graph.ts` before connecting, otherwise Microsoft may block the whole consent screen.

## 8. Google Gemini (AI features)

Create a key in Google AI Studio and set `GEMINI_API_KEY`. The model defaults to the rolling `gemini-flash-latest` alias; pin a specific model with `GEMINI_MODEL` if you prefer. Without a key the app still works, but enrichment, summaries, nurture drafts and campaigns return nothing.

The system instruction in `lib/gemini.ts` forces Australian English and bans dashes. Edit it to match your own voice.

## 9. Web search (LinkedIn auto-find)

Optional. Used only to look up a person's public LinkedIn profile URL via a normal web search. Configure one of:

- `SERPER_API_KEY` from serper.dev (simplest), or
- `GOOGLE_CSE_KEY` plus `GOOGLE_CSE_CX` from a Google Programmable Search engine that searches the whole web.

## 10. Scheduled sync every 15 minutes (optional)

Vercel's free cron runs once a day. For a 15-minute cadence, let Supabase call the endpoint instead:

1. **Database, then Extensions:** enable `pg_cron` and `pg_net`.
2. In the SQL editor, replacing the URL and the secret (it must match `CRON_SECRET` on Vercel byte for byte):

```sql
select cron.schedule(
  'crm-sync', '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://<your-app>/api/sync/cron',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     ); $$
);
```

To check it is working, look at `sync_state.last_sync_at`, or inspect responses in `net._http_response`. A 401 there means the secret does not match.

## 11. Adding another tenant

Each tenant is a separate consultant with their own contacts and their own Microsoft connection.

```sql
select provision_tenant('Acme Pty Ltd');   -- returns the new tenant id
update settings set
  owner_name = 'Their Name', owner_first_name = 'Their',
  owner_email = 'them@acme.com', owner_linkedin_slug = 'their-slug'
where tenant_id = '<new tenant id>';
```

Create their auth user (step 3), then link it:

```sql
insert into profiles (id, tenant_id, email)
select id, '<new tenant id>', email from auth.users where lower(email) = 'them@acme.com'
on conflict (id) do nothing;
```

They sign in, open Settings and connect their own Microsoft account. The scheduled sync covers every tenant with a connection.

`provision_tenant` is only callable from the SQL editor (execute is revoked from app roles), so nobody can create tenants from inside the app.

## 12. Troubleshooting

- **"Incorrect email or password" for a user you just created:** the user was not auto-confirmed. Confirm them in Authentication, then Users.
- **Signed in but everything is empty:** no `profiles` row for that user. See the end of step 4.
- **Microsoft connect loops back with an error:** the redirect URI in Azure must match `MS_REDIRECT_URI` exactly, including `https` and no trailing slash.
- **Sync buttons return 401:** `CRON_SECRET` is unset or differs between the caller and the server.
- **Catch-up crawl times out on Vercel:** the Hobby plan caps serverless functions at 60 seconds. The crawl and enrichment drain are built to re-trigger themselves, so run them again; they resume where they stopped.
