-- Interest tags for campaign targeting.
--  contacts.interests        — the interests assigned to each contact
--  settings.interest_options — the master list you maintain in the admin area,
--                              so contacts pick from a clean, consistent vocabulary
alter table contacts
  add column if not exists interests text[] not null default '{}';

alter table settings
  add column if not exists interest_options text[] not null default '{}';
