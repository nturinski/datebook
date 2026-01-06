-- Safety migration: ensure MVP Step 6 details columns exist on public.scrapbook_pages.
--
-- We've seen environments where a migration may be recorded as applied but the schema
-- doesn't match reality (or a different schema was queried due to search_path).
-- This migration is idempotent and safe to run multiple times.

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_date" date;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_place" text;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_place_id" text;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_mood_tags" jsonb;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_review" text;
