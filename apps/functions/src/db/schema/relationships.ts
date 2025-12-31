import {
  pgTable,
  text,
  timestamp,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const relationships = pgTable("relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const relationshipMembers = pgTable(
  "relationship_members",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.relationshipId, t.userId] }),
  })
);

export const relationshipInvites = pgTable("relationship_invites", {
  code: text("code").primaryKey(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Optional: who this invite is intended for. This allows us to show "pending invites"
  // in the UI without exposing a global user list.
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
  targetEmail: text("target_email"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  redeemedBy: uuid("redeemed_by").references(() => users.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" }),
});

// NOTE: Keeping role/status as TEXT makes it easy to evolve without a DB migration for enum changes.
