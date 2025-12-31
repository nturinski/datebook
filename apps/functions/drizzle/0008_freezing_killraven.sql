CREATE TABLE "entry_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"blob_key" text NOT NULL,
	"kind" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_media" ADD CONSTRAINT "entry_media_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_media" ADD CONSTRAINT "entry_media_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_media_entry_id_created_at_idx" ON "entry_media" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "entry_media_relationship_id_created_at_idx" ON "entry_media" USING btree ("relationship_id","created_at");