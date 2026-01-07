CREATE TABLE IF NOT EXISTS "scrapbook_page_texts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE cascade,
  "scrapbook_id" uuid NOT NULL REFERENCES "scrapbooks"("id") ON DELETE cascade,
  "page_id" uuid NOT NULL REFERENCES "scrapbook_pages"("id") ON DELETE cascade,
  "text" text NOT NULL,
  "font" text NOT NULL DEFAULT 'hand',
  "color" text NOT NULL DEFAULT '#2E2A27',
  "x" double precision NOT NULL DEFAULT 0,
  "y" double precision NOT NULL DEFAULT 0,
  "scale" double precision NOT NULL DEFAULT 1,
  "rotation" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "scrapbook_page_texts_page_id_created_at_idx" ON "scrapbook_page_texts" ("page_id", "created_at");
CREATE INDEX IF NOT EXISTS "scrapbook_page_texts_scrapbook_id_created_at_idx" ON "scrapbook_page_texts" ("scrapbook_id", "created_at");
CREATE INDEX IF NOT EXISTS "scrapbook_page_texts_relationship_id_created_at_idx" ON "scrapbook_page_texts" ("relationship_id", "created_at");
