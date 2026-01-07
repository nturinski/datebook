import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

const expo = new Expo();

export async function sendExpoPushNotification(args: {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = args.to;
  if (!token) return { ok: false, error: "Missing push token" };
  if (!Expo.isExpoPushToken(token)) return { ok: false, error: "Invalid Expo push token" };

  const msg: ExpoPushMessage = {
    to: token,
    sound: "default",
    title: args.title ?? "Datebook",
    body: args.body,
    ...(args.data ? { data: args.data } : {}),
  };

  try {
    const chunks = expo.chunkPushNotifications([msg]);
    for (const chunk of chunks) {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
      for (const t of tickets) {
        if (t.status === "error") {
          return { ok: false, error: t.message ?? "Expo push error" };
        }
      }
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
