import { apiFetch } from '@/api/client';

export type ScrapbookPageMedia = {
  id: string;
  kind: 'photo' | string;
  blobKey: string;
  createdByUserId: string;
  url?: string;
  expiresAt?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  createdAt: string;
};

export type ScrapbookPage = {
  id: string;
  pageIndex: number;
  details?: {
    date: string | null; // YYYY-MM-DD
    place: string | null;
    placeId?: string | null;
    moodTags: string[] | null;
    review: string | null;
  };
  media: ScrapbookPageMedia[];
  createdAt: string;
  updatedAt: string;
};

export type ListScrapbookPagesResponse =
  | { ok: true; pages: ScrapbookPage[] }
  | { ok: false; error: string; details?: unknown };

export async function listScrapbookPages(scrapbookId: string): Promise<ScrapbookPage[]> {
  const res = await apiFetch<ListScrapbookPagesResponse>(`/scrapbooks/${encodeURIComponent(scrapbookId)}/pages`);
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load scrapbook pages');
  return res.pages;
}

export type CreateScrapbookPageResponse =
  | { ok: true; page: ScrapbookPage }
  | { ok: false; error: string; details?: unknown };

export async function createScrapbookPage(scrapbookId: string): Promise<ScrapbookPage> {
  const res = await apiFetch<CreateScrapbookPageResponse>(`/scrapbooks/${encodeURIComponent(scrapbookId)}/pages`, {
    method: 'POST',
    json: {},
  });
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to create page');
  return res.page;
}

export type AttachScrapbookPageMediaResponse =
  | {
      ok: true;
      media: {
        id: string;
        pageId: string;
        blobKey: string;
        kind: string;
        width: number;
        height: number;
        createdAt: string;
      };
    }
  | { ok: false; error: string; details?: unknown };

export async function attachScrapbookPageMedia(args: {
  scrapbookId: string;
  pageId: string;
  blobKey: string;
  kind: 'photo';
  width: number;
  height: number;
}): Promise<{ id: string }> {
  const res = await apiFetch<AttachScrapbookPageMediaResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/media`,
    {
      method: 'POST',
      json: {
        blobKey: args.blobKey,
        kind: args.kind,
        width: args.width,
        height: args.height,
      },
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to attach media');

  return { id: res.media.id };
}

export type UpdateScrapbookPageMediaPositionResponse =
  | { ok: true; media: { id: string; pageId: string; x: number; y: number; scale: number } }
  | { ok: false; error: string; details?: unknown };

export async function updateScrapbookPageMediaPosition(args: {
  scrapbookId: string;
  pageId: string;
  mediaId: string;
  x: number;
  y: number;
  scale?: number;
}): Promise<void> {
  const json: Record<string, unknown> = {
    x: args.x,
    y: args.y,
    ...(typeof args.scale === 'number' ? { scale: args.scale } : {}),
  };

  const res = await apiFetch<UpdateScrapbookPageMediaPositionResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/media/${encodeURIComponent(args.mediaId)}`,
    {
      method: 'PATCH',
      json,
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to save photo transform');
}

export type PatchScrapbookPageDetailsResponse =
  | {
      ok: true;
      page: {
        id: string;
        pageIndex: number;
        details: {
          date: string | null;
          place: string | null;
          placeId?: string | null;
          moodTags: string[] | null;
          review: string | null;
        };
        updatedAt: string;
      };
    }
  | { ok: false; error: string; details?: unknown };

export async function patchScrapbookPageDetails(args: {
  scrapbookId: string;
  pageId: string;
  date?: string | null; // YYYY-MM-DD (null clears)
  place?: string | null;
  placeId?: string | null;
  moodTags?: string[] | null;
  review?: string | null;
}): Promise<{
  id: string;
  pageIndex: number;
  details: {
    date: string | null;
    place: string | null;
    placeId?: string | null;
    moodTags: string[] | null;
    review: string | null;
  };
  updatedAt: string;
}> {
  const json: Record<string, unknown> = {};
  if (typeof args.date !== 'undefined') json.date = args.date;
  if (typeof args.place !== 'undefined') json.place = args.place;
  if (typeof args.placeId !== 'undefined') json.placeId = args.placeId;
  if (typeof args.moodTags !== 'undefined') json.moodTags = args.moodTags;
  if (typeof args.review !== 'undefined') json.review = args.review;

  const res = await apiFetch<PatchScrapbookPageDetailsResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/details`,
    {
      method: 'PATCH',
      json,
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to save details');
  return res.page;
}
