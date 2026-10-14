-- MyCRM — dev seed (~10 fake contacts + interactions)
-- Safe to re-run: clears contacts (cascades to interactions) first.
-- Apply after migrations. Via CLI: `supabase db reset` runs this automatically;
-- or paste into the Supabase SQL editor.

truncate table interactions restart identity cascade;
truncate table voice_note_contacts, voice_notes restart identity cascade;
delete from contacts;
delete from suggestions;

insert into contacts
  (first_name, last_name, emails, phone, company, role, tags, temperature, pipeline_stage, next_followup_at, followup_reason, last_contact_at, notes)
values
  ('Sarah', 'Chen', '{sarah.chen@brightpath.com.au}', '+61 400 111 222', 'BrightPath', 'Head of Ops', '{priority}', 'hot', 'proposal', current_date - 2, 'Send revised proposal', now() - interval '10 days', 'Wants pricing options.'),
  ('James', 'Okoro', '{james@nimbus.io}', '+61 400 333 444', 'Nimbus', 'CTO', '{tech}', 'hot', 'in_discussion', null, null, now() - interval '3 days', null),
  ('Priya', 'Nair', '{priya.nair@lumen.co}', null, 'Lumen', 'Founder', '{}', 'warm', 'lead', current_date + 3, 'Intro call follow-up', now() - interval '20 days', null),
  ('Tom', 'Waldron', '{tom.waldron@harborst.com}', '+61 411 555 666', 'Harbor St', 'GM', '{}', 'warm', 'in_discussion', null, null, now() - interval '35 days', 'Quiet lately — nudge.'),
  ('Aisha', 'Rahman', '{aisha@delta-collective.com}', null, 'Delta Collective', 'Director', '{design}', 'cold', 'dormant', null, null, now() - interval '120 days', null),
  ('Marcus', 'Feld', '{marcus.feld@axongroup.com}', '+61 422 777 888', 'Axon Group', 'Partner', '{priority,legal}', 'hot', 'won', null, null, now() - interval '5 days', 'Signed. Look for referrals.'),
  ('Elena', 'Sorokin', '{elena@voltaworks.com}', null, 'Volta Works', 'Ops Lead', '{}', 'warm', 'lead', null, null, now() - interval '45 days', null),
  ('David', 'Ng', '{david.ng@keystone.com.au}', '+61 433 999 000', 'Keystone', 'CEO', '{priority}', 'hot', 'proposal', current_date - 1, 'Promised deck', now() - interval '8 days', null),
  ('Hannah', 'Lowe', '{hannah.lowe@fernbank.co}', null, 'Fernbank', 'Marketing', '{}', 'cold', 'none', null, null, now() - interval '200 days', null),
  ('Raj', 'Patel', '{raj.patel@meridianlabs.com}', '+61 444 121 212', 'Meridian Labs', 'Head of Product', '{tech}', 'warm', 'in_discussion', current_date + 7, 'Scope workshop', now() - interval '15 days', null);

-- A few interactions on the most active contacts
insert into interactions (contact_id, type, occurred_at, subject, summary)
select id, 'email_in', now() - interval '10 days', 'Re: Proposal', 'Asked for pricing tiers.'
from contacts where emails @> '{sarah.chen@brightpath.com.au}';

insert into interactions (contact_id, type, occurred_at, subject, summary)
select id, 'meeting', now() - interval '12 days', 'Discovery call', 'Walked through requirements.'
from contacts where emails @> '{sarah.chen@brightpath.com.au}';

insert into interactions (contact_id, type, occurred_at, subject, summary)
select id, 'call', now() - interval '3 days', null, 'Quick check-in, keen to move fast.'
from contacts where emails @> '{james@nimbus.io}';

insert into interactions (contact_id, type, occurred_at, subject, summary)
select id, 'note', now() - interval '5 days', null, 'Contract signed. Happy client.'
from contacts where emails @> '{marcus.feld@axongroup.com}';

-- A couple of pending suggestions (as ongoing sync would create)
insert into suggestions (payload, source) values
  ('{"name":"Grace Miller","email":"grace.miller@northwind.com","domain":"northwind.com","thread_count":4,"last_seen":"2026-06-28","sample_subjects":["Intro","Re: Intro","Availability?"]}', 'sync'),
  ('{"name":"Leo Bianchi","email":"leo@stratacon.com","domain":"stratacon.com","thread_count":3,"last_seen":"2026-06-30","sample_subjects":["Partnership idea"]}', 'sync');
