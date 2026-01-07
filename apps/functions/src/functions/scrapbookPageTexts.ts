import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRelationshipMember } from "../auth/requireRelationshipMember";
import { db } from "../db/client";
import { scrapbookPages } from "../db/schema/scrapbookPages";
import { scrapbookPageTexts } from "../db/schema/scrapbookPageTexts";
import { scrapbooks } from "../db/schema/scrapbooks";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

const TextFontSchema = z.enum(["hand", "script", "marker", "print", "justAnotherHand"]);

const ColorSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

const CreateTextBodySchema = z.object({
  text: z.string().max(2000).optional(),
  font: TextFontSchema.optional(),
  color: ColorSchema.optional(),
  // Normalized position. Historically this was clamped 0..1 (fully within canvas).
  // We allow overshoot so text can hang off the page.
  x: z.number().min(-2).max(3).optional(),
  y: z.number().min(-2).max(3).optional(),
  // Visual scale multiplier.
  scale: z.number().min(0.25).max(6).optional(),
  // Degrees.
  rotation: z.number().min(-3600).max(3600).optional(),
});

const PatchTextBodySchema = z
  .object({
    text: z.string().max(2000).optional(),
    font: TextFontSchema.optional(),
    color: ColorSchema.optional(),
    x: z.number().min(-2).max(3).optional(),
    y: z.number().min(-2).max(3).optional(),
    scale: z.number().min(0.25).max(6).optional(),
    rotation: z.number().min(-3600).max(3600).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });

async function getScrapbookOr404(args: {
  scrapbookId: string;
}): Promise<{ ok: true; relationshipId: string } | { ok: false; res: HttpResponseInit }> {
  const rows = await db
    .select({ relationshipId: scrapbooks.relationshipId })
    .from(scrapbooks)
    .where(eq(scrapbooks.id, args.scrapbookId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      ok: false as const,
      res: { status: 404, jsonBody: { ok: false, error: "Not found" } },
    };
  }

  return { ok: true as const, relationshipId: row.relationshipId };
}

async function assertPageOr404(args: {
  scrapbookId: string;
  pageId: string;
  relationshipId: string;
}): Promise<{ ok: true } | { ok: false; res: HttpResponseInit }> {
  const rows = await db
    .select({ id: scrapbookPages.id })
    .from(scrapbookPages)
    .where(
      and(
        eq(scrapbookPages.id, args.pageId),
        eq(scrapbookPages.scrapbookId, args.scrapbookId),
        eq(scrapbookPages.relationshipId, args.relationshipId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    return { ok: false as const, res: { status: 404, jsonBody: { ok: false, error: "Not found" } } };
  }

  return { ok: true as const };
}

app.http("scrapbookPageTexts", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/texts",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const scrapbookId = req.params.id;
    const pageId = req.params.pageId;
    if (!scrapbookId || !pageId) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing id" } };
    }

    try {
      const sb = await getScrapbookOr404({ scrapbookId });
      if (sb.ok === false) {
        return { ...sb.res, headers: corsHeaders(req) };
      }

      const member = await requireRelationshipMember(req, sb.relationshipId);

      const pageOk = await assertPageOr404({ scrapbookId, pageId, relationshipId: member.relationshipId });
      if (pageOk.ok === false) {
        return { ...pageOk.res, headers: corsHeaders(req) };
      }

      if (req.method === "POST") {
        const raw = await req.json().catch(() => null);
        const parsed = CreateTextBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const inserted = await db
          .insert(scrapbookPageTexts)
          .values({
            relationshipId: member.relationshipId,
            scrapbookId,
            pageId,
            createdByUserId: member.userId,
            text: typeof parsed.data.text === "string" ? parsed.data.text : "Text",
            font: typeof parsed.data.font === "string" ? parsed.data.font : "hand",
            color: typeof parsed.data.color === "string" ? parsed.data.color : "#2E2A27",
            x: typeof parsed.data.x === "number" ? parsed.data.x : 0.12,
            y: typeof parsed.data.y === "number" ? parsed.data.y : 0.12,
            scale: typeof parsed.data.scale === "number" ? parsed.data.scale : 1,
            rotation: typeof parsed.data.rotation === "number" ? parsed.data.rotation : 0,
            updatedAt: new Date(),
          })
          .returning({
            id: scrapbookPageTexts.id,
            createdByUserId: scrapbookPageTexts.createdByUserId,
            text: scrapbookPageTexts.text,
            font: scrapbookPageTexts.font,
            color: scrapbookPageTexts.color,
            x: scrapbookPageTexts.x,
            y: scrapbookPageTexts.y,
            scale: scrapbookPageTexts.scale,
            rotation: scrapbookPageTexts.rotation,
            createdAt: scrapbookPageTexts.createdAt,
            updatedAt: scrapbookPageTexts.updatedAt,
          });

        const t = inserted[0]!;
        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: {
            ok: true,
            text: {
              id: t.id,
              createdByUserId: t.createdByUserId,
              text: t.text,
              font: t.font,
              color: t.color,
              x: t.x,
              y: t.y,
              scale: t.scale,
              rotation: t.rotation,
              createdAt: t.createdAt.toISOString(),
              updatedAt: t.updatedAt.toISOString(),
            },
          },
        };
      }

      const texts = await db
        .select({
          id: scrapbookPageTexts.id,
          createdByUserId: scrapbookPageTexts.createdByUserId,
          text: scrapbookPageTexts.text,
          font: scrapbookPageTexts.font,
          color: scrapbookPageTexts.color,
          x: scrapbookPageTexts.x,
          y: scrapbookPageTexts.y,
          scale: scrapbookPageTexts.scale,
          rotation: scrapbookPageTexts.rotation,
          createdAt: scrapbookPageTexts.createdAt,
          updatedAt: scrapbookPageTexts.updatedAt,
        })
        .from(scrapbookPageTexts)
        .where(
          and(
            eq(scrapbookPageTexts.relationshipId, member.relationshipId),
            eq(scrapbookPageTexts.scrapbookId, scrapbookId),
            eq(scrapbookPageTexts.pageId, pageId)
          )
        )
        .orderBy(asc(scrapbookPageTexts.createdAt), asc(scrapbookPageTexts.id))
        .limit(500);

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          texts: texts.map((t) => ({
            id: t.id,
            createdByUserId: t.createdByUserId,
            text: t.text,
            font: t.font,
            color: t.color,
            x: t.x,
            y: t.y,
            scale: t.scale,
            rotation: t.rotation,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
          })),
        },
      };
    } catch (e: unknown) {
      ctx.error(e);
      return {
        status: 401,
        headers: corsHeaders(req),
        jsonBody: { ok: false, error: e instanceof Error ? e.message : "Unauthorized" },
      };
    }
  },
});

app.http("scrapbookPageTextsById", {
  methods: ["PATCH", "DELETE", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/texts/{textId}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const scrapbookId = req.params.id;
    const pageId = req.params.pageId;
    const textId = req.params.textId;
    if (!scrapbookId || !pageId || !textId) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing id" } };
    }

    try {
      const sb = await getScrapbookOr404({ scrapbookId });
      if (sb.ok === false) {
        return { ...sb.res, headers: corsHeaders(req) };
      }

      const member = await requireRelationshipMember(req, sb.relationshipId);

      const pageOk = await assertPageOr404({ scrapbookId, pageId, relationshipId: member.relationshipId });
      if (pageOk.ok === false) {
        return { ...pageOk.res, headers: corsHeaders(req) };
      }

      if (req.method === "DELETE") {
        const deleted = await db
          .delete(scrapbookPageTexts)
          .where(
            and(
              eq(scrapbookPageTexts.id, textId),
              eq(scrapbookPageTexts.pageId, pageId),
              eq(scrapbookPageTexts.scrapbookId, scrapbookId),
              eq(scrapbookPageTexts.relationshipId, member.relationshipId)
            )
          )
          .returning({ id: scrapbookPageTexts.id });

        if (!deleted[0]) {
          return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
        }

        return { status: 200, headers: corsHeaders(req), jsonBody: { ok: true } };
      }

      const raw = await req.json().catch(() => null);
      const parsed = PatchTextBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const patch: Partial<typeof scrapbookPageTexts.$inferInsert> = {
        ...(typeof parsed.data.text === "string" ? { text: parsed.data.text } : {}),
        ...(typeof parsed.data.font === "string" ? { font: parsed.data.font } : {}),
        ...(typeof parsed.data.color === "string" ? { color: parsed.data.color } : {}),
        ...(typeof parsed.data.x === "number" ? { x: parsed.data.x } : {}),
        ...(typeof parsed.data.y === "number" ? { y: parsed.data.y } : {}),
        ...(typeof parsed.data.scale === "number" ? { scale: parsed.data.scale } : {}),
        ...(typeof parsed.data.rotation === "number" ? { rotation: parsed.data.rotation } : {}),
        updatedAt: new Date(),
      };

      const updated = await db
        .update(scrapbookPageTexts)
        .set(patch)
        .where(
          and(
            eq(scrapbookPageTexts.id, textId),
            eq(scrapbookPageTexts.pageId, pageId),
            eq(scrapbookPageTexts.scrapbookId, scrapbookId),
            eq(scrapbookPageTexts.relationshipId, member.relationshipId)
          )
        )
        .returning({
          id: scrapbookPageTexts.id,
          createdByUserId: scrapbookPageTexts.createdByUserId,
          text: scrapbookPageTexts.text,
          font: scrapbookPageTexts.font,
          color: scrapbookPageTexts.color,
          x: scrapbookPageTexts.x,
          y: scrapbookPageTexts.y,
          scale: scrapbookPageTexts.scale,
          rotation: scrapbookPageTexts.rotation,
          createdAt: scrapbookPageTexts.createdAt,
          updatedAt: scrapbookPageTexts.updatedAt,
        });

      const t = updated[0];
      if (!t) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          text: {
            id: t.id,
            createdByUserId: t.createdByUserId,
            text: t.text,
            font: t.font,
            color: t.color,
            x: t.x,
            y: t.y,
            scale: t.scale,
            rotation: t.rotation,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
          },
        },
      };
    } catch (e: unknown) {
      ctx.error(e);
      return {
        status: 401,
        headers: corsHeaders(req),
        jsonBody: { ok: false, error: e instanceof Error ? e.message : "Unauthorized" },
      };
    }
  },
});
