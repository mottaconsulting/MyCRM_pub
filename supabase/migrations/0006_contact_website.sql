-- MyCRM — company website on a contact, derived from their email domain
-- (e.g. jane@example.com → https://example.com). Additive + idempotent.

alter table contacts add column if not exists website text;
