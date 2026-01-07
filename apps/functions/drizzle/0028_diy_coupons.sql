-- DIY Coupon System: base data model (Create → Send → Redeem)
--
-- We store status as TEXT (like relationship role/status) but enforce allowed values
-- via a CHECK constraint so it behaves like an enum.

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "relationship_id" uuid NOT NULL,
  "issuer_user_id" uuid NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "template_id" text NOT NULL,
  "expires_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "redeemed_at" timestamp with time zone
);

--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_relationship_id_relationships_id_fk"
    FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_issuer_user_id_users_id_fk"
    FOREIGN KEY ("issuer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_recipient_user_id_users_id_fk"
    FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_status_check"
    CHECK ("status" IN ('ACTIVE', 'REDEEMED', 'EXPIRED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupons_relationship_id_status_idx" ON "coupons" USING btree ("relationship_id", "status");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupons_recipient_user_id_status_idx" ON "coupons" USING btree ("recipient_user_id", "status");
