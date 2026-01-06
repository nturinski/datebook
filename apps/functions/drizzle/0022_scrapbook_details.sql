-- Add structured details metadata at the scrapbook level (not per page).
-- Idempotent to protect local/dev environments that may have drifted.

alter table if exists "public"."scrapbooks"
  add column if not exists "details_date" date;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_place" text;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_place_id" text;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_mood_tags" jsonb;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_review" text;
