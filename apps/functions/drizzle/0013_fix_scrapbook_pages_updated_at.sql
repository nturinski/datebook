-- Fix for environments where 0012 was applied before scrapbook_pages.updated_at existed.
-- Safe to run multiple times.

ALTER TABLE "scrapbook_pages"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

-- Ensure defaults + not-null.
ALTER TABLE "scrapbook_pages"
  ALTER COLUMN "updated_at" SET DEFAULT now();

UPDATE "scrapbook_pages"
SET "updated_at" = COALESCE("updated_at", "created_at", now())
WHERE "updated_at" IS NULL;

ALTER TABLE "scrapbook_pages"
  ALTER COLUMN "updated_at" SET NOT NULL;
