-- MyCRM — suggested data-change updates.
-- When enrichment finds a company/role/phone that differs from what's stored,
-- it proposes an update here for approval instead of silently overwriting.

do $$ begin
  create type update_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists contact_updates (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  field text not null,               -- 'company' | 'role' | 'phone'
  current_value text,
  suggested_value text not null,
  evidence text,
  status update_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (contact_id, field, suggested_value)
);
create index if not exists contact_updates_status_idx
  on contact_updates (status, created_at desc);

alter table contact_updates enable row level security;

do $$ begin
  create policy allowed_user_all on contact_updates
    for all to authenticated using (is_allowed_user()) with check (is_allowed_user());
exception when duplicate_object then null; end $$;
