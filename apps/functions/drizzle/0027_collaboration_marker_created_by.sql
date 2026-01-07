-- Collaboration marker: attribute placed objects to a user.
--
-- Each placed object (photo, note/text, sticker) stores created_by_user_id so we can
-- render attribution in the UI.
--
-- Backfill strategy:
-- - If existing rows do not have an author, attribute them to the page creator.

-- scrapbook_page_media
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
UPDATE "scrapbook_page_media" m
SET "created_by_user_id" = p."created_by_user_id"
FROM "scrapbook_pages" p
WHERE m."created_by_user_id" IS NULL
  AND m."page_id" = p."id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'created_by_user_id'
	) THEN
		EXECUTE 'ALTER TABLE "scrapbook_page_media" ALTER COLUMN "created_by_user_id" SET NOT NULL';
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'created_by_user_id'
	) THEN
		ALTER TABLE "scrapbook_page_media" ADD CONSTRAINT "scrapbook_page_media_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
-- scrapbook_page_stickers
ALTER TABLE "scrapbook_page_stickers" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
UPDATE "scrapbook_page_stickers" s
SET "created_by_user_id" = p."created_by_user_id"
FROM "scrapbook_pages" p
WHERE s."created_by_user_id" IS NULL
  AND s."page_id" = p."id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_stickers'
			AND column_name = 'created_by_user_id'
	) THEN
		EXECUTE 'ALTER TABLE "scrapbook_page_stickers" ALTER COLUMN "created_by_user_id" SET NOT NULL';
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_stickers'
			AND column_name = 'created_by_user_id'
	) THEN
		ALTER TABLE "scrapbook_page_stickers" ADD CONSTRAINT "scrapbook_page_stickers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
-- scrapbook_page_texts (notes)
ALTER TABLE "scrapbook_page_texts" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
UPDATE "scrapbook_page_texts" t
SET "created_by_user_id" = p."created_by_user_id"
FROM "scrapbook_pages" p
WHERE t."created_by_user_id" IS NULL
  AND t."page_id" = p."id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_texts'
			AND column_name = 'created_by_user_id'
	) THEN
		EXECUTE 'ALTER TABLE "scrapbook_page_texts" ALTER COLUMN "created_by_user_id" SET NOT NULL';
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_texts'
			AND column_name = 'created_by_user_id'
	) THEN
		ALTER TABLE "scrapbook_page_texts" ADD CONSTRAINT "scrapbook_page_texts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
-- scrapbook_page_notes (legacy)
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
UPDATE "scrapbook_page_notes" n
SET "created_by_user_id" = p."created_by_user_id"
FROM "scrapbook_pages" p
WHERE n."created_by_user_id" IS NULL
  AND n."page_id" = p."id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'created_by_user_id'
	) THEN
		EXECUTE 'ALTER TABLE "scrapbook_page_notes" ALTER COLUMN "created_by_user_id" SET NOT NULL';
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'created_by_user_id'
	) THEN
		ALTER TABLE "scrapbook_page_notes" ADD CONSTRAINT "scrapbook_page_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
