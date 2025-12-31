import { apiFetch } from '@/api/client';

export type TimelineEntry = {
  id: string;
  // Present on GET /entries/:id (detail). Not included in timeline list responses.
  relationshipId?: string;
  title: string;
  occurredAt: string; // ISO
  body: string | null;
  createdAt: string;
  updatedAt: string;
  // Present on GET /entries/:id (detail). Not included in timeline list responses.
  media?: {
    id: string;
    blobKey: string;
    kind: string;
    width: number;
    height: number;
    createdAt: string;
    url: string;
    expiresAt?: string;
  }[];
};

export type ListEntriesResponse =
  | { ok: true; entries: TimelineEntry[]; nextCursor?: string }
  | { ok: false; error: string };

export async function listRelationshipEntries(args: {
  relationshipId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{ entries: TimelineEntry[]; nextCursor: string | null }> {
  const { relationshipId, limit = 50, cursor } = args;
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (cursor) qs.set('cursor', cursor);

  const res = await apiFetch<ListEntriesResponse>(
    `/relationships/${encodeURIComponent(relationshipId)}/entries?${qs.toString()}`
  );

  if (!('ok' in res) || !res.ok) {
    throw new Error((res as any)?.error ?? 'Failed to load entries');
  }

  return {
    entries: Array.isArray(res.entries) ? res.entries : [],
    nextCursor: typeof (res as any).nextCursor === 'string' ? (res as any).nextCursor : null,
  };
}

export type CreateEntryResponse =
  | { ok: true; entry: TimelineEntry }
  | { ok: false; error: string; details?: unknown };

export async function createRelationshipEntry(args: {
  relationshipId: string;
  title: string;
  date: string; // YYYY-MM-DD
  body?: string;
}): Promise<TimelineEntry> {
  const res = await apiFetch<CreateEntryResponse>(
    `/relationships/${encodeURIComponent(args.relationshipId)}/entries`,
    {
      method: 'POST',
      json: {
        title: args.title,
        date: args.date,
        ...(typeof args.body === 'string' && args.body.trim().length > 0 ? { body: args.body } : {}),
      },
    }
  );

  if (!('ok' in res) || !res.ok) {
    throw new Error((res as any)?.error ?? 'Failed to create entry');
  }

  return res.entry;
}

export type GetEntryResponse =
  | { ok: true; entry: TimelineEntry }
  | { ok: false; error: string };

export async function getEntryById(id: string): Promise<TimelineEntry> {
  const res = await apiFetch<GetEntryResponse>(`/entries/${encodeURIComponent(id)}`);
  if (!('ok' in res) || !res.ok) {
    throw new Error((res as any)?.error ?? 'Failed to load entry');
  }
  return res.entry;
}

export type PatchEntryResponse =
  | { ok: true; entry: TimelineEntry }
  | { ok: false; error: string; details?: unknown };

export async function updateEntry(args: {
  id: string;
  title?: string;
  date?: string; // YYYY-MM-DD
  body?: string | null;
}): Promise<TimelineEntry> {
  const json: Record<string, unknown> = {};
  if (typeof args.title === 'string') json.title = args.title;
  if (typeof args.date === 'string') json.date = args.date;
  if (typeof args.body !== 'undefined') json.body = args.body;

  const res = await apiFetch<PatchEntryResponse>(`/entries/${encodeURIComponent(args.id)}`, {
    method: 'PATCH',
    json,
  });

  if (!('ok' in res) || !res.ok) {
    throw new Error((res as any)?.error ?? 'Failed to update entry');
  }

  return res.entry;
}
