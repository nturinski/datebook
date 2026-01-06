import { doublePrecision, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { scrapbookPages } from "./scrapbookPages";
import { scrapbooks } from "./scrapbooks";

export const scrapbookPageStickers = pgTable(
  "scrapbook_page_stickers",
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

    // One of a small set of sticker IDs (e.g. "heart", "star", "tape").
    kind: text("kind").notNull(),

    // Normalized (0..1) position within the page canvas.
    x: doublePrecision("x").notNull().default(0),
    y: doublePrecision("y").notNull().default(0),

    // Visual scale multiplier (1 = default size).
    scale: doublePrecision("scale").notNull().default(1),

    // Rotation in degrees.
    rotation: doublePrecision("rotation").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    pageIdCreatedAtIdx: index("scrapbook_page_stickers_page_id_created_at_idx").on(t.pageId, t.createdAt),
    scrapbookIdCreatedAtIdx: index("scrapbook_page_stickers_scrapbook_id_created_at_idx").on(t.scrapbookId, t.createdAt),
    relationshipIdCreatedAtIdx: index("scrapbook_page_stickers_relationship_id_created_at_idx").on(
      t.relationshipId,
      t.createdAt
    ),
  })
);
