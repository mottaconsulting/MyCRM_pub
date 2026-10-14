-- 0016_multitenant.sql
-- Multi-tenant foundation. Every row belongs to a tenant, and RLS isolates each
-- tenant's data. Existing data is assigned to the founding tenant (your
-- company). Server-side sync jobs use the service-role key, which BYPASSES
-- RLS, so that code must set/filter tenant_id itself (handled in app code).
--
-- ⚠️ Destructive + production-affecting: take a database backup first, and only
-- apply this together with the matching app deploy (see rollout notes).

-- ---------------------------------------------------------------------------
-- Tenants + user→tenant profiles
-- ---------------------------------------------------------------------------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Founding tenant with a fixed id so the backfill below is simple + idempotent.
insert into tenants (id, name)
  values ('00000000-0000-0000-0000-000000000001', 'My Company')
  on conflict (id) do nothing;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade, -- home tenant
  is_super_admin boolean not null default false,                    -- can cross tenants
  active_tenant_id uuid references tenants(id) on delete set null,  -- super admin's picked tenant
  email text,
  created_at timestamptz not null default now()
);

-- Map the existing (single) user to the founding tenant.
insert into profiles (id, tenant_id, email)
select u.id, '00000000-0000-0000-0000-000000000001', u.email
from auth.users u
where lower(u.email) = 'owner@example.com'
on conflict (id) do nothing;

-- The cross-tenant super admin (admin@example.com). Seeded if that auth user already exists;
-- otherwise run the same insert after creating the user in Supabase Auth.
insert into profiles (id, tenant_id, is_super_admin, email)
select u.id, '00000000-0000-0000-0000-000000000001', true, u.email
from auth.users u
where lower(u.email) = 'admin@example.com'
on conflict (id) do update set is_super_admin = true;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
-- The calling user's effective tenant. For a super admin who has picked a tenant,
-- that's their active_tenant_id; otherwise their home tenant. SECURITY DEFINER so
-- it can read profiles under RLS; STABLE so it can be used inside policies.
create or replace function auth_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
           when p.is_super_admin and p.active_tenant_id is not null then p.active_tenant_id
           else p.tenant_id
         end
  from profiles p where p.id = auth.uid()
$$;

-- Is the caller a cross-tenant super admin?
create or replace function is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false)
$$;

-- Super admin switches which tenant they're viewing. Blocked for everyone else,
-- so a normal user can never escape their own tenant this way.
create or replace function set_active_tenant(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'not permitted';
  end if;
  if target is not null and not exists (select 1 from tenants where id = target) then
    raise exception 'unknown tenant';
  end if;
  update profiles set active_tenant_id = target where id = auth.uid();
end $$;

-- Auto-fill tenant_id on insert from the caller's profile, so app code doesn't
-- have to pass it. Service-role jobs have no auth.uid(), so auth_tenant_id() is
-- null for them and they MUST set tenant_id explicitly (a NOT NULL error catches
-- any mistake — fail closed).
create or replace function set_tenant_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := auth_tenant_id();
  end if;
  return new;
end $$;

-- Convenience for provisioning a new tenant with its settings + sync_state rows.
create or replace function provision_tenant(tenant_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  insert into tenants (name) values (tenant_name) returning id into tid;
  insert into settings (tenant_id) values (tid);
  insert into sync_state (tenant_id) values (tid);
  return tid;
end $$;

-- Unused by the app and its subqueries assume a singleton settings row — drop it.
drop view if exists followup_queue;

-- ---------------------------------------------------------------------------
-- tenant_id on every data table: add, backfill to founding tenant, enforce,
-- index, and a BEFORE INSERT trigger to auto-fill it for authenticated users.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','interactions','suggestions','contact_updates',
    'voice_notes','voice_note_contacts'
  ] loop
    execute format('alter table %I add column if not exists tenant_id uuid references tenants(id) on delete cascade', t);
    execute format($f$update %I set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null$f$, t);
    execute format('alter table %I alter column tenant_id set not null', t);
    execute format('create index if not exists %I on %I (tenant_id)', t || '_tenant_idx', t);
    execute format('drop trigger if exists %I on %I', t || '_set_tenant', t);
    execute format('create trigger %I before insert on %I for each row execute function set_tenant_id()', t || '_set_tenant', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- settings + sync_state: singleton (id = 1) → one row per tenant
-- ---------------------------------------------------------------------------
alter table settings add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update settings set tenant_id = '00000000-0000-0000-0000-000000000001' where id = 1;
alter table settings drop constraint settings_pkey;
alter table settings drop column id;
alter table settings alter column tenant_id set not null;
alter table settings add primary key (tenant_id);
drop trigger if exists settings_set_tenant on settings;
create trigger settings_set_tenant before insert on settings for each row execute function set_tenant_id();

-- Per-tenant owner identity: who "I" am for this tenant. Used by AI sign-offs and
-- to recognise the owner's own address in mail/calendar sync. Set per new tenant.
alter table settings add column if not exists owner_name text;
alter table settings add column if not exists owner_first_name text;
alter table settings add column if not exists owner_email text;
alter table settings add column if not exists owner_linkedin_slug text;
update settings set
  owner_name          = coalesce(owner_name, 'Owner Name'),
  owner_first_name    = coalesce(owner_first_name, 'Owner'),
  owner_email         = coalesce(owner_email, 'owner@example.com'),
  owner_linkedin_slug = coalesce(owner_linkedin_slug, 'your-linkedin-slug')
where tenant_id = '00000000-0000-0000-0000-000000000001';

alter table sync_state add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update sync_state set tenant_id = '00000000-0000-0000-0000-000000000001' where id = 1;
alter table sync_state drop constraint sync_state_pkey;
alter table sync_state drop column id;
alter table sync_state alter column tenant_id set not null;
alter table sync_state add primary key (tenant_id);
drop trigger if exists sync_state_set_tenant on sync_state;
create trigger sync_state_set_tenant before insert on sync_state for each row execute function set_tenant_id();

-- ---------------------------------------------------------------------------
-- RLS: drop the single-user policies, add per-tenant isolation on every table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','interactions','suggestions','contact_updates',
    'voice_notes','voice_note_contacts','settings','sync_state'
  ] loop
    execute format('drop policy if exists allowed_user_all on %I', t);
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_all on %I for all to authenticated using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id())',
      t
    );
  end loop;
end $$;

-- Tenants + profiles: a user may read only their own tenant / profile. Writes are
-- service-role only (no insert/update/delete policy for authenticated), so tenant
-- membership can't be self-assigned from the app.
alter table tenants enable row level security;
alter table profiles enable row level security;
-- A user sees their own tenant; a super admin can list them all (for the picker).
create policy tenant_read_self on tenants for select to authenticated
  using (is_super_admin() or id = auth_tenant_id());
create policy profile_read_self on profiles for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Function EXECUTE hardening
-- ---------------------------------------------------------------------------
-- provision_tenant is a SECURITY DEFINER admin helper. It's run manually from
-- the SQL console (as a superuser, which ignores these grants) and never from
-- the app, so revoke it from app roles — otherwise any authenticated user could
-- create unlimited tenants. The other helpers MUST stay executable: RLS policies
-- call auth_tenant_id()/is_super_admin(), and the picker calls set_active_tenant.
revoke execute on function provision_tenant(text) from public, anon, authenticated;
