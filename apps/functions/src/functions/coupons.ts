import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "../auth/requireAuth";
import { requireRelationshipMember, requireRelationshipMemberFromRequest } from "../auth/requireRelationshipMember";
import { db } from "../db/client";
import { coupons, couponStatusEnum, type CouponStatus } from "../db/schema/coupons";
import { relationshipMembers } from "../db/schema/relationships";
import { users } from "../db/schema/users";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { sendExpoPushNotification } from "../lib/expoPush";

const CreateCouponBodySchema = z.object({
  relationshipId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  templateId: z.string().trim().min(1).max(200),
  // ISO datetime string. Optional.
  expiresAt: z.string().optional(),
});

const CouponIdParamSchema = z.string().uuid();

function parseIsoDateTime(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid datetime format (expected ISO 8601)");
  return d;
}

function computeEffectiveStatus(status: CouponStatus, expiresAt: Date | null, now: Date): CouponStatus {
  if (status === "ACTIVE" && expiresAt && expiresAt.getTime() < now.getTime()) return "EXPIRED";
  return status;
}

function safeCouponResponseRow(row: {
  id: string;
  relationshipId: string;
  issuerUserId: string;
  recipientUserId: string;
  title: string;
  description: string | null;
  templateId: string;
  expiresAt: Date | null;
  status: CouponStatus;
  redeemedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): typeof row {
  return row;
}

app.http("coupons", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "coupons",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      if (req.method === "POST") {
        const raw = await req.json().catch(() => null);
        const parsed = CreateCouponBodySchema.safeParse(raw);
        if (!parsed.success) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
          };
        }

        const { relationshipId, recipientUserId, title, description, templateId, expiresAt } = parsed.data;
        const member = await requireRelationshipMember(req, relationshipId);

        // Ensure the recipient is an ACTIVE member of the same relationship.
        const recipientMembership = await db
          .select({ userId: relationshipMembers.userId, status: relationshipMembers.status })
          .from(relationshipMembers)
          .where(and(eq(relationshipMembers.relationshipId, member.relationshipId), eq(relationshipMembers.userId, recipientUserId)))
          .limit(1);

        if (recipientMembership.length === 0) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Recipient is not a member of this relationship" },
          };
        }

        if ((recipientMembership[0]!.status ?? "").toLowerCase() === "pending") {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Recipient membership is pending" },
          };
        }

        const expiresAtDate = typeof expiresAt === "string" ? parseIsoDateTime(expiresAt) : null;
        const now = new Date();
        if (expiresAtDate && expiresAtDate.getTime() <= now.getTime()) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "expiresAt must be in the future" },
          };
        }

        const inserted = await db
          .insert(coupons)
          .values({
            relationshipId: member.relationshipId,
            issuerUserId: member.userId,
            recipientUserId,
            title,
            description: typeof description === "string" ? description : null,
            templateId,
            expiresAt: expiresAtDate,
            // status defaults to ACTIVE in schema/db
            updatedAt: now,
          })
          .returning({
            id: coupons.id,
            relationshipId: coupons.relationshipId,
            issuerUserId: coupons.issuerUserId,
            recipientUserId: coupons.recipientUserId,
            title: coupons.title,
            description: coupons.description,
            templateId: coupons.templateId,
            expiresAt: coupons.expiresAt,
            status: coupons.status,
            redeemedAt: coupons.redeemedAt,
            createdAt: coupons.createdAt,
            updatedAt: coupons.updatedAt,
          });

        const c = inserted[0]!;

        // Best-effort push: notify the recipient.
        try {
          const recipient = await db
            .select({ expoPushToken: users.expoPushToken })
            .from(users)
            .where(eq(users.id, recipientUserId))
            .limit(1);

          const token = recipient[0]?.expoPushToken ?? null;
          if (token) {
            const sent = await sendExpoPushNotification({
              to: token,
              body: "You received a coupon ✨",
              data: { kind: "coupon.created", couponId: c.id },
            });
            if (sent.ok === false) {
              ctx.warn("coupon create push failed", sent.error);
            }
          }
        } catch (e: unknown) {
          ctx.warn("coupon create push errored", e);
        }

        return {
          status: 201,
          headers: corsHeaders(req),
          jsonBody: { ok: true, coupon: safeCouponResponseRow(c) },
        };
      }

      // GET list
      const member = await requireRelationshipMemberFromRequest(req);

      const statusRaw = req.query.get("status") ?? undefined;
      const statusParsed = statusRaw ? z.enum(couponStatusEnum).safeParse(statusRaw) : null;
      if (statusRaw && !statusParsed?.success) {
        return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Invalid status filter" } };
      }

      const statusFilter = statusParsed?.success ? statusParsed.data : undefined;
      const now = new Date();

      // Strict authorization: must be in relationship, and must be issuer or recipient.
      // For list-by-relationship, we filter to coupons that involve the caller.
      let where = sql`${coupons.relationshipId} = ${member.relationshipId}::uuid AND (${coupons.issuerUserId} = ${member.userId}::uuid OR ${coupons.recipientUserId} = ${member.userId}::uuid)`;

      // Status filtering with computed expiration support.
      // - If filter=EXPIRED, include stored EXPIRED plus ACTIVE that are now expired.
      // - If filter=ACTIVE, exclude ACTIVE that are now expired.
      if (statusFilter === "EXPIRED") {
        where = sql`${where} AND (${coupons.status} = 'EXPIRED' OR (${coupons.status} = 'ACTIVE' AND ${coupons.expiresAt} IS NOT NULL AND ${coupons.expiresAt} < ${now}))`;
      } else if (statusFilter === "ACTIVE") {
        where = sql`${where} AND (${coupons.status} = 'ACTIVE' AND (${coupons.expiresAt} IS NULL OR ${coupons.expiresAt} >= ${now}))`;
      } else if (statusFilter) {
        where = sql`${where} AND ${coupons.status} = ${statusFilter}`;
      }

      const rows = await db
        .select({
          id: coupons.id,
          relationshipId: coupons.relationshipId,
          issuerUserId: coupons.issuerUserId,
          recipientUserId: coupons.recipientUserId,
          title: coupons.title,
          description: coupons.description,
          templateId: coupons.templateId,
          expiresAt: coupons.expiresAt,
          status: coupons.status,
          redeemedAt: coupons.redeemedAt,
          createdAt: coupons.createdAt,
          updatedAt: coupons.updatedAt,
        })
        .from(coupons)
        .where(where)
        .orderBy(desc(coupons.createdAt), desc(coupons.id));

      const mapped = rows.map((r) => {
        const effective = computeEffectiveStatus(r.status, r.expiresAt ?? null, now);
        return safeCouponResponseRow({ ...r, status: effective });
      });

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, coupons: mapped },
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

app.http("couponById", {
  methods: ["GET", "OPTIONS"],
  route: "coupons/{id}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const id = req.params.id;
    if (!id) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing coupon id" } };
    }

    const idParsed = CouponIdParamSchema.safeParse(id);
    if (!idParsed.success) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Invalid coupon id" } };
    }

    try {
      const auth = await requireAuth(req);
      const now = new Date();

      // Strict authorization: only issuer/recipient can see the coupon.
      const rows = await db
        .select({
          id: coupons.id,
          relationshipId: coupons.relationshipId,
          issuerUserId: coupons.issuerUserId,
          recipientUserId: coupons.recipientUserId,
          title: coupons.title,
          description: coupons.description,
          templateId: coupons.templateId,
          expiresAt: coupons.expiresAt,
          status: coupons.status,
          redeemedAt: coupons.redeemedAt,
          createdAt: coupons.createdAt,
          updatedAt: coupons.updatedAt,
        })
        .from(coupons)
        .where(
          and(
            eq(coupons.id, idParsed.data),
            sql`(${coupons.issuerUserId} = ${auth.userId}::uuid OR ${coupons.recipientUserId} = ${auth.userId}::uuid)`
          )
        )
        .limit(1);

      const c = rows[0];
      if (!c) {
        // 404 to avoid leaking existence.
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon not found" } };
      }

      // Ensure caller is still an active member of the relationship.
      await requireRelationshipMember(req, c.relationshipId);

      const effective = computeEffectiveStatus(c.status, c.expiresAt ?? null, now);
      const response = safeCouponResponseRow({ ...c, status: effective });

      return { status: 200, headers: corsHeaders(req), jsonBody: { ok: true, coupon: response } };
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

app.http("couponRedeem", {
  methods: ["POST", "OPTIONS"],
  route: "coupons/{id}/redeem",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const id = req.params.id;
    if (!id) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Missing coupon id" } };
    }

    const idParsed = CouponIdParamSchema.safeParse(id);
    if (!idParsed.success) {
      return { status: 400, headers: corsHeaders(req), jsonBody: { ok: false, error: "Invalid coupon id" } };
    }

    try {
      const auth = await requireAuth(req);
      const now = new Date();

      // Load coupon only if caller is the recipient (strict).
      const existingRows = await db
        .select({
          id: coupons.id,
          relationshipId: coupons.relationshipId,
          issuerUserId: coupons.issuerUserId,
          recipientUserId: coupons.recipientUserId,
          title: coupons.title,
          description: coupons.description,
          templateId: coupons.templateId,
          expiresAt: coupons.expiresAt,
          status: coupons.status,
          redeemedAt: coupons.redeemedAt,
          createdAt: coupons.createdAt,
          updatedAt: coupons.updatedAt,
        })
        .from(coupons)
        .where(and(eq(coupons.id, idParsed.data), eq(coupons.recipientUserId, auth.userId)))
        .limit(1);

      const existing = existingRows[0];
      if (!existing) {
        // 404 to avoid leaking coupon existence.
        return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon not found" } };
      }

      // Ensure the recipient is still an active member of the relationship.
      await requireRelationshipMember(req, existing.relationshipId);

      const effectiveStatus = computeEffectiveStatus(existing.status, existing.expiresAt ?? null, now);
      if (effectiveStatus === "EXPIRED") {
        return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon is expired" } };
      }
      if (existing.status === "REDEEMED") {
        return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon is already redeemed" } };
      }
      if (existing.status !== "ACTIVE") {
        return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: `Coupon is not redeemable (${existing.status})` } };
      }

      // Atomic update so redeem is idempotent-safe.
      const updated = await db
        .update(coupons)
        .set({
          status: "REDEEMED",
          redeemedAt: now,
          updatedAt: now,
        })
        .where(
          sql`${coupons.id} = ${idParsed.data}::uuid
            AND ${coupons.recipientUserId} = ${auth.userId}::uuid
            AND ${coupons.status} = 'ACTIVE'
            AND (${coupons.expiresAt} IS NULL OR ${coupons.expiresAt} >= ${now})`
        )
        .returning({
          id: coupons.id,
          relationshipId: coupons.relationshipId,
          issuerUserId: coupons.issuerUserId,
          recipientUserId: coupons.recipientUserId,
          title: coupons.title,
          description: coupons.description,
          templateId: coupons.templateId,
          expiresAt: coupons.expiresAt,
          status: coupons.status,
          redeemedAt: coupons.redeemedAt,
          createdAt: coupons.createdAt,
          updatedAt: coupons.updatedAt,
        });

      if (updated.length === 0) {
        // Something changed between read and update (already redeemed, expired, etc.).
        const reread = await db
          .select({ status: coupons.status, expiresAt: coupons.expiresAt, redeemedAt: coupons.redeemedAt })
          .from(coupons)
          .where(and(eq(coupons.id, idParsed.data), eq(coupons.recipientUserId, auth.userId)))
          .limit(1);

        const current = reread[0];
        if (!current) {
          return { status: 404, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon not found" } };
        }

        const eff = computeEffectiveStatus(current.status, current.expiresAt ?? null, now);
        if (current.status === "REDEEMED") {
          return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon is already redeemed" } };
        }
        if (eff === "EXPIRED") {
          return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon is expired" } };
        }

        return { status: 409, headers: corsHeaders(req), jsonBody: { ok: false, error: "Coupon could not be redeemed" } };
      }

      // Best-effort push: notify the issuer.
      try {
        const issuerId = updated[0]!.issuerUserId;
        const issuer = await db
          .select({ expoPushToken: users.expoPushToken })
          .from(users)
          .where(eq(users.id, issuerId))
          .limit(1);

        const token = issuer[0]?.expoPushToken ?? null;
        if (token) {
          const sent = await sendExpoPushNotification({
            to: token,
            body: "Your coupon was redeemed 💛",
            data: { kind: "coupon.redeemed", couponId: updated[0]!.id },
          });
          if (sent.ok === false) {
            ctx.warn("coupon redeem push failed", sent.error);
          }
        }
      } catch (e: unknown) {
        ctx.warn("coupon redeem push errored", e);
      }

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, coupon: safeCouponResponseRow(updated[0]!) },
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
