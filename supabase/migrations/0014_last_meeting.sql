-- Track the most recent past meeting per contact, so the contacts list can be
-- sorted by "last meeting". Maintained going forward by the calendar sync;
-- backfilled here from existing meeting interactions.
alter table contacts
  add column if not exists last_meeting_at timestamptz;

update contacts c
set last_meeting_at = sub.mx
from (
  select contact_id, max(occurred_at) as mx
  from interactions
  where type = 'meeting' and occurred_at <= now()
  group by contact_id
) sub
where sub.contact_id = c.id
  and (c.last_meeting_at is null or c.last_meeting_at < sub.mx);
