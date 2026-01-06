import { apiFetch } from '@/api/client';

export type RelationshipMember = {
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

export type RelationshipSummary = {
  relationshipId: string;
  createdAt: string | null;
  myMembership: { role: string; status: string } | null;
  members: RelationshipMember[];
};

export type RelationshipsMineResponse =
  | { ok: true; relationships: RelationshipSummary[] }
  | { ok: false; error: string; details?: unknown };

export async function listMyRelationships(): Promise<RelationshipSummary[]> {
  const res = await apiFetch<RelationshipsMineResponse>('/relationships/mine');
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load relationships');
  return res.relationships;
}
