-- moderation-realtime — standalone fix (production feedback on
-- moderation-kill-switch): the console's moderation roster only refetched
-- after the admin's own hide/rename actions, never when a new participant
-- joined from elsewhere. Adds `participant`/`team` to the realtime
-- publication so the console can subscribe to Postgres changes directly,
-- instead of the admin needing to reload the page.

alter publication supabase_realtime add table public.participant, public.team;
