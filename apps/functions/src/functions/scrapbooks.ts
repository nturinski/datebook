import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { requireAuth } from "../auth/requireAuth";
import { requireRelationshipMember } from "../auth/requireRelationshipMember";
import { db } from "../db/client";
import { relationshipMembers } from "../db/schema/relationships";
import { scrapbooks } from "../db/schema/scrapbooks";
import { scrapbookPages } from "../db/schema/scrapbookPages";
import { createReadUrl } from "../lib/mediaStorage";

const CreateScrapbookBodySchema = z.object({
  relationshipId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  coverBlobKey: z.string().min(1).max(1024).optional(),
  coverWidth: z.number().int().min(1).max(20000).optional(),
  coverHeight: z.number().int().min(1).max(20000).optional(),
});

const PatchDetailsBodySchema = z
  .object({
    // Date-only string (YYYY-MM-DD). Null clears.
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),

    // Free-form for MVP. Null clears.
    place: z.string().trim().min(1).max(200).nullable().optional(),

    // Optional stable identifier from Google Places (or future provider). Null clears.
    placeId: z.string().trim().min(1).max(200).nullable().optional(),

    // Preset chips in UI, but allow arbitrary strings for forward compatibility. Null clears.
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

function expectedRelationshipBlobPrefix(relationshipId: string): string {
  return `relationships/${relationshipId}/`;
}

// Note: In this repo we keep GET/POST for the same route in a single function
// to avoid route conflicts in the Functions runtime.
app.http("scrapbooks", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "scrapbooks",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      if (req.method === "POST") {
        const raw = await req.json().catch(() => null);
        const parsed = CreateScrapbookBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const { relationshipId, title, coverBlobKey, coverWidth, coverHeight } = parsed.data;

        const member = await requireRelationshipMember(req, relationshipId);

        if (coverBlobKey) {
          const expected = expectedRelationshipBlobPrefix(member.relationshipId);
          if (!coverBlobKey.startsWith(expected)) {
            return {
              status: 400,
              headers: corsHeaders(req),
              jsonBody: { ok: false, error: "Invalid coverBlobKey for this relationship" },
            };
          }
        }

        const inserted = await db
          .insert(scrapbooks)
          .values({
            relationshipId: member.relationshipId,
            createdByUserId: member.userId,
            title,
            coverBlobKey: coverBlobKey ?? null,
            coverWidth: typeof coverWidth === "number" ? coverWidth : null,
            coverHeight: typeof coverHeight === "number" ? coverHeight : null,
            updatedAt: new Date(),
          })
          .returning({
            id: scrapbooks.id,
            relationshipId: scrapbooks.relationshipId,
            title: scrapbooks.title,
            coverBlobKey: scrapbooks.coverBlobKey,
            coverWidth: scrapbooks.coverWidth,
            coverHeight: scrapbooks.coverHeight,
            createdAt: scrapbooks.createdAt,
            updatedAt: scrapbooks.updatedAt,
          });

        const s = inserted[0]!;

        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: {
            ok: true,
            scrapbook: {
              id: s.id,
              relationshipId: s.relationshipId,
              title: s.title,
              coverBlobKey: s.coverBlobKey,
              coverWidth: s.coverWidth,
              coverHeight: s.coverHeight,
              createdAt: s.createdAt.toISOString(),
              updatedAt: s.updatedAt.toISOString(),
            },
          },
        };
      }

      // GET list
      const auth = await requireAuth(req);

      const memberships = await db
        .select({ relationshipId: relationshipMembers.relationshipId })
        .from(relationshipMembers)
        .where(sql`${relationshipMembers.userId} = ${auth.userId}::uuid AND ${relationshipMembers.status} <> 'pending'`);

      const relationshipIds = memberships.map((m) => m.relationshipId);
      if (relationshipIds.length === 0) {
        return {
          status: 200,
          headers: corsHeaders(req),
          jsonBody: { ok: true, scrapbooks: [] },
        };
      }

      const rows = await db
        .select({
          id: scrapbooks.id,
          relationshipId: scrapbooks.relationshipId,
          title: scrapbooks.title,
          coverBlobKey: scrapbooks.coverBlobKey,
          coverWidth: scrapbooks.coverWidth,
          coverHeight: scrapbooks.coverHeight,
          createdAt: scrapbooks.createdAt,
          updatedAt: scrapbooks.updatedAt,
        })
        .from(scrapbooks)
        .where(inArray(scrapbooks.relationshipId, relationshipIds))
        .orderBy(desc(scrapbooks.createdAt), desc(scrapbooks.id))
        .limit(200);

      const items = await Promise.all(
        rows.map(async (s) => {
          if (s.coverBlobKey) {
            const read = await createReadUrl({ blobKey: s.coverBlobKey, expiresInMinutes: 60 });
            return {
              id: s.id,
              relationshipId: s.relationshipId,
              title: s.title,
              cover: {
                blobKey: s.coverBlobKey,
                width: s.coverWidth,
                height: s.coverHeight,
                url: read.url,
                expiresAt: read.expiresAt,
              },
              createdAt: s.createdAt.toISOString(),
              updatedAt: s.updatedAt.toISOString(),
            };
          }

          return {
            id: s.id,
            relationshipId: s.relationshipId,
            title: s.title,
            cover: null,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          };
        })
      );

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, scrapbooks: items },
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

app.http("scrapbooksById", {
  methods: ["GET", "OPTIONS"],
  route: "scrapbooks/{id}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const id = req.params.id;
    if (!id) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing id" } };
    }

    try {
      // Auth first (avoid leaking existence)
      await requireAuth(req);

      const rows = await db
        .select({
          id: scrapbooks.id,
          relationshipId: scrapbooks.relationshipId,
          title: scrapbooks.title,
          coverBlobKey: scrapbooks.coverBlobKey,
          coverWidth: scrapbooks.coverWidth,
          coverHeight: scrapbooks.coverHeight,
          detailsDate: scrapbooks.detailsDate,
          detailsPlace: scrapbooks.detailsPlace,
          detailsPlaceId: scrapbooks.detailsPlaceId,
          detailsMoodTags: scrapbooks.detailsMoodTags,
          detailsReview: scrapbooks.detailsReview,
          createdAt: scrapbooks.createdAt,
          updatedAt: scrapbooks.updatedAt,
        })
        .from(scrapbooks)
        .where(eq(scrapbooks.id, id))
        .limit(1);

      const s = rows[0];
      if (!s) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      await requireRelationshipMember(req, s.relationshipId);

      // Back-compat: if scrapbook-level details are empty, fall back to the first page
      // that has any details filled in (older clients stored details on pages).
      const scrapbookHasAnyDetails =
        !!s.detailsDate ||
        !!s.detailsPlace ||
        !!s.detailsPlaceId ||
        (Array.isArray(s.detailsMoodTags) && s.detailsMoodTags.length > 0) ||
        !!s.detailsReview;

      let fallbackDetails:
        | {
            date: string | null;
            place: string | null;
            placeId: string | null;
            moodTags: string[] | null;
            review: string | null;
          }
        | null = null;

      if (!scrapbookHasAnyDetails) {
        const pageRows = await db
          .select({
            detailsDate: scrapbookPages.detailsDate,
            detailsPlace: scrapbookPages.detailsPlace,
            detailsPlaceId: scrapbookPages.detailsPlaceId,
            detailsMoodTags: scrapbookPages.detailsMoodTags,
            detailsReview: scrapbookPages.detailsReview,
          })
          .from(scrapbookPages)
          .where(
            and(
              eq(scrapbookPages.scrapbookId, s.id),
              eq(scrapbookPages.relationshipId, s.relationshipId),
              sql`(
                ${scrapbookPages.detailsDate} is not null or
                ${scrapbookPages.detailsPlace} is not null or
                ${scrapbookPages.detailsPlaceId} is not null or
                ${scrapbookPages.detailsMoodTags} is not null or
                ${scrapbookPages.detailsReview} is not null
              )`
            )
          )
          .orderBy(asc(scrapbookPages.pageIndex), asc(scrapbookPages.createdAt))
          .limit(1);

        const p = pageRows[0];
        if (p) {
          fallbackDetails = {
            date: dateOnlyToIso(p.detailsDate ?? null),
            place: p.detailsPlace ?? null,
            placeId: p.detailsPlaceId ?? null,
            moodTags: (p.detailsMoodTags as unknown as string[] | null) ?? null,
            review: p.detailsReview ?? null,
          };
        }
      }

      const cover = s.coverBlobKey
        ? {
            blobKey: s.coverBlobKey,
            width: s.coverWidth,
            height: s.coverHeight,
            ...(await createReadUrl({ blobKey: s.coverBlobKey, expiresInMinutes: 60 })),
          }
        : null;

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          scrapbook: {
            id: s.id,
            relationshipId: s.relationshipId,
            title: s.title,
            cover,
            details: scrapbookHasAnyDetails
              ? {
                  date: dateOnlyToIso(s.detailsDate ?? null),
                  place: s.detailsPlace ?? null,
                  placeId: s.detailsPlaceId ?? null,
                  moodTags: (s.detailsMoodTags as unknown as string[] | null) ?? null,
                  review: s.detailsReview ?? null,
                }
              : fallbackDetails,
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

app.http("scrapbookDetails", {
  methods: ["PATCH", "OPTIONS"],
  route: "scrapbooks/{id}/details",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const id = req.params.id;
    if (!id) {
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

      // Auth first (avoid leaking existence)
      await requireAuth(req);

      const rows = await db
        .select({
          id: scrapbooks.id,
          relationshipId: scrapbooks.relationshipId,
        })
        .from(scrapbooks)
        .where(eq(scrapbooks.id, id))
        .limit(1);

      const sb = rows[0];
      if (!sb) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      await requireRelationshipMember(req, sb.relationshipId);

      const patch: Partial<typeof scrapbooks.$inferInsert> = {
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
        .update(scrapbooks)
        .set(patch)
        .where(eq(scrapbooks.id, id))
        .returning({
          id: scrapbooks.id,
          detailsDate: scrapbooks.detailsDate,
          detailsPlace: scrapbooks.detailsPlace,
          detailsPlaceId: scrapbooks.detailsPlaceId,
          detailsMoodTags: scrapbooks.detailsMoodTags,
          detailsReview: scrapbooks.detailsReview,
          updatedAt: scrapbooks.updatedAt,
        });

      const u = updated[0];
      if (!u) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          scrapbook: {
            id: u.id,
            details: {
              date: dateOnlyToIso(u.detailsDate ?? null),
              place: u.detailsPlace ?? null,
              placeId: u.detailsPlaceId ?? null,
              moodTags: (u.detailsMoodTags as unknown as string[] | null) ?? null,
              review: u.detailsReview ?? null,
            },
            updatedAt: u.updatedAt.toISOString(),
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
