-- MVP Step 6+: Connect Place to Google Places.
--
-- Store a stable Google Place ID alongside the free-form display string.

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_place_id" text;
