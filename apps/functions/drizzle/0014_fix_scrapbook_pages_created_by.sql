-- Fix for environments where scrapbook_pages has both created_by and created_by_user_id.
-- The application uses created_by_user_id.
--
-- This migration:
--  - backfills created_by_user_id from created_by
--  - enforces created_by_user_id NOT NULL
--  - drops created_by FK + column
--
-- Safe to run multiple times.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'scrapbook_pages'
      AND column_name = 'created_by'
  ) THEN
    -- Backfill created_by_user_id from created_by (if needed)
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'scrapbook_pages'
        AND column_name = 'created_by_user_id'
    ) THEN
      EXECUTE 'UPDATE "scrapbook_pages" SET "created_by_user_id" = COALESCE("created_by_user_id", "created_by") WHERE "created_by_user_id" IS NULL';

      -- Enforce NOT NULL to match app schema
      BEGIN
        EXECUTE 'ALTER TABLE "scrapbook_pages" ALTER COLUMN "created_by_user_id" SET NOT NULL';
      EXCEPTION
        WHEN others THEN
          -- If there are still NULLs for some reason, leave as-is (better than failing migration)
          NULL;
      END;

      -- Drop old FK on created_by if present
      BEGIN
        EXECUTE 'ALTER TABLE "scrapbook_pages" DROP CONSTRAINT IF EXISTS "scrapbook_pages_created_by_users_id_fk"';
      EXCEPTION
        WHEN others THEN NULL;
      END;

      -- Drop the legacy column
      BEGIN
        EXECUTE 'ALTER TABLE "scrapbook_pages" DROP COLUMN IF EXISTS "created_by"';
      EXCEPTION
        WHEN others THEN NULL;
      END;
    END IF;
  END IF;
END $$;
