-- 0004_entries.sql

CREATE TABLE IF NOT EXISTS "entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "entry_date" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "entries_relationship_timeline_idx" ON "entries" ("relationship_id", "entry_date");
