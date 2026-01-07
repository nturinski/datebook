import { doublePrecision, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { scrapbookPages } from "./scrapbookPages";
import { scrapbooks } from "./scrapbooks";
import { users } from "./users";

export const scrapbookPageMedia = pgTable(
  "scrapbook_page_media",
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

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Path/key of the blob in object storage.
    blobKey: text("blob_key").notNull(),

    // For now, we only need to support "photo".
    kind: text("kind").notNull(),

    width: integer("width").notNull(),
    height: integer("height").notNull(),

    // Normalized (0..1) position within the page's photo canvas.
    x: doublePrecision("x").notNull().default(0),
    y: doublePrecision("y").notNull().default(0),

    // Visual scale multiplier (1 = default size).
    scale: doublePrecision("scale").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    pageIdCreatedAtIdx: index("scrapbook_page_media_page_id_created_at_idx").on(t.pageId, t.createdAt),
    scrapbookIdCreatedAtIdx: index("scrapbook_page_media_scrapbook_id_created_at_idx").on(t.scrapbookId, t.createdAt),
    relationshipIdCreatedAtIdx: index("scrapbook_page_media_relationship_id_created_at_idx").on(t.relationshipId, t.createdAt),
  })
);
