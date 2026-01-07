import { apiFetch } from '@/api/client';

export type ScrapbookTextFont = 'hand' | 'script' | 'marker' | 'print' | 'justAnotherHand';

export type ScrapbookPageText = {
  id: string;
  createdByUserId: string;
  text: string;
  font: ScrapbookTextFont;
  color: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  createdAt: string;
  updatedAt: string;
};

export type ListScrapbookPageTextsResponse =
  | { ok: true; texts: ScrapbookPageText[] }
  | { ok: false; error: string; details?: unknown };

export async function listScrapbookPageTexts(args: {
  scrapbookId: string;
  pageId: string;
}): Promise<ScrapbookPageText[]> {
  const res = await apiFetch<ListScrapbookPageTextsResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/texts`
  );
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load text');
  return res.texts;
}

export type CreateScrapbookPageTextResponse =
  | { ok: true; text: ScrapbookPageText }
  | { ok: false; error: string; details?: unknown };

export async function createScrapbookPageText(args: {
  scrapbookId: string;
  pageId: string;
  text?: string;
  font?: ScrapbookTextFont;
  color?: string;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}): Promise<ScrapbookPageText> {
  const res = await apiFetch<CreateScrapbookPageTextResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/texts`,
    {
      method: 'POST',
      json: {
        ...(typeof args.text === 'string' ? { text: args.text } : {}),
        ...(typeof args.font === 'string' ? { font: args.font } : {}),
        ...(typeof args.color === 'string' ? { color: args.color } : {}),
        ...(typeof args.x === 'number' ? { x: args.x } : {}),
        ...(typeof args.y === 'number' ? { y: args.y } : {}),
        ...(typeof args.scale === 'number' ? { scale: args.scale } : {}),
        ...(typeof args.rotation === 'number' ? { rotation: args.rotation } : {}),
      },
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to create text');
  return res.text;
}

export type PatchScrapbookPageTextResponse =
  | { ok: true; text: ScrapbookPageText }
  | { ok: false; error: string; details?: unknown };

export async function patchScrapbookPageText(args: {
  scrapbookId: string;
  pageId: string;
  textId: string;
  text?: string;
  font?: ScrapbookTextFont;
  color?: string;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}): Promise<ScrapbookPageText> {
  const json: Record<string, unknown> = {
    ...(typeof args.text === 'string' ? { text: args.text } : {}),
    ...(typeof args.font === 'string' ? { font: args.font } : {}),
    ...(typeof args.color === 'string' ? { color: args.color } : {}),
    ...(typeof args.x === 'number' ? { x: args.x } : {}),
    ...(typeof args.y === 'number' ? { y: args.y } : {}),
    ...(typeof args.scale === 'number' ? { scale: args.scale } : {}),
    ...(typeof args.rotation === 'number' ? { rotation: args.rotation } : {}),
  };

  const res = await apiFetch<PatchScrapbookPageTextResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/texts/${encodeURIComponent(args.textId)}`,
    {
      method: 'PATCH',
      json,
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to update text');
  return res.text;
}

export type DeleteScrapbookPageTextResponse = { ok: true } | { ok: false; error: string; details?: unknown };

export async function deleteScrapbookPageText(args: {
  scrapbookId: string;
  pageId: string;
  textId: string;
}): Promise<void> {
  const res = await apiFetch<DeleteScrapbookPageTextResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/texts/${encodeURIComponent(args.textId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to delete text');
}
