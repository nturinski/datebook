-- Add scrapbook page Post-it notes.
--
-- Notes are lightweight text reflections that can be dragged around a page.

CREATE TABLE IF NOT EXISTS "scrapbook_page_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"scrapbook_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"text" text NOT NULL,
	"color" text NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "relationship_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "scrapbook_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "page_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "text" text;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "color" text;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "x" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "y" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'relationship_id'
	) THEN
		ALTER TABLE "scrapbook_page_notes" ADD CONSTRAINT "scrapbook_page_notes_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
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
			AND column_name = 'scrapbook_id'
	) THEN
		ALTER TABLE "scrapbook_page_notes" ADD CONSTRAINT "scrapbook_page_notes_scrapbook_id_scrapbooks_id_fk" FOREIGN KEY ("scrapbook_id") REFERENCES "public"."scrapbooks"("id") ON DELETE cascade ON UPDATE no action;
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
			AND column_name = 'page_id'
	) THEN
		ALTER TABLE "scrapbook_page_notes" ADD CONSTRAINT "scrapbook_page_notes_page_id_scrapbook_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."scrapbook_pages"("id") ON DELETE cascade ON UPDATE no action;
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
			AND column_name = 'page_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_page_notes_page_id_created_at_idx" ON "scrapbook_page_notes" USING btree ("page_id","created_at")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'scrapbook_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_page_notes_scrapbook_id_created_at_idx" ON "scrapbook_page_notes" USING btree ("scrapbook_id","created_at")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'relationship_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_notes'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_page_notes_relationship_id_created_at_idx" ON "scrapbook_page_notes" USING btree ("relationship_id","created_at")';
	END IF;
END $$;
