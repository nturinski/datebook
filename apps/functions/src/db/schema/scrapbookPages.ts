import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { scrapbooks } from "./scrapbooks";
import { users } from "./users";

export const scrapbookPages = pgTable(
  "scrapbook_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),

    scrapbookId: uuid("scrapbook_id")
      .notNull()
      .references(() => scrapbooks.id, { onDelete: "cascade" }),

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // 1-based page index within the scrapbook.
    pageIndex: integer("page_index").notNull(),

    // Optional “details” metadata (MVP step 6).
    // Stored on the page so the scrapbook becomes more than a photo folder.
    detailsDate: date("details_date", { mode: "date" }),
    detailsPlace: text("details_place"),
    detailsPlaceId: text("details_place_id"),
    detailsMoodTags: jsonb("details_mood_tags").$type<string[]>(),
    detailsReview: text("details_review"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    scrapbookIdPageIndexUq: uniqueIndex("scrapbook_pages_scrapbook_id_page_index_uq").on(t.scrapbookId, t.pageIndex),
    scrapbookIdPageIndexIdx: index("scrapbook_pages_scrapbook_id_page_index_idx").on(t.scrapbookId, t.pageIndex),
    relationshipIdCreatedAtIdx: index("scrapbook_pages_relationship_id_created_at_idx").on(t.relationshipId, t.createdAt),
  })
);
