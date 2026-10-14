-- MyCRM — timeline meetings + annotations, and a keep-in-touch opt-out.
-- Additive + idempotent.
--
--  * interactions.note      : the owner's own note on a timeline item (esp. meetings).
--                             Calendar meetings reuse the interactions table
--                             (type = 'meeting', body = when/where/who).
--  * contacts.keep_in_touch : when false, the contact is dismissed from the
--                             "Keep in touch" 4-month reconnect list.

alter table interactions add column if not exists note text;

alter table contacts
  add column if not exists keep_in_touch boolean not null default true;
