import { HttpRequest } from "@azure/functions";
import { and, eq } from "drizzle-orm";

import { db } from "../db/client";
import { relationshipMembers } from "../db/schema/relationships";
import { requireAuth, type AuthContext } from "./requireAuth";

export type RelationshipMemberContext = AuthContext & {
  relationshipId: string;
  role: string;
  memberStatus: string;
};

/**
 * Ensures the request is authenticated AND the authenticated user is a member
 * of the given relationship.
 */
export async function requireRelationshipMember(
  req: HttpRequest,
  relationshipId: string
): Promise<RelationshipMemberContext> {
  const auth = await requireAuth(req);

  const rows = await db
    .select({
      relationshipId: relationshipMembers.relationshipId,
      role: relationshipMembers.role,
      memberStatus: relationshipMembers.status,
    })
    .from(relationshipMembers)
    .where(and(eq(relationshipMembers.relationshipId, relationshipId), eq(relationshipMembers.userId, auth.userId)))
    .limit(1);

  const membership = rows[0];
  if (!membership) throw new Error("Not a member of this relationship");

  if (membership.memberStatus === "pending") {
    throw new Error("Relationship membership pending");
  }

  return {
    ...auth,
    relationshipId: membership.relationshipId,
    role: membership.role,
    memberStatus: membership.memberStatus,
  };
}

/**
 * Helper for endpoints that are scoped to a specific relationship.
 *
 * Rules:
 * - If ?relationshipId=<uuid> is provided, require membership in that relationship.
 * - If not provided and the user has exactly 1 active membership, use it.
 * - Otherwise, the client must specify relationshipId.
 */
export async function requireRelationshipMemberFromRequest(req: HttpRequest): Promise<RelationshipMemberContext> {
  const relationshipId = req.query.get("relationshipId") ?? undefined;

  if (relationshipId) {
    return await requireRelationshipMember(req, relationshipId);
  }

  const auth = await requireAuth(req);

  const rows = await db
    .select({
      relationshipId: relationshipMembers.relationshipId,
      role: relationshipMembers.role,
      memberStatus: relationshipMembers.status,
    })
    .from(relationshipMembers)
    .where(eq(relationshipMembers.userId, auth.userId));

  const active = rows.filter((r) => r.memberStatus !== "pending");

  if (active.length === 0) throw new Error("No relationship");
  if (active.length > 1) throw new Error("Missing relationshipId");

  return {
    ...auth,
    relationshipId: active[0]!.relationshipId,
    role: active[0]!.role,
    memberStatus: active[0]!.memberStatus,
  };
}
