import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRelationshipMember } from "../auth/requireRelationshipMember";
import { db } from "../db/client";
import { scrapbookPageNotes } from "../db/schema/scrapbookPageNotes";
import { scrapbookPages } from "../db/schema/scrapbookPages";
import { scrapbooks } from "../db/schema/scrapbooks";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

const NoteColorSchema = z.enum(["yellow", "pink", "blue", "purple"]);

const CreateNoteBodySchema = z.object({
  text: z.string().max(5000).default(""),
  color: NoteColorSchema.default("yellow"),
  // Normalized 0..1 within the canvas.
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
});

const PatchNoteBodySchema = z
  .object({
    text: z.string().max(5000).optional(),
    color: NoteColorSchema.optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
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

app.http("scrapbookPageNotes", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/notes",
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
        const parsed = CreateNoteBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const inserted = await db
          .insert(scrapbookPageNotes)
          .values({
            relationshipId: member.relationshipId,
            scrapbookId,
            pageId,
            text: parsed.data.text,
            color: parsed.data.color,
            x: typeof parsed.data.x === "number" ? parsed.data.x : 0.15,
            y: typeof parsed.data.y === "number" ? parsed.data.y : 0.15,
            updatedAt: new Date(),
          })
          .returning({
            id: scrapbookPageNotes.id,
            text: scrapbookPageNotes.text,
            color: scrapbookPageNotes.color,
            x: scrapbookPageNotes.x,
            y: scrapbookPageNotes.y,
            createdAt: scrapbookPageNotes.createdAt,
            updatedAt: scrapbookPageNotes.updatedAt,
          });

        const n = inserted[0]!;
        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: {
            ok: true,
            note: {
              id: n.id,
              text: n.text,
              color: n.color,
              x: n.x,
              y: n.y,
              createdAt: n.createdAt.toISOString(),
              updatedAt: n.updatedAt.toISOString(),
            },
          },
        };
      }

      // GET list
      const notes = await db
        .select({
          id: scrapbookPageNotes.id,
          text: scrapbookPageNotes.text,
          color: scrapbookPageNotes.color,
          x: scrapbookPageNotes.x,
          y: scrapbookPageNotes.y,
          createdAt: scrapbookPageNotes.createdAt,
          updatedAt: scrapbookPageNotes.updatedAt,
        })
        .from(scrapbookPageNotes)
        .where(
          and(
            eq(scrapbookPageNotes.relationshipId, member.relationshipId),
            eq(scrapbookPageNotes.scrapbookId, scrapbookId),
            eq(scrapbookPageNotes.pageId, pageId)
          )
        )
        .orderBy(asc(scrapbookPageNotes.createdAt), asc(scrapbookPageNotes.id))
        .limit(500);

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          notes: notes.map((n) => ({
            id: n.id,
            text: n.text,
            color: n.color,
            x: n.x,
            y: n.y,
            createdAt: n.createdAt.toISOString(),
            updatedAt: n.updatedAt.toISOString(),
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

app.http("scrapbookPageNotesById", {
  methods: ["PATCH", "DELETE", "OPTIONS"],
  route: "scrapbooks/{id}/pages/{pageId}/notes/{noteId}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const scrapbookId = req.params.id;
    const pageId = req.params.pageId;
    const noteId = req.params.noteId;
    if (!scrapbookId || !pageId || !noteId) {
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
          .delete(scrapbookPageNotes)
          .where(
            and(
              eq(scrapbookPageNotes.id, noteId),
              eq(scrapbookPageNotes.pageId, pageId),
              eq(scrapbookPageNotes.scrapbookId, scrapbookId),
              eq(scrapbookPageNotes.relationshipId, member.relationshipId)
            )
          )
          .returning({ id: scrapbookPageNotes.id });

        if (!deleted[0]) {
          return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
        }

        return { status: 200, headers: corsHeaders(req), jsonBody: { ok: true } };
      }

      // PATCH
      const raw = await req.json().catch(() => null);
      const parsed = PatchNoteBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const patch: Partial<typeof scrapbookPageNotes.$inferInsert> = {
        ...(typeof parsed.data.text === "string" ? { text: parsed.data.text } : {}),
        ...(typeof parsed.data.color === "string" ? { color: parsed.data.color } : {}),
        ...(typeof parsed.data.x === "number" ? { x: parsed.data.x } : {}),
        ...(typeof parsed.data.y === "number" ? { y: parsed.data.y } : {}),
        updatedAt: new Date(),
      };

      const updated = await db
        .update(scrapbookPageNotes)
        .set(patch)
        .where(
          and(
            eq(scrapbookPageNotes.id, noteId),
            eq(scrapbookPageNotes.pageId, pageId),
            eq(scrapbookPageNotes.scrapbookId, scrapbookId),
            eq(scrapbookPageNotes.relationshipId, member.relationshipId)
          )
        )
        .returning({
          id: scrapbookPageNotes.id,
          text: scrapbookPageNotes.text,
          color: scrapbookPageNotes.color,
          x: scrapbookPageNotes.x,
          y: scrapbookPageNotes.y,
          createdAt: scrapbookPageNotes.createdAt,
          updatedAt: scrapbookPageNotes.updatedAt,
        });

      const n = updated[0];
      if (!n) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          note: {
            id: n.id,
            text: n.text,
            color: n.color,
            x: n.x,
            y: n.y,
            createdAt: n.createdAt.toISOString(),
            updatedAt: n.updatedAt.toISOString(),
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
