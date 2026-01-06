import { apiFetch } from '@/api/client';

export type ScrapbookNoteColor = 'yellow' | 'pink' | 'blue' | 'purple';

export type ScrapbookPageNote = {
  id: string;
  text: string;
  color: ScrapbookNoteColor;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
};

export type ListScrapbookPageNotesResponse =
  | { ok: true; notes: ScrapbookPageNote[] }
  | { ok: false; error: string; details?: unknown };

export async function listScrapbookPageNotes(args: {
  scrapbookId: string;
  pageId: string;
}): Promise<ScrapbookPageNote[]> {
  const res = await apiFetch<ListScrapbookPageNotesResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/notes`
  );
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load notes');
  return res.notes;
}

export type CreateScrapbookPageNoteResponse =
  | { ok: true; note: ScrapbookPageNote }
  | { ok: false; error: string; details?: unknown };

export async function createScrapbookPageNote(args: {
  scrapbookId: string;
  pageId: string;
  text?: string;
  color?: ScrapbookNoteColor;
  x?: number;
  y?: number;
}): Promise<ScrapbookPageNote> {
  const res = await apiFetch<CreateScrapbookPageNoteResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/notes`,
    {
      method: 'POST',
      json: {
        text: typeof args.text === 'string' ? args.text : '',
        color: typeof args.color === 'string' ? args.color : 'yellow',
        ...(typeof args.x === 'number' ? { x: args.x } : {}),
        ...(typeof args.y === 'number' ? { y: args.y } : {}),
      },
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to create note');
  return res.note;
}

export type PatchScrapbookPageNoteResponse =
  | { ok: true; note: ScrapbookPageNote }
  | { ok: false; error: string; details?: unknown };

export async function patchScrapbookPageNote(args: {
  scrapbookId: string;
  pageId: string;
  noteId: string;
  text?: string;
  color?: ScrapbookNoteColor;
  x?: number;
  y?: number;
}): Promise<ScrapbookPageNote> {
  const json: Record<string, unknown> = {
    ...(typeof args.text === 'string' ? { text: args.text } : {}),
    ...(typeof args.color === 'string' ? { color: args.color } : {}),
    ...(typeof args.x === 'number' ? { x: args.x } : {}),
    ...(typeof args.y === 'number' ? { y: args.y } : {}),
  };

  const res = await apiFetch<PatchScrapbookPageNoteResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/notes/${encodeURIComponent(args.noteId)}`,
    {
      method: 'PATCH',
      json,
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to update note');
  return res.note;
}

export type DeleteScrapbookPageNoteResponse = { ok: true } | { ok: false; error: string; details?: unknown };

export async function deleteScrapbookPageNote(args: {
  scrapbookId: string;
  pageId: string;
  noteId: string;
}): Promise<void> {
  const res = await apiFetch<DeleteScrapbookPageNoteResponse>(
    `/scrapbooks/${encodeURIComponent(args.scrapbookId)}/pages/${encodeURIComponent(args.pageId)}/notes/${encodeURIComponent(args.noteId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to delete note');
}
