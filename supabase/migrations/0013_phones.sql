-- Multi-phone support. `phones` holds all numbers (primary first); the existing
-- single `phone` column is kept in sync as phones[0] so QuickActions, enrichment
-- and everything else that reads `phone` keeps working unchanged.
alter table contacts
  add column if not exists phones text[] not null default '{}';

update contacts
  set phones = array[phone]
  where phone is not null and phone <> '' and (phones = '{}' or phones is null);
