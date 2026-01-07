import { apiFetch } from '@/api/client';

type RegisterPushTokenResponse =
  | { ok: true }
  | { ok: false; error: string; details?: unknown };

export async function registerPushToken(token: string | null): Promise<void> {
  const res = await apiFetch<RegisterPushTokenResponse>('/push-tokens/register', {
    method: 'POST',
    json: { token },
  });

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to register push token');
}
