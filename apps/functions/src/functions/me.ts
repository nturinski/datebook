import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../auth/requireAuth";
import { db } from "../db/client";
import { users } from "../db/schema/users";
import { relationshipInvites, relationshipMembers } from "../db/schema/relationships";
import { corsHeaders, handleCorsPreflight } from "../lib/cors";

type RelationshipStatus = "none" | "pending" | "active";

type MeResponse = {
  ok: true;
  user: { id: string; email: string };
  memberships: Array<{
    relationshipId: string;
    role: string;
    memberStatus: string;
    status: Exclude<RelationshipStatus, "none">;
  }>;
  relationships: Array<{
    relationshipId: string;
    role: string;
    memberStatus: string;
    status: Exclude<RelationshipStatus, "none">;
  }>;
  pendingInviteCount?: number;
  relationship:
    | { status: "none" }
    | {
        status: Exclude<RelationshipStatus, "none">;
        relationshipId: string;
        role: string;
        memberStatus: string;
      };
};

export async function me(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAuth(req);

    const row = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    const me = row[0];
    if (!me) {
      return {
        status: 404,
        headers: corsHeaders(req),
        jsonBody: { ok: false, error: "User not found" },
      };
    }

    const memberships = await db
      .select({
        relationshipId: relationshipMembers.relationshipId,
        role: relationshipMembers.role,
        memberStatus: relationshipMembers.status,
      })
      .from(relationshipMembers)
      .where(eq(relationshipMembers.userId, auth.userId))
      ;

    const relationshipList = memberships.map((m) => ({
      relationshipId: m.relationshipId,
      role: m.role,
      memberStatus: m.memberStatus,
      status: (m.memberStatus === "pending" ? "pending" : "active") as Exclude<RelationshipStatus, "none">,
    }));

    // Optional: pending invite count so clients can route correctly at boot.
    // Includes both targeted-by-userId invites and legacy targeted-by-email invites.
    const now = new Date();
    const pendingCountRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(relationshipInvites)
      .where(
        sql`${relationshipInvites.redeemedAt} IS NULL
          AND ${relationshipInvites.expiresAt} > ${now}
          AND (
            ${relationshipInvites.targetUserId} = ${auth.userId}::uuid
            OR (
              ${relationshipInvites.targetUserId} IS NULL
              AND ${relationshipInvites.targetEmail} IS NOT NULL
              AND lower(${relationshipInvites.targetEmail}) = lower(${me.email})
            )
          )`
      );

    const pendingInviteCount = Number(pendingCountRows[0]?.count ?? 0);

    // Back-compat: keep a single relationship field for older clients.
    // Prefer an active membership when present.
    const preferred = relationshipList.find((r) => r.status === "active") ?? relationshipList[0] ?? null;

    const relationship =
      !preferred
        ? ({ status: "none" } as const)
        : ({
            status: preferred.status,
            relationshipId: preferred.relationshipId,
            role: preferred.role,
            memberStatus: preferred.memberStatus,
          } as const);

    const response: MeResponse = {
      ok: true,
      user: { id: me.id, email: me.email },
      memberships: relationshipList,
      relationships: relationshipList,
      pendingInviteCount,
      relationship,
    };

    return {
      status: 200,
      headers: corsHeaders(req),
      jsonBody: response,
    };
  } catch (e: unknown) {
    ctx.error(e);
    return {
      status: 401,
      headers: corsHeaders(req),
      jsonBody: { ok: false, error: e instanceof Error ? e.message : "Unauthorized" },
    };
  }
}

app.http("me", {
  methods: ["GET", "OPTIONS"],
  route: "me",
  authLevel: "anonymous",
  handler: me,
});
