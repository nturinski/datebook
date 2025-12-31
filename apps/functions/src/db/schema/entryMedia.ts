import { doublePrecision, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

    // Normalized (0..1) position within the entry's photo canvas.
    // This makes layouts resilient across devices/screen sizes.
    x: doublePrecision("x").notNull().default(0),
    y: doublePrecision("y").notNull().default(0),

    // Visual scale of the media item on the canvas.
    // This is not normalized; it's a simple multiplier (1 = default size).
    scale: doublePrecision("scale").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    entryIdCreatedAtIdx: index("entry_media_entry_id_created_at_idx").on(t.entryId, t.createdAt),
    relationshipIdCreatedAtIdx: index("entry_media_relationship_id_created_at_idx").on(t.relationshipId, t.createdAt),
  })
);
