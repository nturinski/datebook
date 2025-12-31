-- 0007_parched_bromley
--
-- Align `entries` table with MVP requirements:
-- - occurred_at (datetime, required)
-- - body (optional)
-- - created_by_user_id naming
-- And add optional `entry_edits` audit trail table.

-- 1) Rename created_by -> created_by_user_id
ALTER TABLE "entries" RENAME COLUMN "created_by" TO "created_by_user_id";
--> statement-breakpoint

-- 2) Add occurred_at and backfill from legacy entry_date (date-only)
ALTER TABLE "entries" ADD COLUMN "occurred_at" timestamptz;
--> statement-breakpoint

UPDATE "entries"
SET "occurred_at" = ("entry_date"::timestamptz)
WHERE "occurred_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "entries" ALTER COLUMN "occurred_at" SET NOT NULL;
--> statement-breakpoint

-- 3) Add body/notes
ALTER TABLE "entries" ADD COLUMN "body" text;
--> statement-breakpoint

-- 4) Drop legacy date-only column
ALTER TABLE "entries" DROP COLUMN "entry_date";
--> statement-breakpoint

-- 5) Update timeline index to use occurred_at
DROP INDEX IF EXISTS "entries_relationship_timeline_idx";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entries_relationship_timeline_idx" ON "entries" ("relationship_id", "occurred_at");
--> statement-breakpoint

-- 6) Optional audit trail: entry_edits
CREATE TABLE IF NOT EXISTS "entry_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"entry_id" uuid NOT NULL REFERENCES "entries"("id") ON DELETE CASCADE,
	"edited_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"edited_at" timestamptz NOT NULL DEFAULT now(),
	"previous_title" text,
	"previous_body" text,
	"previous_occurred_at" timestamptz,
	"new_title" text,
	"new_body" text,
	"new_occurred_at" timestamptz
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entry_edits_entry_id_edited_at_idx" ON "entry_edits" ("entry_id", "edited_at");