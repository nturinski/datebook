import type { InvocationContext } from "@azure/functions";
import { and, eq, sql } from "drizzle-orm";

import { questProgress, questTemplates, type QuestEventType } from "../db/schema/quests";

import type { db as DbClient } from "../db/client";

type DbConn = Pick<typeof DbClient, "select" | "insert">;

export type ApplyQuestEventResult = {
  newlyCompleted: Array<{ questTemplateId: string; title: string }>;
};

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function utcMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * ISO week range in UTC.
 * ISO weeks start on Monday.
 *
 * Returns: [start, end) where end is the next Monday at 00:00:00.000Z.
 */
function utcIsoWeekRange(now: Date): { start: Date; end: Date } {
  const today = startOfUtcDay(now);
  const day = today.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Convert so Monday becomes 0, Tuesday 1, ... Sunday 6.
  const mondayIndex = (day + 6) % 7;

  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - mondayIndex);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return { start, end };
}

function clampProgress(value: number, target: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, target);
}

export async function applyQuestEvent(args: {
  db: DbConn;
  relationshipId: string;
  actorUserId?: string;
  eventType: QuestEventType;
  occurredAt?: Date;
  ctx?: InvocationContext;
}): Promise<ApplyQuestEventResult> {
  const occurredAt = args.occurredAt ?? new Date();
  // Postgres can be picky about typed expressions in COALESCE/CASE when parameters
  // arrive as text. Cast explicitly to keep the common type = timestamptz.
  const occurredAtTz = sql`${occurredAt}::timestamptz`;
  // Same for UUID parameters.
  const actorUserIdUuid = sql`${args.actorUserId ?? null}::uuid`;

  const templates = await args.db
    .select({
      id: questTemplates.id,
      title: questTemplates.title,
      type: questTemplates.type,
      targetCount: questTemplates.targetCount,
      eventType: questTemplates.eventType,
    })
    .from(questTemplates)
    .where(eq(questTemplates.eventType, args.eventType));

  if (templates.length === 0) return { newlyCompleted: [] };

  const newlyCompleted: ApplyQuestEventResult["newlyCompleted"] = [];

  await Promise.all(
    templates.map(async (t) => {
      const period = t.type === "MONTHLY" ? utcMonthRange(occurredAt) : utcIsoWeekRange(occurredAt);

      const existing = await args.db
        .select({ completedAt: questProgress.completedAt, expiredAt: questProgress.expiredAt, startedAt: questProgress.startedAt })
        .from(questProgress)
        .where(
          and(
            eq(questProgress.relationshipId, args.relationshipId),
            eq(questProgress.questTemplateId, t.id),
            eq(questProgress.periodStart, period.start),
            eq(questProgress.periodEnd, period.end)
          )
        )
        .limit(1);

      const alreadyCompleted = Boolean(existing[0]?.completedAt);
      const alreadyExpired = Boolean(existing[0]?.expiredAt);
      const alreadyStarted = Boolean(existing[0]?.startedAt);

      // If the quest is already expired, do not update it (no late carryover).
      if (alreadyExpired) return;

      const inc = 1;
      const inserted = await args.db
        .insert(questProgress)
        .values({
          relationshipId: args.relationshipId,
          questTemplateId: t.id,
          periodStart: period.start,
          periodEnd: period.end,
          progressCount: clampProgress(inc, t.targetCount),
          startedAt: occurredAt,
          completedAt: inc >= t.targetCount ? occurredAt : null,
          completedByUserId: inc >= t.targetCount ? (args.actorUserId ?? null) : null,
        })
        .onConflictDoUpdate({
          target: [
            questProgress.relationshipId,
            questProgress.questTemplateId,
            questProgress.periodStart,
            questProgress.periodEnd,
          ],
          set: {
            // progress_count = min(target, progress_count + 1)
            progressCount: sql`LEAST(${t.targetCount}, ${questProgress.progressCount} + ${inc})`,
            // Set started_at once (first qualifying event in the period).
            startedAt: sql`COALESCE(${questProgress.startedAt}, ${occurredAtTz})`,
            // If we just reached completion, set completed_at once.
            completedAt: sql`COALESCE(
              ${questProgress.completedAt},
              CASE WHEN (${questProgress.progressCount} + ${inc}) >= ${t.targetCount} THEN ${occurredAtTz} ELSE NULL END
            )`,
            // Track who completed (best-effort) once.
            completedByUserId: sql`COALESCE(
              ${questProgress.completedByUserId},
              CASE
                WHEN (${questProgress.progressCount} + ${inc}) >= ${t.targetCount} THEN ${actorUserIdUuid}
                ELSE NULL
              END
            )`,
          },
        })
        .returning({
          progressCount: questProgress.progressCount,
          startedAt: questProgress.startedAt,
          completedAt: questProgress.completedAt,
          completedByUserId: questProgress.completedByUserId,
        });

      const row = inserted[0];
      const isNowCompleted = Boolean(row?.completedAt);
      const isNowStarted = Boolean(row?.startedAt);

      if (!alreadyStarted && isNowStarted) {
        args.ctx?.log?.("analytics.quest.started", {
          relationshipId: args.relationshipId,
          questTemplateId: t.id,
          cadence: t.type,
          startedAt: row?.startedAt?.toISOString?.() ?? null,
          actorUserId: args.actorUserId ?? null,
        });
      }

      if (!alreadyCompleted && isNowCompleted) {
        // Completion side effects hook (push, analytics, etc). Keep idempotent.
        args.ctx?.log?.("quest completed", {
          relationshipId: args.relationshipId,
          questTemplateId: t.id,
          completedAt: row?.completedAt?.toISOString?.() ?? null,
        });

        newlyCompleted.push({ questTemplateId: t.id, title: t.title });

        const startedAtMs = row?.startedAt instanceof Date ? row.startedAt.getTime() : null;
        const completedAtMs = row?.completedAt instanceof Date ? row.completedAt.getTime() : null;
        const timeToCompletionMs =
          typeof startedAtMs === "number" && typeof completedAtMs === "number"
            ? Math.max(0, completedAtMs - startedAtMs)
            : null;

        args.ctx?.log?.("analytics.quest.completed", {
          relationshipId: args.relationshipId,
          questTemplateId: t.id,
          cadence: t.type,
          startedAt: row?.startedAt?.toISOString?.() ?? null,
          completedAt: row?.completedAt?.toISOString?.() ?? null,
          timeToCompletionMs,
          actorUserId: args.actorUserId ?? null,
          completedByUserId: row?.completedByUserId ?? null,
        });
      }
    })
  );

  return { newlyCompleted };
}
