-- MyCRM — LinkedIn message interaction types. Imported from the LinkedIn
-- data export (messages.csv), matched to contacts by profile URL. Additive +
-- idempotent; dedup reuses interactions.graph_message_id ("li:<hash>").

alter type interaction_type add value if not exists 'linkedin_in';
alter type interaction_type add value if not exists 'linkedin_out';
