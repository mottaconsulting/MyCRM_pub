-- MyCRM — enrichment fields (Phase 2/3)
-- Additive + idempotent. Separates the AI-generated summary from the user's
-- own notes so an AI pass never overwrites what the owner typed.

alter table contacts add column if not exists ai_summary text;
alter table contacts add column if not exists ai_summary_at timestamptz;
alter table contacts add column if not exists linkedin_url text;
