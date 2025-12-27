// packages/shared/src/db/schema/users.ts (example)
import { pgTable, text, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    provider: text("provider"),       // "google" | "apple" (nullable for legacy rows)
    providerSub: text("provider_sub"),// OAuth subject
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // Optional but strongly recommended:
    providerIdentityIdx: uniqueIndex("users_provider_providerSub_uq").on(t.provider, t.providerSub),
  })
);
