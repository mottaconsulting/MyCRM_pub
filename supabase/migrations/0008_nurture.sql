-- MyCRM — nurture cadence. Tracks when the owner last sent a personal
-- check-in to a contact, so the nurture feed can rotate through people and not
-- resurface someone he just reached out to. Additive + idempotent.

alter table contacts add column if not exists last_nurtured_at timestamptz;
