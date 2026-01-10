import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, eq, sql } from "drizzle-orm";

import { requireRelationshipMemberFromRequest } from "../auth/requireRelationshipMember";
import { db } from "../db/client";
import { questProgress, questTemplates, type QuestCadence } from "../db/schema/quests";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

type QuestResponse = {
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  // Inclusive end date in UTC (YYYY-MM-DD)
  periodEnd: string;
};

function getPgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: unknown };
  if (typeof e?.code === "string") return e.code;
  const cause = e?.cause as { code?: unknown } | undefined;
  if (typeof cause?.code === "string") return cause.code;
  return undefined;
}

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

function toIsoDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function startOfUtcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function periodForTemplateType(type: QuestCadence, now: Date): { start: Date; end: Date } {
  return type === "MONTHLY" ? utcMonthRange(now) : utcIsoWeekRange(now);
}

app.http("quests", {
  methods: ["GET", "OPTIONS"],
  route: "quests",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const member = await requireRelationshipMemberFromRequest(req);
      const now = new Date();
      const todayUtc = startOfUtcToday(now);

      // Silent expiration: if the period has ended and the quest wasn't completed,
      // mark it expired so it won't be touched again.
      await db
        .update(questProgress)
        .set({ expiredAt: now })
        .where(
          sql`${questProgress.relationshipId} = ${member.relationshipId}::uuid
            AND ${questProgress.completedAt} IS NULL
            AND ${questProgress.expiredAt} IS NULL
            AND ${questProgress.periodEnd} <= ${todayUtc}`
        );

      const templates = await db
        .select({
          id: questTemplates.id,
          title: questTemplates.title,
          type: questTemplates.type,
          targetCount: questTemplates.targetCount,
          eventType: questTemplates.eventType,
        })
        .from(questTemplates)
        .orderBy(questTemplates.id);

      if (templates.length === 0) {
        return {
          status: 500,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Quest templates not seeded" },
        };
      }

      // Do NOT recalculate based on events here.
      // We only ensure the current period row exists so clients can render 0 progress.
      const quests = await Promise.all(
        templates.map(async (t) => {
          const period = periodForTemplateType(t.type, now);

          await db
            .insert(questProgress)
            .values({
              relationshipId: member.relationshipId,
              questTemplateId: t.id,
              periodStart: period.start,
              periodEnd: period.end,
              progressCount: 0,
              startedAt: null,
              completedAt: null,
              completedByUserId: null,
              expiredAt: null,
            })
            .onConflictDoNothing();

          const rows = await db
            .select({
              progressCount: questProgress.progressCount,
              completedAt: questProgress.completedAt,
            })
            .from(questProgress)
            .where(
              and(
                eq(questProgress.relationshipId, member.relationshipId),
                eq(questProgress.questTemplateId, t.id),
                eq(questProgress.periodStart, period.start),
                eq(questProgress.periodEnd, period.end)
              )
            )
            .limit(1);

          const row = rows[0] ?? { progressCount: 0, completedAt: null };

          const progress = clampProgress(row.progressCount, t.targetCount);
          const completed = Boolean(row.completedAt);

          // DB stores periodEnd as exclusive. API returns inclusive end date.
          const periodEndInclusive = toIsoDateOnlyUtc(addUtcDays(period.end, -1));

          return {
            type: t.type,
            eventType: t.eventType,
            summary: {
              title: t.title,
              progress,
              target: t.targetCount,
              completed,
              periodEnd: periodEndInclusive,
            } satisfies QuestResponse,
          };
        })
      );

      // MVP guarantees exactly one WEEKLY and one MONTHLY template.
      const weekly = quests.find((q) => q.type === "WEEKLY")?.summary ?? null;
      const monthly = quests.find((q) => q.type === "MONTHLY")?.summary ?? null;

      if (!weekly || !monthly) {
        return {
          status: 500,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Missing weekly/monthly quest templates" },
        };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, weekly, monthly },
      };
    } catch (e: unknown) {
      ctx.error(e);

      // Surface common DB schema issues clearly during development.
      // Postgres undefined_table: https://www.postgresql.org/docs/current/errcodes-appendix.html
      if (getPgErrorCode(e) === "42P01") {
        return {
          status: 500,
          headers: corsHeaders(req),
          jsonBody: {
            ok: false,
            error:
              'Database schema is missing a required table (quest_progress). Run the Drizzle migrations for apps/functions (pnpm db:migrate).',
          },
        };
      }

      return {
        status: 401,
        headers: corsHeaders(req),
        jsonBody: { ok: false, error: e instanceof Error ? e.message : "Unauthorized" },
      };
    }
  },
});
