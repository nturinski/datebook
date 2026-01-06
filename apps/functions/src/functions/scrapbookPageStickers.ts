import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRelationshipMember } from "../auth/requireRelationshipMember";
import { db } from "../db/client";
import { scrapbookPageStickers } from "../db/schema/scrapbookPageStickers";
import { scrapbookPages } from "../db/schema/scrapbookPages";
import { scrapbooks } from "../db/schema/scrapbooks";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

const StickerKindSchema = z.enum([
  "heart",
  "star",
  "smile",
  "sparkle",
  "flower",
  "sun",
  "moon",
  "cloud",
  "rainbow",
  "check",
  "music",
  "coffee",
  "camera",
  "balloon",
  "gift",
  "party",
  "tape",
  "thumbsUp",
  "fire",
  "leaf",
]);

const CreateStickerBodySchema = z.object({
  kind: StickerKindSchema,
  // Normalized 0..1 within the canvas.
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  // Visual scale multiplier.
  scale: z.number().min(0.25).max(4).optional(),
  // Degrees.
  rotation: z.number().min(-3600).max(3600).optional(),
});

const PatchStickerBodySchema = z
  .object({
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    scale: z.number().min(0.25).max(4).optional(),
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

app.http("scrapbookPageStickers", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/stickers",
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
        const parsed = CreateStickerBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const inserted = await db
          .insert(scrapbookPageStickers)
          .values({
            relationshipId: member.relationshipId,
            scrapbookId,
            pageId,
            kind: parsed.data.kind,
            x: typeof parsed.data.x === "number" ? parsed.data.x : 0.12,
            y: typeof parsed.data.y === "number" ? parsed.data.y : 0.12,
            scale: typeof parsed.data.scale === "number" ? parsed.data.scale : 1,
            rotation: typeof parsed.data.rotation === "number" ? parsed.data.rotation : 0,
            updatedAt: new Date(),
          })
          .returning({
            id: scrapbookPageStickers.id,
            kind: scrapbookPageStickers.kind,
            x: scrapbookPageStickers.x,
            y: scrapbookPageStickers.y,
            scale: scrapbookPageStickers.scale,
            rotation: scrapbookPageStickers.rotation,
            createdAt: scrapbookPageStickers.createdAt,
            updatedAt: scrapbookPageStickers.updatedAt,
          });

        const s = inserted[0]!;
        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: {
            ok: true,
            sticker: {
              id: s.id,
              kind: s.kind,
              x: s.x,
              y: s.y,
              scale: s.scale,
              rotation: s.rotation,
              createdAt: s.createdAt.toISOString(),
              updatedAt: s.updatedAt.toISOString(),
            },
          },
        };
      }

      // GET list
      const stickers = await db
        .select({
          id: scrapbookPageStickers.id,
          kind: scrapbookPageStickers.kind,
          x: scrapbookPageStickers.x,
          y: scrapbookPageStickers.y,
          scale: scrapbookPageStickers.scale,
          rotation: scrapbookPageStickers.rotation,
          createdAt: scrapbookPageStickers.createdAt,
          updatedAt: scrapbookPageStickers.updatedAt,
        })
        .from(scrapbookPageStickers)
        .where(
          and(
            eq(scrapbookPageStickers.relationshipId, member.relationshipId),
            eq(scrapbookPageStickers.scrapbookId, scrapbookId),
            eq(scrapbookPageStickers.pageId, pageId)
          )
        )
        .orderBy(asc(scrapbookPageStickers.createdAt), asc(scrapbookPageStickers.id))
        .limit(500);

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          stickers: stickers.map((s) => ({
            id: s.id,
            kind: s.kind,
            x: s.x,
            y: s.y,
            scale: s.scale,
            rotation: s.rotation,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
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

app.http("scrapbookPageStickersById", {
  methods: ["PATCH", "DELETE", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/stickers/{stickerId}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const scrapbookId = req.params.id;
    const pageId = req.params.pageId;
    const stickerId = req.params.stickerId;
    if (!scrapbookId || !pageId || !stickerId) {
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
          .delete(scrapbookPageStickers)
          .where(
            and(
              eq(scrapbookPageStickers.id, stickerId),
              eq(scrapbookPageStickers.pageId, pageId),
              eq(scrapbookPageStickers.scrapbookId, scrapbookId),
              eq(scrapbookPageStickers.relationshipId, member.relationshipId)
            )
          )
          .returning({ id: scrapbookPageStickers.id });

        if (!deleted[0]) {
          return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
        }

        return { status: 200, headers: corsHeaders(req), jsonBody: { ok: true } };
      }

      // PATCH
      const raw = await req.json().catch(() => null);
      const parsed = PatchStickerBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const patch: Partial<typeof scrapbookPageStickers.$inferInsert> = {
        ...(typeof parsed.data.x === "number" ? { x: parsed.data.x } : {}),
        ...(typeof parsed.data.y === "number" ? { y: parsed.data.y } : {}),
        ...(typeof parsed.data.scale === "number" ? { scale: parsed.data.scale } : {}),
        ...(typeof parsed.data.rotation === "number" ? { rotation: parsed.data.rotation } : {}),
        updatedAt: new Date(),
      };

      const updated = await db
        .update(scrapbookPageStickers)
        .set(patch)
        .where(
          and(
            eq(scrapbookPageStickers.id, stickerId),
            eq(scrapbookPageStickers.pageId, pageId),
            eq(scrapbookPageStickers.scrapbookId, scrapbookId),
            eq(scrapbookPageStickers.relationshipId, member.relationshipId)
          )
        )
        .returning({
          id: scrapbookPageStickers.id,
          kind: scrapbookPageStickers.kind,
          x: scrapbookPageStickers.x,
          y: scrapbookPageStickers.y,
          scale: scrapbookPageStickers.scale,
          rotation: scrapbookPageStickers.rotation,
          createdAt: scrapbookPageStickers.createdAt,
          updatedAt: scrapbookPageStickers.updatedAt,
        });

      const s = updated[0];
      if (!s) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          sticker: {
            id: s.id,
            kind: s.kind,
            x: s.x,
            y: s.y,
            scale: s.scale,
            rotation: s.rotation,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
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
