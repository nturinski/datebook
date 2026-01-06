CREATE TABLE IF NOT EXISTS "scrapbook_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"scrapbook_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"page_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrapbook_page_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"scrapbook_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"blob_key" text NOT NULL,
	"kind" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"scale" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN IF NOT EXISTS "relationship_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN IF NOT EXISTS "scrapbook_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN IF NOT EXISTS "page_index" integer;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "relationship_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "scrapbook_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "page_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "blob_key" text;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "width" integer;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "height" integer;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "x" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "y" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "scale" double precision DEFAULT 1;--> statement-breakpoint
ALTER TABLE "scrapbook_page_media" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_pages'
			AND column_name = 'relationship_id'
	) THEN
		ALTER TABLE "scrapbook_pages" ADD CONSTRAINT "scrapbook_pages_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
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
			AND table_name = 'scrapbook_pages'
			AND column_name = 'scrapbook_id'
	) THEN
		ALTER TABLE "scrapbook_pages" ADD CONSTRAINT "scrapbook_pages_scrapbook_id_scrapbooks_id_fk" FOREIGN KEY ("scrapbook_id") REFERENCES "public"."scrapbooks"("id") ON DELETE cascade ON UPDATE no action;
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
			AND table_name = 'scrapbook_pages'
			AND column_name = 'created_by_user_id'
	) THEN
		ALTER TABLE "scrapbook_pages" ADD CONSTRAINT "scrapbook_pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
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
			AND column_name = 'relationship_id'
	) THEN
		ALTER TABLE "scrapbook_page_media" ADD CONSTRAINT "scrapbook_page_media_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
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
			AND column_name = 'scrapbook_id'
	) THEN
		ALTER TABLE "scrapbook_page_media" ADD CONSTRAINT "scrapbook_page_media_scrapbook_id_scrapbooks_id_fk" FOREIGN KEY ("scrapbook_id") REFERENCES "public"."scrapbooks"("id") ON DELETE cascade ON UPDATE no action;
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
			AND column_name = 'page_id'
	) THEN
		ALTER TABLE "scrapbook_page_media" ADD CONSTRAINT "scrapbook_page_media_page_id_scrapbook_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."scrapbook_pages"("id") ON DELETE cascade ON UPDATE no action;
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
			AND table_name = 'scrapbook_pages'
			AND column_name = 'scrapbook_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_pages'
			AND column_name = 'page_index'
	) THEN
		EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "scrapbook_pages_scrapbook_id_page_index_uq" ON "scrapbook_pages" USING btree ("scrapbook_id","page_index")';
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_pages_scrapbook_id_page_index_idx" ON "scrapbook_pages" USING btree ("scrapbook_id","page_index")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_pages'
			AND column_name = 'relationship_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_pages'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_pages_relationship_id_created_at_idx" ON "scrapbook_pages" USING btree ("relationship_id","created_at")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'page_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_page_media_page_id_created_at_idx" ON "scrapbook_page_media" USING btree ("page_id","created_at")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'scrapbook_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_page_media_scrapbook_id_created_at_idx" ON "scrapbook_page_media" USING btree ("scrapbook_id","created_at")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'relationship_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbook_page_media'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbook_page_media_relationship_id_created_at_idx" ON "scrapbook_page_media" USING btree ("relationship_id","created_at")';
	END IF;
END $$;
