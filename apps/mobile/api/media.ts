import { apiFetch } from '@/api/client';

export type MediaUploadUrlResponse =
  | { ok: true; uploadUrl: string; blobKey: string; expiresAt?: string }
  | { ok: false; error: string; details?: unknown };

export async function requestMediaUploadUrl(args: {
  relationshipId: string;
  contentType?: string;
}): Promise<{ uploadUrl: string; blobKey: string; expiresAt: string | null }> {
  const res = await apiFetch<MediaUploadUrlResponse>('/media/upload-url', {
    method: 'POST',
    json: {
      relationshipId: args.relationshipId,
      ...(typeof args.contentType === 'string' && args.contentType.length > 0 ? { contentType: args.contentType } : {}),
    },
  });

  if (!('ok' in res) || !res.ok) {
    throw new Error((res as any)?.error ?? 'Failed to create upload URL');
  }

  return {
    uploadUrl: res.uploadUrl,
    blobKey: res.blobKey,
    expiresAt: typeof (res as any).expiresAt === 'string' ? (res as any).expiresAt : null,
  };
}

export type AttachEntryMediaResponse =
  | {
      ok: true;
      media: {
        id: string;
        entryId: string;
        blobKey: string;
        kind: string;
        width: number;
        height: number;
        createdAt: string;
      };
    }
  | { ok: false; error: string; details?: unknown };

export async function attachEntryMedia(args: {
  entryId: string;
  blobKey: string;
  kind: 'photo';
  width: number;
  height: number;
}): Promise<{ id: string }> {
  const res = await apiFetch<AttachEntryMediaResponse>(`/entries/${encodeURIComponent(args.entryId)}/media`, {
    method: 'POST',
    json: {
      blobKey: args.blobKey,
      kind: args.kind,
      width: args.width,
      height: args.height,
    },
  });

  if (!('ok' in res) || !res.ok) {
    throw new Error((res as any)?.error ?? 'Failed to attach media');
  }

  return { id: res.media.id };
}
