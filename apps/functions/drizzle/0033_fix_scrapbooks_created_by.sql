-- Fix for environments where scrapbooks has both created_by and created_by_user_id.
--
-- The application uses created_by_user_id.
-- Some older environments may still have created_by (NOT NULL) and the newer column
-- may be NULL, causing inserts (that only set created_by_user_id) to fail.
--
-- This migration:
--  - ensures created_by_user_id exists
--  - backfills created_by_user_id from created_by
--  - enforces created_by_user_id NOT NULL
--  - adds FK on created_by_user_id -> users(id)
--  - drops created_by column (and its FK) if present

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'scrapbooks'
      AND column_name = 'created_by'
  ) THEN
    -- Ensure new column exists.
    EXECUTE 'ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid';

    -- Backfill from legacy column.
    EXECUTE 'UPDATE "scrapbooks" SET "created_by_user_id" = COALESCE("created_by_user_id", "created_by") WHERE "created_by_user_id" IS NULL';

    -- Enforce NOT NULL on the new column.
    EXECUTE 'ALTER TABLE "scrapbooks" ALTER COLUMN "created_by_user_id" SET NOT NULL';

    -- Ensure FK exists on created_by_user_id.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'scrapbooks_created_by_user_id_users_id_fk'
    ) THEN
      EXECUTE 'ALTER TABLE "scrapbooks" ADD CONSTRAINT "scrapbooks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action';
    END IF;

    -- Drop the legacy column (and any dependent FK) now that data is migrated.
    EXECUTE 'ALTER TABLE "scrapbooks" DROP COLUMN IF EXISTS "created_by" CASCADE';
  END IF;
END $$;
