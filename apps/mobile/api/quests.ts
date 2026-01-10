import { apiFetch } from '@/api/client';

export type Quest = {
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  periodEnd: string;
};

export type ListQuestsResponse =
  | { ok: true; weekly: Quest; monthly: Quest }
  | { ok: false; error: string; details?: unknown };

export async function listQuests(args: { relationshipId: string }): Promise<{ weekly: Quest; monthly: Quest }> {
  const qs = new URLSearchParams({ relationshipId: args.relationshipId });
  const res = await apiFetch<ListQuestsResponse>(`/quests?${qs.toString()}`);

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load quests');
  return { weekly: res.weekly, monthly: res.monthly };
}
