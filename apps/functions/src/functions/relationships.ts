import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";

import { requireAuth } from "../auth/requireAuth";
import { db } from "../db/client";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";
import { relationships, relationshipInvites, relationshipMembers } from "../db/schema/relationships";
import { users } from "../db/schema/users";
import { requireRelationshipMember } from "../auth/requireRelationshipMember";

function randomInviteCode(): string {
  // URL-safe, short enough to type/share.
  return randomBytes(12).toString("base64url");
}

function isPgUniqueViolation(err: unknown): boolean {
  // node-postgres uses SQLSTATE error codes. 23505 = unique_violation.
  if (!err || typeof err !== "object") return false;
  if (!("code" in err)) return false;
  return (err as { code?: unknown }).code === "23505";
}

const INVITE_RETENTION_DAYS = 30;

function inviteCleanupCutoff(now: Date): Date {
  return new Date(now.getTime() - INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function getMyMemberships(userId: string) {
  return await db
    .select({
      relationshipId: relationshipMembers.relationshipId,
      role: relationshipMembers.role,
      status: relationshipMembers.status,
    })
    .from(relationshipMembers)
    .where(eq(relationshipMembers.userId, userId));
}

app.http("relationshipsMine", {
  methods: ["GET", "OPTIONS"],
  route: "relationships/mine",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const auth = await requireAuth(req);

      // Active memberships for the caller.
      const myMemberships = await db
        .select({
          relationshipId: relationshipMembers.relationshipId,
          role: relationshipMembers.role,
          status: relationshipMembers.status,
        })
        .from(relationshipMembers)
        .where(sql`${relationshipMembers.userId} = ${auth.userId}::uuid AND ${relationshipMembers.status} <> 'pending'`);

      const relationshipIds = myMemberships.map((m) => m.relationshipId);
      if (relationshipIds.length === 0) {
        return {
          status: 200,
          headers: corsHeaders(req),
          jsonBody: { ok: true, relationships: [] },
        };
      }

      const relRows = await db
        .select({
          id: relationships.id,
          createdAt: relationships.createdAt,
        })
        .from(relationships)
        .where(inArray(relationships.id, relationshipIds));

      const relMeta = new Map(relRows.map((r) => [r.id, r] as const));
      const myMeta = new Map(myMemberships.map((m) => [m.relationshipId, m] as const));

      // Fetch all members (including pending) for each relationship.
      const memberRows = await db
        .select({
          relationshipId: relationshipMembers.relationshipId,
          userId: users.id,
          email: users.email,
          role: relationshipMembers.role,
          status: relationshipMembers.status,
          createdAt: relationshipMembers.createdAt,
        })
        .from(relationshipMembers)
        .innerJoin(users, eq(relationshipMembers.userId, users.id))
        .where(inArray(relationshipMembers.relationshipId, relationshipIds));

      const membersByRelationship = new Map<
        string,
        Array<{ userId: string; email: string; role: string; status: string; createdAt: string }>
      >();

      for (const m of memberRows) {
        const list = membersByRelationship.get(m.relationshipId) ?? [];
        list.push({
          userId: m.userId,
          email: m.email,
          role: m.role,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
        });
        membersByRelationship.set(m.relationshipId, list);
      }

      const result = relationshipIds
        .map((relationshipId) => {
          const rel = relMeta.get(relationshipId);
          const mine = myMeta.get(relationshipId);
          return {
            relationshipId,
            createdAt: rel?.createdAt ? rel.createdAt.toISOString() : null,
            myMembership: mine ? { role: mine.role, status: mine.status } : null,
            members: membersByRelationship.get(relationshipId) ?? [],
          };
        })
        // stable ordering (newest first) when we have metadata
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, relationships: result },
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

app.http("relationshipsCreate", {
  methods: ["POST", "OPTIONS"],
  route: "relationships",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const auth = await requireAuth(req);

      const created = await db.transaction(async (tx) => {
        const rel = await tx
          .insert(relationships)
          .values({})
          .returning({ id: relationships.id, createdAt: relationships.createdAt });

        const relationshipId = rel[0]!.id;

        await tx.insert(relationshipMembers).values({
          relationshipId,
          userId: auth.userId,
          role: "owner",
          status: "active",
        });

        return { relationshipId, createdAt: rel[0]!.createdAt };
      });

      return {
        status: 201,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          relationship: { id: created.relationshipId, createdAt: created.createdAt },
          membership: { role: "owner", status: "active" },
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

app.http("relationshipsInvite", {
  methods: ["POST", "OPTIONS"],
  route: "relationships/invite",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const auth = await requireAuth(req);

      const InviteBodySchema = z
        .object({
          relationshipId: z.string().uuid().optional(),
          targetUserId: z.string().uuid().optional(),
          targetEmail: z.string().email().optional(),
        })
        .optional();

      const raw = await req.json().catch(() => undefined);
      const parsed = InviteBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const code = randomInviteCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const relationshipIdFromBody = parsed.data?.relationshipId;
      const targetUserId = parsed.data?.targetUserId;
      const targetEmail = parsed.data?.targetEmail;

      let relationshipId: string;
      if (relationshipIdFromBody) {
        relationshipId = relationshipIdFromBody;
      } else {
        const memberships = await getMyMemberships(auth.userId);
        const active = memberships.filter((m) => m.status !== "pending");

        if (active.length === 0) {
          return {
            status: 409,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "You must create/join a relationship first" },
          };
        }

        if (active.length > 1) {
          return {
            status: 400,
            headers: corsHeaders(req),
            jsonBody: { ok: false, error: "Missing relationshipId" },
          };
        }

        relationshipId = active[0]!.relationshipId;
      }

      // Must be an active member of the relationship you're inviting to.
      await requireRelationshipMember(req, relationshipId);

      await db.insert(relationshipInvites).values({
        code,
        relationshipId,
        createdBy: auth.userId,
        ...(targetUserId ? { targetUserId } : {}),
        ...(targetEmail ? { targetEmail } : {}),
        expiresAt,
      });

      const origin = req.headers.get("origin") ?? process.env.PUBLIC_APP_ORIGIN ?? null;
      const link = origin ? `${origin.replace(/\/$/, "")}/join/${code}` : null;

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          code,
          ...(link ? { link } : {}),
          expiresAt: expiresAt.toISOString(),
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

app.http("relationshipsInvitesPending", {
  methods: ["GET", "OPTIONS"],
  route: "relationships/invites/pending",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const auth = await requireAuth(req);
      const now = new Date();

        // For robustness, also match older invites created before we stored target_user_id.
        const userRows = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);

        const myEmail = userRows[0]?.email ?? null;

      const invites = await db
        .select({
          code: relationshipInvites.code,
          relationshipId: relationshipInvites.relationshipId,
          createdBy: relationshipInvites.createdBy,
          createdAt: relationshipInvites.createdAt,
          expiresAt: relationshipInvites.expiresAt,
        })
        .from(relationshipInvites)
        .where(
            myEmail
              ? sql`(
                  ${relationshipInvites.targetUserId} = ${auth.userId}::uuid
                  OR (
                    ${relationshipInvites.targetUserId} IS NULL
                    AND ${relationshipInvites.targetEmail} IS NOT NULL
                    AND lower(${relationshipInvites.targetEmail}) = lower(${myEmail})
                  )
                )
                AND ${relationshipInvites.redeemedAt} IS NULL
                AND ${relationshipInvites.expiresAt} > ${now}`
              : sql`${relationshipInvites.targetUserId} = ${auth.userId}::uuid AND ${relationshipInvites.redeemedAt} IS NULL AND ${relationshipInvites.expiresAt} > ${now}`
        );

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: {
          ok: true,
          invites: invites.map((i) => ({
            code: i.code,
            relationshipId: i.relationshipId,
            createdBy: i.createdBy,
            createdAt: i.createdAt.toISOString(),
            expiresAt: i.expiresAt.toISOString(),
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

const JoinBodySchema = z.object({
  code: z.string().min(6),
});

app.http("relationshipsJoin", {
  methods: ["POST", "OPTIONS"],
  route: "relationships/join",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
      const auth = await requireAuth(req);

      const raw = await req.json().catch(() => null);
      const parsed = JoinBodySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          status: 400,
          headers: corsHeaders(req),
          jsonBody: { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        };
      }

      const { code } = parsed.data;
      const now = new Date();

      const result = await db.transaction(async (tx) => {
        // Best-effort cleanup: keep the table from growing forever.
        // We remove invites that are long-expired or long-redeemed.
        const cutoff = inviteCleanupCutoff(now);
        await tx
          .delete(relationshipInvites)
          .where(sql`${relationshipInvites.expiresAt} < ${cutoff} OR ${relationshipInvites.redeemedAt} < ${cutoff}`);

        // We may need the caller email to validate email-targeted invites.
        const userRows = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);
        const myEmail = userRows[0]?.email ?? null;

        // Idempotency: if I already redeemed this invite previously, treat as success.
        const alreadyRedeemedByMe = await tx
          .select({ relationshipId: relationshipInvites.relationshipId })
          .from(relationshipInvites)
          .where(sql`${relationshipInvites.code} = ${code} AND ${relationshipInvites.redeemedBy} = ${auth.userId}::uuid`)
          .limit(1);

        if (alreadyRedeemedByMe[0]) {
          const relationshipId = alreadyRedeemedByMe[0].relationshipId;
          // Ensure membership exists (in case previous attempt committed membership but client retried).
          try {
            await tx.insert(relationshipMembers).values({
              relationshipId,
              userId: auth.userId,
              role: "member",
              status: "active",
            });
          } catch (e: unknown) {
            if (!isPgUniqueViolation(e)) throw e;
          }

          return {
            status: 200 as const,
            body: { ok: true, relationshipId, membership: { role: "member", status: "active" } },
          };
        }

        // Verify + claim the invite in a single atomic step.
        // Only one caller can successfully claim an unredeemed invite.
        const targetClause = myEmail
          ? sql`(
              (${relationshipInvites.targetUserId} IS NULL AND ${relationshipInvites.targetEmail} IS NULL)
              OR ${relationshipInvites.targetUserId} = ${auth.userId}::uuid
              OR (
                ${relationshipInvites.targetUserId} IS NULL
                AND ${relationshipInvites.targetEmail} IS NOT NULL
                AND lower(${relationshipInvites.targetEmail}) = lower(${myEmail})
              )
            )`
          : sql`(
              (${relationshipInvites.targetUserId} IS NULL AND ${relationshipInvites.targetEmail} IS NULL)
              OR ${relationshipInvites.targetUserId} = ${auth.userId}::uuid
            )`;

        const claimed = await tx
          .update(relationshipInvites)
          .set({ redeemedBy: auth.userId, redeemedAt: now })
          .where(
            sql`${relationshipInvites.code} = ${code}
              AND ${relationshipInvites.redeemedAt} IS NULL
              AND ${relationshipInvites.expiresAt} > ${now}
              AND ${targetClause}`
          )
          .returning({ relationshipId: relationshipInvites.relationshipId });

        if (claimed.length === 0) {
          // Determine why we couldn't claim it (not found / expired / redeemed / not intended).
          const invites = await tx
            .select({
              relationshipId: relationshipInvites.relationshipId,
              expiresAt: relationshipInvites.expiresAt,
              redeemedAt: relationshipInvites.redeemedAt,
              redeemedBy: relationshipInvites.redeemedBy,
              targetUserId: relationshipInvites.targetUserId,
              targetEmail: relationshipInvites.targetEmail,
            })
            .from(relationshipInvites)
            .where(eq(relationshipInvites.code, code))
            .limit(1);

          const invite = invites[0];
          if (!invite) return { status: 404 as const, body: { ok: false, error: "Invite not found" } };

          if (invite.redeemedAt) return { status: 409 as const, body: { ok: false, error: "Invite already redeemed" } };
          if (invite.expiresAt.getTime() <= now.getTime()) {
            return { status: 410 as const, body: { ok: false, error: "Invite expired" } };
          }

          // Not redeemed, not expired, but failed the target check.
          const targetsNobody = !invite.targetUserId && !invite.targetEmail;
          const matchesTargetUser = invite.targetUserId === auth.userId;
          const matchesTargetEmail =
            myEmail && invite.targetEmail ? invite.targetEmail.toLowerCase() === myEmail.toLowerCase() : false;
          if (!targetsNobody && !matchesTargetUser && !matchesTargetEmail) {
            return { status: 403 as const, body: { ok: false, error: "Invite is not intended for this user" } };
          }

          return { status: 409 as const, body: { ok: false, error: "Invite could not be redeemed" } };
        }

        const relationshipId = claimed[0]!.relationshipId;

        // Insert membership in the same transaction.
        // If the caller already has membership, treat as idempotent.
        try {
          await tx.insert(relationshipMembers).values({
            relationshipId,
            userId: auth.userId,
            role: "member",
            status: "active",
          });
        } catch (e: unknown) {
          if (!isPgUniqueViolation(e)) throw e;
        }

        return {
          status: 200 as const,
          body: { ok: true, relationshipId, membership: { role: "member", status: "active" } },
        };
      });

      return {
        status: result.status,
        headers: corsHeaders(req),
        jsonBody: result.body,
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

app.http("relationshipsLeave", {
  methods: ["POST", "OPTIONS"],
  route: "relationships/{relationshipId}/leave",
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

      const result = await db.transaction(async (tx) => {
        // Remove my membership.
        await tx
          .delete(relationshipMembers)
          .where(and(eq(relationshipMembers.relationshipId, member.relationshipId), eq(relationshipMembers.userId, member.userId)));

        // Optional cleanup: if no members remain, delete the relationship.
        const remaining = await tx
          .select({ userId: relationshipMembers.userId })
          .from(relationshipMembers)
          .where(eq(relationshipMembers.relationshipId, member.relationshipId))
          .limit(1);

        const deletedRelationship = remaining.length === 0;
        if (deletedRelationship) {
          await tx.delete(relationships).where(eq(relationships.id, member.relationshipId));
        }

        return { deletedRelationship };
      });

      return {
        status: 200,
        headers: corsHeaders(req),
        jsonBody: { ok: true, relationshipId: member.relationshipId, ...result },
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
