import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { entries } from "./entries";
import { relationships } from "./relationships";

export const entryMedia = pgTable(
  "entry_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),

    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),

    // Path/key of the blob in object storage.
    blobKey: text("blob_key").notNull(),

    // For now, we only need to support "photo".
    kind: text("kind").notNull(),

    width: integer("width").notNull(),
    height: integer("height").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    entryIdCreatedAtIdx: index("entry_media_entry_id_created_at_idx").on(t.entryId, t.createdAt),
    relationshipIdCreatedAtIdx: index("entry_media_relationship_id_created_at_idx").on(t.relationshipId, t.createdAt),
  })
);
