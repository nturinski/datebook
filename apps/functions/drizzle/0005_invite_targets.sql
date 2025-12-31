ALTER TABLE "relationship_invites"
  ADD COLUMN IF NOT EXISTS "target_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "target_email" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'relationship_invites_target_user_id_users_fk'
  ) THEN
    ALTER TABLE "relationship_invites"
      ADD CONSTRAINT "relationship_invites_target_user_id_users_fk"
      FOREIGN KEY ("target_user_id")
      REFERENCES "public"."users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "relationship_invites_target_user_id_idx"
  ON "relationship_invites" ("target_user_id");

CREATE INDEX IF NOT EXISTS "relationship_invites_redeemed_at_idx"
  ON "relationship_invites" ("redeemed_at");
