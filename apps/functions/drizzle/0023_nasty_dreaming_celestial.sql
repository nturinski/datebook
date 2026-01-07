ALTER TABLE "scrapbooks" ADD COLUMN "details_date" date;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN "details_place" text;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN "details_place_id" text;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN "details_mood_tags" jsonb;--> statement-breakpoint
ALTER TABLE "scrapbooks" ADD COLUMN "details_review" text;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN "details_date" date;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN "details_place" text;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN "details_place_id" text;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN "details_mood_tags" jsonb;--> statement-breakpoint
ALTER TABLE "scrapbook_pages" ADD COLUMN "details_review" text;--> statement-breakpoint
ALTER TABLE "scrapbook_page_notes" ADD COLUMN "font" text DEFAULT 'hand' NOT NULL;