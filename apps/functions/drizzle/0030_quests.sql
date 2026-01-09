CREATE TABLE IF NOT EXISTS "quest_templates" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "type" text NOT NULL,
  "target_count" integer NOT NULL,
  "event_type" text NOT NULL,
  CONSTRAINT "quest_templates_type_check" CHECK ("type" IN ('MONTHLY', 'WEEKLY')),
  CONSTRAINT "quest_templates_event_type_check" CHECK ("event_type" IN ('SCRAPBOOK_ENTRY_CREATED', 'COUPON_CREATED')),
  CONSTRAINT "quest_templates_target_count_check" CHECK ("target_count" > 0)
);

CREATE TABLE IF NOT EXISTS "quest_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE CASCADE,
  "quest_template_id" text NOT NULL REFERENCES "quest_templates"("id") ON DELETE CASCADE,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "progress_count" integer NOT NULL DEFAULT 0,
  "completed_at" timestamptz NULL,
  CONSTRAINT "quest_progress_period_check" CHECK ("period_start" < "period_end"),
  CONSTRAINT "quest_progress_progress_count_check" CHECK ("progress_count" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "quest_progress_relationship_template_period_uq"
  ON "quest_progress" ("relationship_id", "quest_template_id", "period_start", "period_end");

CREATE INDEX IF NOT EXISTS "quest_progress_relationship_id_period_start_idx"
  ON "quest_progress" ("relationship_id", "period_start");

-- Seed quest templates (static)
INSERT INTO "quest_templates" ("id", "title", "type", "target_count", "event_type")
VALUES
  ('MONTHLY_ENTRIES_2', 'Add 1–2 scrapbook entries this month', 'MONTHLY', 2, 'SCRAPBOOK_ENTRY_CREATED'),
  ('WEEKLY_COUPONS_3', 'Create 3 coupons this week', 'WEEKLY', 3, 'COUPON_CREATED')
ON CONFLICT ("id") DO UPDATE
SET
  "title" = EXCLUDED."title",
  "type" = EXCLUDED."type",
  "target_count" = EXCLUDED."target_count",
  "event_type" = EXCLUDED."event_type";
