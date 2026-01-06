-- MVP Step 6: structured metadata on scrapbook pages
--
-- These fields are optional and allow the scrapbook to hold context beyond media layout.

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_date" date;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_place" text;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_mood_tags" jsonb;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_review" text;
