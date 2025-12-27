ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider_sub" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_providerSub_uq" ON "users" USING btree ("provider","provider_sub");