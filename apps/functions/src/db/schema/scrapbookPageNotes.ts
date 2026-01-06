import { doublePrecision, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { scrapbookPages } from "./scrapbookPages";
import { scrapbooks } from "./scrapbooks";

export const scrapbookPageNotes = pgTable(
  "scrapbook_page_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),

    scrapbookId: uuid("scrapbook_id")
      .notNull()
      .references(() => scrapbooks.id, { onDelete: "cascade" }),

    pageId: uuid("page_id")
      .notNull()
      .references(() => scrapbookPages.id, { onDelete: "cascade" }),

    text: text("text").notNull(),

    // One of 3 preset styles (pastel options). We store it as a string so we can evolve later.
    color: text("color").notNull(),

    // Normalized (0..1) position within the page canvas.
    x: doublePrecision("x").notNull().default(0),
    y: doublePrecision("y").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    pageIdCreatedAtIdx: index("scrapbook_page_notes_page_id_created_at_idx").on(t.pageId, t.createdAt),
    scrapbookIdCreatedAtIdx: index("scrapbook_page_notes_scrapbook_id_created_at_idx").on(t.scrapbookId, t.createdAt),
    relationshipIdCreatedAtIdx: index("scrapbook_page_notes_relationship_id_created_at_idx").on(t.relationshipId, t.createdAt),
  })
);
