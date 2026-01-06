import { apiFetch } from '@/api/client';

export type ScrapbookCover = {
  blobKey: string;
  width: number | null;
  height: number | null;
  url: string;
  expiresAt?: string;
};

export type ScrapbookSummary = {
  id: string;
  relationshipId: string;
  title: string;
  cover: ScrapbookCover | null;
  createdAt: string;
  updatedAt: string;
};

export type ScrapbookDetails = {
  date: string | null; // YYYY-MM-DD
  place: string | null;
  placeId?: string | null;
  moodTags: string[] | null;
  review: string | null;
};

export type ListScrapbooksResponse =
  | { ok: true; scrapbooks: ScrapbookSummary[] }
  | { ok: false; error: string; details?: unknown };

export async function listScrapbooks(): Promise<ScrapbookSummary[]> {
  const res = await apiFetch<ListScrapbooksResponse>('/scrapbooks');
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load scrapbooks');
  return res.scrapbooks;
}

export type CreateScrapbookResponse =
  | {
      ok: true;
      scrapbook: {
        id: string;
        relationshipId: string;
        title: string;
        coverBlobKey: string | null;
        coverWidth: number | null;
        coverHeight: number | null;
        createdAt: string;
        updatedAt: string;
      };
    }
  | { ok: false; error: string; details?: unknown };

export async function createScrapbook(args: {
  relationshipId: string;
  title: string;
  coverBlobKey?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
}): Promise<{ id: string }> {
  const json: Record<string, unknown> = {
    relationshipId: args.relationshipId,
    title: args.title,
    ...(typeof args.coverBlobKey === 'string' && args.coverBlobKey.length > 0 ? { coverBlobKey: args.coverBlobKey } : {}),
    ...(typeof args.coverWidth === 'number' ? { coverWidth: args.coverWidth } : {}),
    ...(typeof args.coverHeight === 'number' ? { coverHeight: args.coverHeight } : {}),
  };

  const res = await apiFetch<CreateScrapbookResponse>('/scrapbooks', {
    method: 'POST',
    json,
  });

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to create scrapbook');

  return { id: res.scrapbook.id };
}

export type GetScrapbookResponse =
  | {
      ok: true;
      scrapbook: {
        id: string;
        relationshipId: string;
        title: string;
        cover: ScrapbookCover | null;
        details?: ScrapbookDetails | null;
        createdAt: string;
        updatedAt: string;
      };
    }
  | { ok: false; error: string; details?: unknown };

export async function getScrapbook(id: string) {
  const res = await apiFetch<GetScrapbookResponse>(`/scrapbooks/${encodeURIComponent(id)}`);
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load scrapbook');
  return res.scrapbook;
}

export type PatchScrapbookDetailsResponse =
  | {
      ok: true;
      scrapbook: {
        id: string;
        details: ScrapbookDetails;
        updatedAt: string;
      };
    }
  | { ok: false; error: string; details?: unknown };

export async function patchScrapbookDetails(args: {
  scrapbookId: string;
  date?: string | null; // YYYY-MM-DD (null clears)
  place?: string | null;
  placeId?: string | null;
  moodTags?: string[] | null;
  review?: string | null;
}): Promise<{ id: string; details: ScrapbookDetails; updatedAt: string }> {
  const json: Record<string, unknown> = {};
  if (typeof args.date !== 'undefined') json.date = args.date;
  if (typeof args.place !== 'undefined') json.place = args.place;
  if (typeof args.placeId !== 'undefined') json.placeId = args.placeId;
  if (typeof args.moodTags !== 'undefined') json.moodTags = args.moodTags;
  if (typeof args.review !== 'undefined') json.review = args.review;

  const res = await apiFetch<PatchScrapbookDetailsResponse>(`/scrapbooks/${encodeURIComponent(args.scrapbookId)}/details`, {
    method: 'PATCH',
    json,
  });

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to save details');
  return res.scrapbook;
}
