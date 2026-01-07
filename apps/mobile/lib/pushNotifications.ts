import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { registerPushToken } from '@/api/pushTokens';

let configured = false;

export function configureForegroundNotificationsOnce() {
  if (configured) return;
  configured = true;

  // When app is open, still show the push as an alert so it feels like “it worked”.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function tryGetExpoProjectId(): string | undefined {
  // EAS-managed project id is the recommended way for getExpoPushTokenAsync.
  // Works for both dev clients and production builds.
  const easProjectId = (Constants as any)?.easConfig?.projectId as string | undefined;
  const extraProjectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId as string | undefined;
  return easProjectId ?? extraProjectId;
}

export async function ensurePushTokenRegistered(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted'
        ? 'granted'
        : (await Notifications.requestPermissionsAsync()).status;

    if (status !== 'granted') return;

    const projectId = tryGetExpoProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const token = tokenResponse?.data ?? null;
    if (!token) return;

    await registerPushToken(token);
  } catch {
    // best-effort: do not block UI
  }
}
