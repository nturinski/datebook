-- Renumber scrapbook_pages.page_index to be dense and 1-based per scrapbook.
--
-- Some dev DBs ended up with gapped page_index values due to earlier schema iterations.
-- This migration normalizes existing data so the UI and ordering behave as expected.
--
-- Safe to run multiple times (it deterministically recomputes page_index).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'scrapbook_pages'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'scrapbook_pages'
      AND column_name = 'page_index'
  ) THEN
    -- Two-phase update to avoid transient unique violations on (scrapbook_id, page_index)
    -- when a unique index/constraint exists.
    -- Phase 1: set to a large negative, unique per scrapbook.
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

    -- Phase 2: flip back to 1..n.
    UPDATE scrapbook_pages
    SET page_index = -(page_index + 1000000)
    WHERE page_index <= -1000000;
  END IF;
END $$;
