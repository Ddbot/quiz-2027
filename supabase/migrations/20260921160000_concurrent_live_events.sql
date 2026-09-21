-- Relax FR-027: multiple events may now be live concurrently (concurrent-live-
-- events design.md D1). This was a deliberate v1 simplification (REQUIREMENTS.md
-- §16, SPEC.md FR-028) — every event-bound table already carries its own event
-- ID, so no data migration is needed; dropping the index is the whole change.
drop index if exists public.event_one_live_idx;
