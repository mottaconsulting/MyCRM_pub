-- MyCRM — add a "project_work" pipeline stage after "won" (active delivery).
-- A contact in project work is still treated as an active/hot engagement for
-- follow-up logic, shown with a work-in-progress (wrench) icon. Idempotent.

alter type pipeline_stage add value if not exists 'project_work' after 'won';
