import type { InvocationContext } from "@azure/functions";
import { and, eq, ne, sql } from "drizzle-orm";

import type { db as DbClient } from "../db/client";
import { relationshipMembers } from "../db/schema/relationships";
import { users } from "../db/schema/users";
import { sendExpoPushNotification } from "./expoPush";

type DbConn = Pick<typeof DbClient, "select">;

type RelationshipRecipient = {
  userId: string;
  expoPushToken: string;
};

async function listActiveRelationshipRecipients(args: {
  db: DbConn;
  relationshipId: string;
  excludeUserId?: string;
}): Promise<RelationshipRecipient[]> {
  const whereBase = and(
    eq(relationshipMembers.relationshipId, args.relationshipId),
    // Treat any non-pending row as eligible.
    sql`${relationshipMembers.status} <> 'pending'`
  );

  const where = args.excludeUserId ? and(whereBase, ne(relationshipMembers.userId, args.excludeUserId)) : whereBase;

  const rows = await args.db
    .select({
      userId: relationshipMembers.userId,
      expoPushToken: users.expoPushToken,
    })
    .from(relationshipMembers)
    .innerJoin(users, eq(users.id, relationshipMembers.userId))
    .where(where);

  return rows
    .map((r) => ({ userId: r.userId, expoPushToken: r.expoPushToken ?? "" }))
    .filter((r) => r.expoPushToken.length > 0);
}

const recentPushes = new Map<string, number>();

function shouldSendWithCooldown(key: string, cooldownMs: number): boolean {
  const now = Date.now();
  const last = recentPushes.get(key);
  if (typeof last === "number" && now - last < cooldownMs) return false;
  recentPushes.set(key, now);
  return true;
}

export async function sendPushToRelationshipMembers(args: {
  db: DbConn;
  relationshipId: string;
  excludeUserId?: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  // If set, suppresses duplicate pushes for the same key for this cooldown window.
  // Key should include the kind + target id + recipient id.
  cooldown?: { key: string; ms: number };
  ctx?: InvocationContext;
}): Promise<void> {
  let recipients: RelationshipRecipient[] = [];
  try {
    recipients = await listActiveRelationshipRecipients({
      db: args.db,
      relationshipId: args.relationshipId,
      excludeUserId: args.excludeUserId,
    });
  } catch (e: unknown) {
    args.ctx?.warn?.("relationship push recipient lookup errored", e);
    return;
  }

  for (const r of recipients) {
    if (args.cooldown) {
      const scopedKey = `${args.cooldown.key}:${r.userId}`;
      if (!shouldSendWithCooldown(scopedKey, args.cooldown.ms)) continue;
    }

    const sent = await sendExpoPushNotification({
      to: r.expoPushToken,
      ...(args.title ? { title: args.title } : {}),
      body: args.body,
      ...(args.data ? { data: args.data } : {}),
    });

    if (sent.ok === false) {
      args.ctx?.warn?.("relationship push failed", { userId: r.userId, error: sent.error });
    }
  }
}
