-- Quest analytics support: time-to-completion + actor attribution
--
-- We intentionally keep analytics internal-only (no API surface changes).
--
-- started_at: when a quest was first progressed (i.e., first qualifying event in that period)
-- completed_by_user_id: who performed the action that completed the quest (best-effort)

ALTER TABLE quest_progress
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS completed_by_user_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quest_progress_completed_by_user_id_fkey'
  ) THEN
    ALTER TABLE quest_progress
      ADD CONSTRAINT quest_progress_completed_by_user_id_fkey
      FOREIGN KEY (completed_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quest_progress_started_at_idx ON quest_progress(started_at);
CREATE INDEX IF NOT EXISTS quest_progress_completed_at_idx ON quest_progress(completed_at);
CREATE INDEX IF NOT EXISTS quest_progress_completed_by_user_id_idx ON quest_progress(completed_by_user_id);
