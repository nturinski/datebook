-- Cleanup for dev DBs where scrapbook_pages rows were created without relationship_id.
-- Those rows are effectively inaccessible (API filters by relationship_id) and cause page_index/page counts to look wrong.
--
-- This migration:
--  - deletes scrapbook_page_media for orphan/invalid pages
--  - deletes scrapbook_pages with NULL relationship_id
--  - enforces scrapbook_pages.relationship_id NOT NULL
--  - renumbers remaining pages to 1..n per scrapbook (safe for unique constraints)
--
-- Safe to run multiple times.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'scrapbook_pages'
  ) THEN
    -- Remove media for invalid pages first (if media table exists).
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'scrapbook_page_media'
    ) THEN
      -- Media attached to pages that have NULL relationship_id
      DELETE FROM scrapbook_page_media m
      USING scrapbook_pages p
      WHERE m.page_id = p.id
        AND p.relationship_id IS NULL;

      -- Any remaining obviously-invalid media rows
      DELETE FROM scrapbook_page_media
      WHERE relationship_id IS NULL
         OR scrapbook_id IS NULL
         OR page_id IS NULL;
    END IF;

    -- Delete invalid pages
    DELETE FROM scrapbook_pages
    WHERE relationship_id IS NULL;

    -- Enforce NOT NULL going forward.
    BEGIN
      ALTER TABLE scrapbook_pages
        ALTER COLUMN relationship_id SET NOT NULL;
    EXCEPTION
      WHEN others THEN NULL;
    END;

    -- Renumber pages to be dense and 1-based per scrapbook.
    -- (Two-phase update avoids transient unique violations.)
    WITH ranked AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY scrapbook_id
          ORDER BY page_index ASC, created_at ASC
        ) AS rn
      FROM scrapbook_pages
    )
    UPDATE scrapbook_pages sp
    SET page_index = -(1000000 + ranked.rn)
    FROM ranked
    WHERE sp.id = ranked.id;

    UPDATE scrapbook_pages
    SET page_index = -(page_index + 1000000)
    WHERE page_index <= -1000000;
  END IF;
END $$;
