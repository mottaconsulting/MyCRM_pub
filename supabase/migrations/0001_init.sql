-- MyCRM — initial schema (Phase 1)
-- Single-user CRM. RLS restricts all access to the one allowed user; server-side
-- jobs use the service-role key which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type temperature as enum ('hot', 'warm', 'cold');
create type pipeline_stage as enum ('none', 'lead', 'in_discussion', 'proposal', 'won', 'dormant');
create type interaction_type as enum ('email_in', 'email_out', 'meeting', 'call', 'note', 'voice_note', 'system');
create type suggestion_status as enum ('pending', 'accepted', 'rejected');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  emails text[] not null default '{}',        -- lowercase; unique across rows, enforced in app code
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
create index contacts_emails_idx on contacts using gin (emails);

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
create index interactions_contact_occurred_idx on interactions (contact_id, occurred_at desc);

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
  resolved_at timestamptz
);
-- One suggestion per email. Expression uniqueness must be a unique index, not an
-- inline table constraint (Postgres does not allow UNIQUE (expr) in CREATE TABLE).
create unique index suggestions_email_idx on suggestions ((payload->>'email'));

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

-- ---------------------------------------------------------------------------
-- updated_at trigger for contacts
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Follow-up queue view (security_invoker so RLS on contacts still applies)
-- ---------------------------------------------------------------------------
create view followup_queue
with (security_invoker = true) as
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

-- ---------------------------------------------------------------------------
-- Row Level Security — single allowed user
-- ---------------------------------------------------------------------------
-- Defence-in-depth behind the app-level lockdown. The allowed email is checked
-- against the JWT. Keep this in sync with ALLOWED_USER_EMAIL.
create or replace function is_allowed_user()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'owner@example.com'
$$;

alter table contacts enable row level security;
alter table interactions enable row level security;
alter table voice_notes enable row level security;
alter table voice_note_contacts enable row level security;
alter table suggestions enable row level security;
alter table sync_state enable row level security;
alter table settings enable row level security;

create policy allowed_user_all on contacts
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
create policy allowed_user_all on interactions
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
create policy allowed_user_all on voice_notes
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
create policy allowed_user_all on voice_note_contacts
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
create policy allowed_user_all on suggestions
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
create policy allowed_user_all on sync_state
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
create policy allowed_user_all on settings
  for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
