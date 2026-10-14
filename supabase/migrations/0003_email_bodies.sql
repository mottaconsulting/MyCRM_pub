-- MyCRM — store email bodies on interactions so they can be read/opened
-- from a contact's timeline. Additive + idempotent.

alter table interactions add column if not exists body text;      -- stripped plain text
alter table interactions add column if not exists web_link text;  -- Outlook web URL to the original
