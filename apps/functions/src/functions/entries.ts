import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import { entries } from "../db/schema/entries";
import { entryEdits } from "../db/schema/entryEdits";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { requireRelationshipMember, requireRelationshipMemberFromRequest } from "../auth/requireRelationshipMember";
import { requireAuth } from "../auth/requireAuth";

function parseIsoDateOnly(value: string): Date {
  // Accept YYYY-MM-DD and treat it as a date-only value.
  // Postgres DATE is timezone-less; using a UTC midnight Date is fine.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date format (expected YYYY-MM-DD)");
  return new Date(`${value}T00:00:00.000Z`);
}

function parseIsoDateTime(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime format (expected ISO 8601)");
  return d;
}

const CreateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    // New (preferred): ISO datetime string
    occurredAt: z.string().optional(),
    // Legacy compatibility: YYYY-MM-DD
    date: z.string().min(10).optional(),
    body: z.string().max(10_000).optional(),
  })
  .refine((v) => typeof v.occurredAt === "string" || typeof v.date === "string", {
    message: "Provide occurredAt (preferred) or date (legacy)",
  });

const TimelineCursorSchema = z.object({
  occurredAt: z.string(),
  createdAt: z.string(),
  id: z.string().uuid(),
});

function encodeCursor(cursor: z.infer<typeof TimelineCursorSchema>): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): z.infer<typeof TimelineCursorSchema> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor");
  }

  const parsed = TimelineCursorSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error("Invalid cursor");
  return parsed.data;
}

app.http("relationshipEntries", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "relationships/{relationshipId}/entries",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const relationshipId = req.params.relationshipId;
    if (!relationshipId) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing relationshipId" } };
    }

    try {
      const member = await requireRelationshipMember(req, relationshipId);

      if (req.method === "POST") {
        const raw = await req.json().catch(() => null);
        const parsed = CreateBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const occurredAt =
          typeof parsed.data.occurredAt === "string"
            ? parseIsoDateTime(parsed.data.occurredAt)
            : parseIsoDateOnly(parsed.data.date!);

        const inserted = await db
          .insert(entries)
          .values({
            relationshipId: member.relationshipId,
            createdByUserId: member.userId,
            title: parsed.data.title,
            occurredAt,
            body: typeof parsed.data.body === "string" ? parsed.data.body : null,
          })
          .returning({
            id: entries.id,
            title: entries.title,
            occurredAt: entries.occurredAt,
            body: entries.body,
            createdAt: entries.createdAt,
            updatedAt: entries.updatedAt,
          });

        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: { ok: true, entry: inserted[0] },
        };
      }

      // GET timeline list (keyset pagination)
      const limitRaw = req.query.get("limit");
      const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 200) : 50;

      const cursorRaw = req.query.get("cursor") ?? undefined;
      const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

      const where = cursor
        ? sql`${entries.relationshipId} = ${member.relationshipId}::uuid AND (${entries.occurredAt}, ${entries.createdAt}, ${entries.id}) < (${cursor.occurredAt}::timestamptz, ${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
        : eq(entries.relationshipId, member.relationshipId);

      const rows = await db
        .select({
          id: entries.id,
          title: entries.title,
          occurredAt: entries.occurredAt,
          body: entries.body,
          createdAt: entries.createdAt,
          updatedAt: entries.updatedAt,
        })
        .from(entries)
        .where(where)
        .orderBy(desc(entries.occurredAt), desc(entries.createdAt), desc(entries.id))
        .limit(limit);

      const last = rows.length > 0 ? rows[rows.length - 1]! : null;
      const nextCursor =
        last && rows.length === limit
          ? encodeCursor({
              occurredAt: last.occurredAt.toISOString(),
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null;

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, entries: rows, ...(nextCursor ? { nextCursor } : {}) },
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

app.http("entries", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "entries",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      // Legacy endpoint: relationship can be selected via ?relationshipId=, or inferred if user has exactly one.
      const member = await requireRelationshipMemberFromRequest(req);

      if (req.method === "POST") {
        const raw = await req.json().catch(() => null);
        const parsed = CreateBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const occurredAt =
          typeof parsed.data.occurredAt === "string"
            ? parseIsoDateTime(parsed.data.occurredAt)
            : parseIsoDateOnly(parsed.data.date!);

        const inserted = await db
          .insert(entries)
          .values({
            relationshipId: member.relationshipId,
            createdByUserId: member.userId,
            title: parsed.data.title,
            occurredAt,
            body: typeof parsed.data.body === "string" ? parsed.data.body : null,
          })
          .returning({
            id: entries.id,
            title: entries.title,
            occurredAt: entries.occurredAt,
            body: entries.body,
            createdAt: entries.createdAt,
            updatedAt: entries.updatedAt,
          });

        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: { ok: true, entry: inserted[0] },
        };
      }

      // Default: GET timeline list
      const limitRaw = req.query.get("limit");
      const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 200) : 50;

      const rows = await db
        .select({
          id: entries.id,
          title: entries.title,
          occurredAt: entries.occurredAt,
          body: entries.body,
          createdAt: entries.createdAt,
          updatedAt: entries.updatedAt,
        })
        .from(entries)
        .where(eq(entries.relationshipId, member.relationshipId))
        .orderBy(desc(entries.occurredAt), desc(entries.createdAt))
        .limit(limit);

      return { status: 200, headers: corsHeaders(req), jsonBody: { ok: true, entries: rows } };
    } catch (e: unknown) {
      ctx.error(e);
      const msg = e instanceof Error ? e.message : "Unauthorized";
      const status = msg === "No relationship" ? 409 : msg === "Missing relationshipId" ? 400 : 401;
      return { status, headers: corsHeaders(req), jsonBody: { ok: false, error: msg } };
    }
  },
});

const PatchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    occurredAt: z.string().optional(),
    // Legacy compatibility
    date: z.string().min(10).optional(),
    body: z.string().max(10_000).nullable().optional(),
  })
  .refine(
    (v) =>
      typeof v.title === "string" ||
      typeof v.occurredAt === "string" ||
      typeof v.date === "string" ||
      typeof v.body !== "undefined",
    {
    message: "Provide at least one field to update",
    }
  );

app.http("entryById", {
  methods: ["GET", "PATCH", "OPTIONS"],
  route: "entries/{id}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const id = req.params.id;
      if (!id) {
        return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing id" } };
      }

      // Auth first (avoid leaking data to unauthenticated callers)
      await requireAuth(req);

      // Never trust relationshipId from the client; determine relationship via DB.
      const existingRows = await db
        .select({
          relationshipId: entries.relationshipId,
          title: entries.title,
          occurredAt: entries.occurredAt,
          body: entries.body,
          createdAt: entries.createdAt,
          updatedAt: entries.updatedAt,
        })
        .from(entries)
        .where(eq(entries.id, id))
        .limit(1);

      const existing = existingRows[0];
      if (!existing) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      const member = await requireRelationshipMember(req, existing.relationshipId);

      if (req.method === "PATCH") {
        const raw = await req.json().catch(() => null);
        const parsed = PatchBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const patch: Partial<typeof entries.$inferInsert> = {
          updatedAt: new Date(),
        };

        if (typeof parsed.data.title === "string") patch.title = parsed.data.title;
        if (typeof parsed.data.occurredAt === "string") patch.occurredAt = parseIsoDateTime(parsed.data.occurredAt);
        else if (typeof parsed.data.date === "string") patch.occurredAt = parseIsoDateOnly(parsed.data.date);

        if (typeof parsed.data.body !== "undefined") patch.body = parsed.data.body;

        const entry = await db.transaction(async (tx) => {
          const updated = await tx
            .update(entries)
            .set(patch)
            .where(and(eq(entries.id, id), eq(entries.relationshipId, member.relationshipId)))
            .returning({
              id: entries.id,
              title: entries.title,
              occurredAt: entries.occurredAt,
              body: entries.body,
              createdAt: entries.createdAt,
              updatedAt: entries.updatedAt,
            });

          const next = updated[0] ?? null;
          if (!next) return null;

          // Best-effort audit trail
          await tx.insert(entryEdits).values({
            entryId: next.id,
            editedByUserId: member.userId,
            previousTitle: existing.title,
            previousBody: existing.body,
            previousOccurredAt: existing.occurredAt,
            newTitle: next.title,
            newBody: next.body,
            newOccurredAt: next.occurredAt,
          });

          return next;
        });

        if (!entry) return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };

        return { status: 200, headers: corsHeaders(req), jsonBody: { ok: true, entry } };
      }

      // Default: GET by id
      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          entry: {
            id,
            relationshipId: existing.relationshipId,
            title: existing.title,
            occurredAt: existing.occurredAt,
            body: existing.body,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
        },
      };
    } catch (e: unknown) {
      ctx.error(e);
      const msg = e instanceof Error ? e.message : "Unauthorized";
      const status = 401;
      return { status, headers: corsHeaders(req), jsonBody: { ok: false, error: msg } };
    }
  },
});
