import type { InvocationContext } from "@azure/functions";
import { eq } from "drizzle-orm";

import type { db as DbClient } from "../db/client";
import { users } from "../db/schema/users";
import { sendExpoPushNotification } from "./expoPush";
import { sendPushToRelationshipMembers } from "./relationshipPush";

type DbConn = Pick<typeof DbClient, "select">;

export async function sendQuestCompletedPush(args: {
  db: DbConn;
  userId: string;
  relationshipId: string;
  questTemplateId?: string;
  ctx?: InvocationContext;
}): Promise<void> {
  try {
    const row = await args.db
      .select({ expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.id, args.userId))
      .limit(1);

    const token = row[0]?.expoPushToken ?? null;
    if (!token) return;

    const sent = await sendExpoPushNotification({
      to: token,
      body: "You completed a shared quest ✨",
      data: {
        kind: "quest.completed",
        relationshipId: args.relationshipId,
        ...(args.questTemplateId ? { questTemplateId: args.questTemplateId } : {}),
      },
    });

    if (sent.ok === false) {
      args.ctx?.warn?.("quest completion push failed", sent.error);
    }
  } catch (e: unknown) {
    args.ctx?.warn?.("quest completion push errored", e);
  }
}

export async function sendQuestCompletedPushToRelationship(args: {
  db: DbConn;
  relationshipId: string;
  questTemplateId?: string;
  ctx?: InvocationContext;
}): Promise<void> {
  await sendPushToRelationshipMembers({
    db: args.db,
    relationshipId: args.relationshipId,
    body: "Shared quest completed ✨",
    data: {
      kind: "quest.completed",
      relationshipId: args.relationshipId,
      ...(args.questTemplateId ? { questTemplateId: args.questTemplateId } : {}),
    },
    // If a quest-completion is triggered by multiple events in quick succession,
    // avoid spamming: allow one push per recipient per questTemplateId per 5 minutes.
    cooldown: { key: `quest.completed:${args.relationshipId}:${args.questTemplateId ?? "unknown"}`, ms: 5 * 60 * 1000 },
    ctx: args.ctx,
  });
}
