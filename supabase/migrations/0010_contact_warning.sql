-- MyCRM — a warning flag on a contact (timewaster / banned / do-not-contact).
-- Holds the short reason text; null = no warning. Flagged contacts are excluded
-- from proactive lists (nurture, keep-in-touch). Additive + idempotent.

alter table contacts add column if not exists warning text;
