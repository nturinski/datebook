-- 0003_relationships.sql
-- MVP relationship model: 1 relationship has up to 2 members, invites are single-use.

CREATE TABLE IF NOT EXISTS "relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "relationship_members" (
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "relationship_members_pk" PRIMARY KEY ("relationship_id", "user_id")
);

-- MVP rule: one relationship per user.
CREATE UNIQUE INDEX IF NOT EXISTS "relationship_members_user_uq" ON "relationship_members" ("user_id");

CREATE TABLE IF NOT EXISTS "relationship_invites" (
  "code" text PRIMARY KEY,
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "redeemed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "redeemed_at" timestamptz
);
