import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { requireRelationshipMember } from "../auth/requireRelationshipMember";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { db } from "../db/client";
import { scrapbooks } from "../db/schema/scrapbooks";
import { scrapbookPages } from "../db/schema/scrapbookPages";
import { scrapbookPageMedia } from "../db/schema/scrapbookPageMedia";
import { createReadUrl } from "../lib/mediaStorage";

const AttachBodySchema = z.object({
  blobKey: z.string().min(1).max(1024),
  kind: z.enum(["photo"]),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
});

const UpdatePositionBodySchema = z.object({
  // Normalized 0..1
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),

  // Visual scale multiplier.
  scale: z.number().min(0.25).max(4).optional(),
});

const PatchDetailsBodySchema = z
  .object({
    // Date-only string (YYYY-MM-DD). Null clears.
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),

    // Free-form for MVP (can be upgraded to a Places integration later). Null clears.
    place: z.string().trim().min(1).max(200).nullable().optional(),

    // Optional stable identifier from Google Places (or future provider). Null clears.
    placeId: z.string().trim().min(1).max(200).nullable().optional(),

    // Preset chips in UI, but allow arbitrary strings for forward compatibility.
    // Null clears.
    moodTags: z.array(z.string().trim().min(1).max(30)).max(24).nullable().optional(),

    // Short review text. Null clears.
    review: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      typeof v.date !== "undefined" ||
      typeof v.place !== "undefined" ||
      typeof v.placeId !== "undefined" ||
      typeof v.moodTags !== "undefined" ||
      typeof v.review !== "undefined",
    { message: "Provide at least one field to update" }
  );

function parseIsoDateOnly(value: string): Date {
  // Interpret date-only values as UTC midnight so round-tripping is stable.
  const d = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) {
    throw new Error("Invalid date");
  }
  return d;
}

function dateOnlyToIso(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

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

app.http("scrapbookPages", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "scrapbooks/{id}/pages",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const scrapbookId = req.params.id;
    if (!scrapbookId) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing id" } };
    }

    try {
      const sb = await getScrapbookOr404({ scrapbookId });
      if (sb.ok === false) {
        return { ...sb.res, headers: corsHeaders(req) };
      }

      const member = await requireRelationshipMember(req, sb.relationshipId);

      if (req.method === "POST") {
        // Append a new page to the end (1-based index).
        const maxRow = await db
          .select({ maxIndex: sql<number>`coalesce(max(${scrapbookPages.pageIndex}), 0)` })
          .from(scrapbookPages)
          .where(eq(scrapbookPages.scrapbookId, scrapbookId));

        const nextIndex = (maxRow[0]?.maxIndex ?? 0) + 1;

        const inserted = await db
          .insert(scrapbookPages)
          .values({
            relationshipId: member.relationshipId,
            scrapbookId,
            createdByUserId: member.userId,
            pageIndex: nextIndex,
            updatedAt: new Date(),
          })
          .returning({
            id: scrapbookPages.id,
            pageIndex: scrapbookPages.pageIndex,
            detailsDate: scrapbookPages.detailsDate,
            detailsPlace: scrapbookPages.detailsPlace,
            detailsPlaceId: scrapbookPages.detailsPlaceId,
            detailsMoodTags: scrapbookPages.detailsMoodTags,
            detailsReview: scrapbookPages.detailsReview,
            createdAt: scrapbookPages.createdAt,
            updatedAt: scrapbookPages.updatedAt,
          });

        const p = inserted[0]!;

        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: {
            ok: true,
            page: {
              id: p.id,
              pageIndex: p.pageIndex,
              details: {
                date: dateOnlyToIso(p.detailsDate ?? null),
                place: p.detailsPlace ?? null,
                placeId: p.detailsPlaceId ?? null,
                moodTags: (p.detailsMoodTags as unknown as string[] | null) ?? null,
                review: p.detailsReview ?? null,
              },
              media: [],
              createdAt: p.createdAt.toISOString(),
              updatedAt: p.updatedAt.toISOString(),
            },
          },
        };
      }

      // GET list
      const pages = await db
        .select({
          id: scrapbookPages.id,
          pageIndex: scrapbookPages.pageIndex,
          detailsDate: scrapbookPages.detailsDate,
          detailsPlace: scrapbookPages.detailsPlace,
          detailsPlaceId: scrapbookPages.detailsPlaceId,
          detailsMoodTags: scrapbookPages.detailsMoodTags,
          detailsReview: scrapbookPages.detailsReview,
          createdAt: scrapbookPages.createdAt,
          updatedAt: scrapbookPages.updatedAt,
        })
        .from(scrapbookPages)
        .where(and(eq(scrapbookPages.scrapbookId, scrapbookId), eq(scrapbookPages.relationshipId, member.relationshipId)))
        .orderBy(asc(scrapbookPages.pageIndex), asc(scrapbookPages.createdAt))
        .limit(500);

      const pageIds = pages.map((p) => p.id);
      const mediaRows =
        pageIds.length === 0
          ? []
          : await db
              .select({
                id: scrapbookPageMedia.id,
                pageId: scrapbookPageMedia.pageId,
                blobKey: scrapbookPageMedia.blobKey,
                kind: scrapbookPageMedia.kind,
                width: scrapbookPageMedia.width,
                height: scrapbookPageMedia.height,
                x: scrapbookPageMedia.x,
                y: scrapbookPageMedia.y,
                scale: scrapbookPageMedia.scale,
                createdAt: scrapbookPageMedia.createdAt,
              })
              .from(scrapbookPageMedia)
              .where(
                and(
                  eq(scrapbookPageMedia.scrapbookId, scrapbookId),
                  eq(scrapbookPageMedia.relationshipId, member.relationshipId),
                  inArray(scrapbookPageMedia.pageId, pageIds)
                )
              )
              .orderBy(desc(scrapbookPageMedia.createdAt));

      const mediaByPage = new Map<string, typeof mediaRows>();
      for (const m of mediaRows) {
        const list = mediaByPage.get(m.pageId) ?? [];
        list.push(m);
        mediaByPage.set(m.pageId, list);
      }

      const resultPages = await Promise.all(
        pages.map(async (p) => {
          const media = mediaByPage.get(p.id) ?? [];

          const resolved = await Promise.all(
            media.map(async (m) => {
              const read = await createReadUrl({ blobKey: m.blobKey, expiresInMinutes: 60 });
              return {
                id: m.id,
                kind: m.kind,
                blobKey: m.blobKey,
                url: read.url,
                expiresAt: read.expiresAt,
                width: m.width,
                height: m.height,
                x: m.x,
                y: m.y,
                scale: m.scale,
                createdAt: m.createdAt.toISOString(),
              };
            })
          );

          return {
            id: p.id,
            pageIndex: p.pageIndex,
            details: {
              date: dateOnlyToIso(p.detailsDate ?? null),
              place: p.detailsPlace ?? null,
              placeId: p.detailsPlaceId ?? null,
              moodTags: (p.detailsMoodTags as unknown as string[] | null) ?? null,
              review: p.detailsReview ?? null,
            },
            media: resolved,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          };
        })
      );

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, pages: resultPages },
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

app.http("scrapbookPageDetails", {
  methods: ["PATCH", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/details",
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
      const raw = await req.json().catch(() => null);
      const parsed = PatchDetailsBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const sb = await getScrapbookOr404({ scrapbookId });
      if (sb.ok === false) {
        return { ...sb.res, headers: corsHeaders(req) };
      }

      const member = await requireRelationshipMember(req, sb.relationshipId);

      // Ensure the page exists and belongs to this scrapbook + relationship.
      const existingRows = await db
        .select({
          id: scrapbookPages.id,
          pageIndex: scrapbookPages.pageIndex,
        })
        .from(scrapbookPages)
        .where(
          and(
            eq(scrapbookPages.id, pageId),
            eq(scrapbookPages.scrapbookId, scrapbookId),
            eq(scrapbookPages.relationshipId, member.relationshipId)
          )
        )
        .limit(1);

      if (!existingRows[0]) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      const patch: Partial<typeof scrapbookPages.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (typeof parsed.data.date !== "undefined") {
        patch.detailsDate = parsed.data.date === null ? null : parseIsoDateOnly(parsed.data.date);
      }
      if (typeof parsed.data.place !== "undefined") {
        patch.detailsPlace = parsed.data.place;

        // If the place label is cleared, clear the stable place id too (unless explicitly set).
        if (parsed.data.place === null && typeof parsed.data.placeId === "undefined") {
          patch.detailsPlaceId = null;
        }
      }

      if (typeof parsed.data.placeId !== "undefined") {
        patch.detailsPlaceId = parsed.data.placeId;
      }
      if (typeof parsed.data.moodTags !== "undefined") {
        patch.detailsMoodTags = parsed.data.moodTags;
      }
      if (typeof parsed.data.review !== "undefined") {
        patch.detailsReview = parsed.data.review;
      }

      const updated = await db
        .update(scrapbookPages)
        .set(patch)
        .where(
          and(
            eq(scrapbookPages.id, pageId),
            eq(scrapbookPages.scrapbookId, scrapbookId),
            eq(scrapbookPages.relationshipId, member.relationshipId)
          )
        )
        .returning({
          id: scrapbookPages.id,
          pageIndex: scrapbookPages.pageIndex,
          detailsDate: scrapbookPages.detailsDate,
          detailsPlace: scrapbookPages.detailsPlace,
          detailsPlaceId: scrapbookPages.detailsPlaceId,
          detailsMoodTags: scrapbookPages.detailsMoodTags,
          detailsReview: scrapbookPages.detailsReview,
          updatedAt: scrapbookPages.updatedAt,
        });

      const p = updated[0];
      if (!p) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          page: {
            id: p.id,
            pageIndex: p.pageIndex,
            details: {
              date: dateOnlyToIso(p.detailsDate ?? null),
              place: p.detailsPlace ?? null,
              placeId: p.detailsPlaceId ?? null,
              moodTags: (p.detailsMoodTags as unknown as string[] | null) ?? null,
              review: p.detailsReview ?? null,
            },
            updatedAt: p.updatedAt.toISOString(),
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

app.http("scrapbookPageAttachMedia", {
  methods: ["POST", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/media",
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
      const raw = await req.json().catch(() => null);
      const parsed = AttachBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const sb = await getScrapbookOr404({ scrapbookId });
      if (sb.ok === false) {
        return { ...sb.res, headers: corsHeaders(req) };
      }

      const member = await requireRelationshipMember(req, sb.relationshipId);

      const pageRows = await db
        .select({ id: scrapbookPages.id })
        .from(scrapbookPages)
        .where(
          and(
            eq(scrapbookPages.id, pageId),
            eq(scrapbookPages.scrapbookId, scrapbookId),
            eq(scrapbookPages.relationshipId, member.relationshipId)
          )
        )
        .limit(1);

      if (!pageRows[0]) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      const expectedPrefix = `relationships/${member.relationshipId}/`;
      if (!parsed.data.blobKey.startsWith(expectedPrefix)) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid blobKey for this relationship" },
        };
      }

      const inserted = await db
        .insert(scrapbookPageMedia)
        .values({
          relationshipId: member.relationshipId,
          scrapbookId,
          pageId,
          blobKey: parsed.data.blobKey,
          kind: parsed.data.kind,
          width: parsed.data.width,
          height: parsed.data.height,
        })
        .returning({
          id: scrapbookPageMedia.id,
          pageId: scrapbookPageMedia.pageId,
          blobKey: scrapbookPageMedia.blobKey,
          kind: scrapbookPageMedia.kind,
          width: scrapbookPageMedia.width,
          height: scrapbookPageMedia.height,
          createdAt: scrapbookPageMedia.createdAt,
        });

      return {
        status: 201,
        headers: corsHeaders(req),
        jsonBody: { ok: true, media: inserted[0] },
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

app.http("scrapbookPageUpdateMediaPosition", {
  methods: ["PATCH", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/media/{mediaId}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const scrapbookId = req.params.id;
    const pageId = req.params.pageId;
    const mediaId = req.params.mediaId;
    if (!scrapbookId || !pageId || !mediaId) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing id" } };
    }

    try {
      const raw = await req.json().catch(() => null);
      const parsed = UpdatePositionBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const sb = await getScrapbookOr404({ scrapbookId });
      if (sb.ok === false) {
        return { ...sb.res, headers: corsHeaders(req) };
      }

      const member = await requireRelationshipMember(req, sb.relationshipId);

      // Ensure the page is part of this scrapbook.
      const pageRows = await db
        .select({ id: scrapbookPages.id })
        .from(scrapbookPages)
        .where(
          and(
            eq(scrapbookPages.id, pageId),
            eq(scrapbookPages.scrapbookId, scrapbookId),
            eq(scrapbookPages.relationshipId, member.relationshipId)
          )
        )
        .limit(1);

      if (!pageRows[0]) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      const patch: Partial<typeof scrapbookPageMedia.$inferInsert> = {
        x: parsed.data.x,
        y: parsed.data.y,
        ...(typeof parsed.data.scale === "number" ? { scale: parsed.data.scale } : {}),
      };

      const updated = await db
        .update(scrapbookPageMedia)
        .set(patch)
        .where(
          and(
            eq(scrapbookPageMedia.id, mediaId),
            eq(scrapbookPageMedia.pageId, pageId),
            eq(scrapbookPageMedia.scrapbookId, scrapbookId),
            eq(scrapbookPageMedia.relationshipId, member.relationshipId)
          )
        )
        .returning({
          id: scrapbookPageMedia.id,
          pageId: scrapbookPageMedia.pageId,
          x: scrapbookPageMedia.x,
          y: scrapbookPageMedia.y,
          scale: scrapbookPageMedia.scale,
        });

      if (!updated[0]) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, media: updated[0] },
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
