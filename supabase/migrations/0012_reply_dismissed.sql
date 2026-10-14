-- Auto-follow-up: "awaiting your reply" tracking.
-- When you dismiss a contact from the awaiting-reply list (their last email was
-- inbound and you don't actually owe a reply), we stamp reply_dismissed_at.
-- The contact only reappears if a NEWER inbound email arrives after that stamp.
alter table contacts
  add column if not exists reply_dismissed_at timestamptz;
