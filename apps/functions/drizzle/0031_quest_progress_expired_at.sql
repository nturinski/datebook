ALTER TABLE "quest_progress"
  ADD COLUMN IF NOT EXISTS "expired_at" timestamptz NULL;

CREATE INDEX IF NOT EXISTS "quest_progress_relationship_id_expired_at_idx"
  ON "quest_progress" ("relationship_id", "expired_at");
