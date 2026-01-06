import { date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { users } from "./users";

export const scrapbooks = pgTable(
  "scrapbooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),

    // Optional cover image in object storage.
    coverBlobKey: text("cover_blob_key"),
    coverWidth: integer("cover_width"),
    coverHeight: integer("cover_height"),

    // Optional “details” metadata.
    // Stored on the scrapbook so it applies to the scrapbook entry as a whole (not per page).
    detailsDate: date("details_date", { mode: "date" }),
    detailsPlace: text("details_place"),
    detailsPlaceId: text("details_place_id"),
    detailsMoodTags: jsonb("details_mood_tags").$type<string[]>(),
    detailsReview: text("details_review"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    relationshipIdCreatedAtIdx: index("scrapbooks_relationship_id_created_at_idx").on(t.relationshipId, t.createdAt),
    relationshipIdTitleIdx: index("scrapbooks_relationship_id_title_idx").on(t.relationshipId, t.title),
  })
);
