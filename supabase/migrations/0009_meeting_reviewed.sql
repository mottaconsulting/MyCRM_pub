-- MyCRM — mark a meeting as "reviewed" (note added + follow-up decided, or
-- explicitly no follow-up needed) so it drops off the dashboard Recent-meetings
-- list. Additive + idempotent. The meeting stays on the contact's timeline.

alter table interactions add column if not exists reviewed_at timestamptz;
