import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { users } from "./users";

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),

    // MVP-required
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),

    // Optional notes/body
    body: text("body"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    relationshipTimelineIdx: index("entries_relationship_timeline_idx").on(t.relationshipId, t.occurredAt),
  })
);
