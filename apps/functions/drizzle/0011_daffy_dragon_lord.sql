CREATE TABLE IF NOT EXISTS "scrapbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"cover_blob_key" text,
	"cover_width" integer,
	"cover_height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "relationship_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "cover_blob_key" text;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "cover_width" integer;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "cover_height" integer;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbooks'
			AND column_name = 'relationship_id'
	) THEN
		ALTER TABLE "scrapbooks" ADD CONSTRAINT "scrapbooks_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
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
			AND table_name = 'scrapbooks'
			AND column_name = 'created_by_user_id'
	) THEN
		ALTER TABLE "scrapbooks" ADD CONSTRAINT "scrapbooks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
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
			AND table_name = 'scrapbooks'
			AND column_name = 'relationship_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbooks'
			AND column_name = 'created_at'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbooks_relationship_id_created_at_idx" ON "scrapbooks" USING btree ("relationship_id","created_at")';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbooks'
			AND column_name = 'relationship_id'
	) AND EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'scrapbooks'
			AND column_name = 'title'
	) THEN
		EXECUTE 'CREATE INDEX IF NOT EXISTS "scrapbooks_relationship_id_title_idx" ON "scrapbooks" USING btree ("relationship_id","title")';
	END IF;
END $$;