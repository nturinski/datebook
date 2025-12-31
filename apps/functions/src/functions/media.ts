import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";

import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { requireRelationshipMember } from "../auth/requireRelationshipMember";
import { createUploadUrl } from "../lib/mediaStorage";
import { db } from "../db/client";
import { entries } from "../db/schema/entries";
import { entryMedia } from "../db/schema/entryMedia";
import { eq } from "drizzle-orm";

const UploadUrlBodySchema = z.object({
  relationshipId: z.string().uuid(),
  contentType: z.string().max(200).optional(),
});

function guessExtension(contentType?: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("heic")) return "heic";
  if (ct.includes("webp")) return "webp";
  return "jpg";
}

app.http("mediaUploadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "media/upload-url",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const raw = await req.json().catch(() => null);
      const parsed = UploadUrlBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const member = await requireRelationshipMember(req, parsed.data.relationshipId);

      const ext = guessExtension(parsed.data.contentType);
      // Relationship-scoped blob key so later attach can validate prefix.
      // NOTE: We intentionally don't include the entryId here; the upload happens before attach.
      const blobKey = `relationships/${member.relationshipId}/media/${crypto.randomUUID()}.${ext}`;

      const result = await createUploadUrl({
        blobKey,
        contentType: parsed.data.contentType,
        expiresInMinutes: 15,
      });

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, uploadUrl: result.uploadUrl, blobKey: result.blobKey, expiresAt: result.expiresAt },
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

const AttachBodySchema = z.object({
  blobKey: z.string().min(1).max(1024),
  kind: z.enum(["photo"]),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
});

app.http("entryAttachMedia", {
  methods: ["POST", "OPTIONS"],
  route: "entries/{id}/media",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const entryId = req.params.id;
    if (!entryId) {
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

      // Determine relationship via DB (never trust client relationshipId).
      const existing = await db
        .select({ relationshipId: entries.relationshipId })
        .from(entries)
        .where(eq(entries.id, entryId))
        .limit(1);

      const row = existing[0];
      if (!row) {
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Not found" } };
      }

      const member = await requireRelationshipMember(req, row.relationshipId);

      // Basic safety: blobKey must be relationship-scoped.
      const expectedPrefix = `relationships/${member.relationshipId}/`;
      if (!parsed.data.blobKey.startsWith(expectedPrefix)) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid blobKey for this relationship" },
        };
      }

      const inserted = await db
        .insert(entryMedia)
        .values({
          relationshipId: member.relationshipId,
          entryId,
          blobKey: parsed.data.blobKey,
          kind: parsed.data.kind,
          width: parsed.data.width,
          height: parsed.data.height,
        })
        .returning({
          id: entryMedia.id,
          entryId: entryMedia.entryId,
          blobKey: entryMedia.blobKey,
          kind: entryMedia.kind,
          width: entryMedia.width,
          height: entryMedia.height,
          createdAt: entryMedia.createdAt,
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
