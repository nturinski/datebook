import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { entries } from "./entries";
import { users } from "./users";

/**
 * Optional audit trail for edits to entries.
 *
 * Design goal: keep it simple for MVP while allowing you to answer
 * “who changed what, and when?” without relying on app logs.
 */
export const entryEdits = pgTable(
  "entry_edits",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),

    editedByUserId: uuid("edited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),

    // Before/after snapshots (nullable so we can store partial changes)
    previousTitle: text("previous_title"),
    previousBody: text("previous_body"),
    previousOccurredAt: timestamp("previous_occurred_at", { withTimezone: true, mode: "date" }),

    newTitle: text("new_title"),
    newBody: text("new_body"),
    newOccurredAt: timestamp("new_occurred_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    entryHistoryIdx: index("entry_edits_entry_id_edited_at_idx").on(t.entryId, t.editedAt),
  })
);
