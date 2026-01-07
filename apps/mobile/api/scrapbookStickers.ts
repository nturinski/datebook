import { apiFetch } from '@/api/client';

export type ScrapbookStickerKind =
  | 'heart'
  | 'star'
  | 'smile'
  | 'sparkle'
  | 'flower'
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'rainbow'
  | 'check'
  | 'music'
  | 'coffee'
  | 'camera'
  | 'balloon'
  | 'gift'
  | 'party'
  | 'tape'
  | 'thumbsUp'
  | 'fire'
  | 'leaf';

export type ScrapbookPageSticker = {
  id: string;
  createdByUserId: string;
  kind: ScrapbookStickerKind;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  createdAt: string;
  updatedAt: string;
};

export type ListScrapbookPageStickersResponse =
  | { ok: true; stickers: ScrapbookPageSticker[] }
  | { ok: false; error: string; details?: unknown };

export async function listScrapbookPageStickers(args: {
  scrapbookId: string;
  pageId: string;
}): Promise<ScrapbookPageSticker[]> {
  const res = await apiFetch<ListScrapbookPageStickersResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/stickers`
  );
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load stickers');
  return res.stickers;
}

export type CreateScrapbookPageStickerResponse =
  | { ok: true; sticker: ScrapbookPageSticker }
  | { ok: false; error: string; details?: unknown };

export async function createScrapbookPageSticker(args: {
  scrapbookId: string;
  pageId: string;
  kind: ScrapbookStickerKind;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}): Promise<ScrapbookPageSticker> {
  const res = await apiFetch<CreateScrapbookPageStickerResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/stickers`,
    {
      method: 'POST',
      json: {
        kind: args.kind,
        ...(typeof args.x === 'number' ? { x: args.x } : {}),
        ...(typeof args.y === 'number' ? { y: args.y } : {}),
        ...(typeof args.scale === 'number' ? { scale: args.scale } : {}),
        ...(typeof args.rotation === 'number' ? { rotation: args.rotation } : {}),
      },
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to create sticker');
  return res.sticker;
}

export type PatchScrapbookPageStickerResponse =
  | { ok: true; sticker: ScrapbookPageSticker }
  | { ok: false; error: string; details?: unknown };

export async function patchScrapbookPageSticker(args: {
  scrapbookId: string;
  pageId: string;
  stickerId: string;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}): Promise<ScrapbookPageSticker> {
  const json: Record<string, unknown> = {
    ...(typeof args.x === 'number' ? { x: args.x } : {}),
    ...(typeof args.y === 'number' ? { y: args.y } : {}),
    ...(typeof args.scale === 'number' ? { scale: args.scale } : {}),
    ...(typeof args.rotation === 'number' ? { rotation: args.rotation } : {}),
  };

  const res = await apiFetch<PatchScrapbookPageStickerResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/stickers/${encodeURIComponent(args.stickerId)}`,
    {
      method: 'PATCH',
      json,
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to update sticker');
  return res.sticker;
}

export type DeleteScrapbookPageStickerResponse = { ok: true } | { ok: false; error: string; details?: unknown };

export async function deleteScrapbookPageSticker(args: {
  scrapbookId: string;
  pageId: string;
  stickerId: string;
}): Promise<void> {
  const res = await apiFetch<DeleteScrapbookPageStickerResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/stickers/${encodeURIComponent(args.stickerId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to delete sticker');
}
