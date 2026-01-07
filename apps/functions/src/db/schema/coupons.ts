import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { users } from "./users";

export const couponStatusEnum = ["ACTIVE", "REDEEMED", "EXPIRED"] as const;
export type CouponStatus = (typeof couponStatusEnum)[number];

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),

    issuerUserId: uuid("issuer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),

    templateId: text("template_id").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

    // Stored as TEXT for MVP flexibility; enforced in SQL via a CHECK constraint.
    status: text("status").$type<CouponStatus>().notNull().default("ACTIVE"),

    redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" }),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    relationshipStatusIdx: index("coupons_relationship_id_status_idx").on(t.relationshipId, t.status),
    recipientStatusIdx: index("coupons_recipient_user_id_status_idx").on(t.recipientUserId, t.status),
  })
);
