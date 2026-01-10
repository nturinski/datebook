import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { relationships } from "./relationships";
import { users } from "./users";

export const questCadenceEnum = ["MONTHLY", "WEEKLY"] as const;
export type QuestCadence = (typeof questCadenceEnum)[number];

export const questEventTypeEnum = ["SCRAPBOOK_ENTRY_CREATED", "COUPON_CREATED"] as const;
export type QuestEventType = (typeof questEventTypeEnum)[number];

// Static / seeded
export const questTemplates = pgTable("quest_templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").$type<QuestCadence>().notNull(),
  targetCount: integer("target_count").notNull(),
  eventType: text("event_type").$type<QuestEventType>().notNull(),
});

// Per relationship, per template, per period
export const questProgress = pgTable(
  "quest_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),

    questTemplateId: text("quest_template_id")
      .notNull()
      .references(() => questTemplates.id, { onDelete: "cascade" }),

    // Inclusive start, exclusive end (date-only)
    periodStart: date("period_start", { mode: "date" }).notNull(),
    periodEnd: date("period_end", { mode: "date" }).notNull(),

    progressCount: integer("progress_count").notNull().default(0),

    // When progress was first recorded for this period (best-effort).
    // NOTE: This is intentionally nullable because GET /quests inserts 0-progress rows
    // so clients can render; those should not count as "started" for analytics.
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),

    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),

    // Who performed the action that completed the quest (best-effort; internal analytics only).
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),

    // Set automatically (server-side) when the period ends without completion.
    // Used to keep reads cheap and make progress updates deterministic.
    expiredAt: timestamp("expired_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    relationshipPeriodIdx: index("quest_progress_relationship_id_period_start_idx").on(t.relationshipId, t.periodStart),
    relationshipTemplatePeriodUq: uniqueIndex("quest_progress_relationship_template_period_uq").on(
      t.relationshipId,
      t.questTemplateId,
      t.periodStart,
      t.periodEnd
    ),
  })
);
