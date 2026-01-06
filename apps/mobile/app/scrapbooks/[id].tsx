import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { getScrapbook, patchScrapbookDetails, type ScrapbookDetails } from '@/api/scrapbooks';
import {
  createScrapbookPage,
  listScrapbookPages,
  type ScrapbookPage,
  updateScrapbookPageMediaPosition,
  attachScrapbookPageMedia,
} from '@/api/scrapbookPages';
import { requestMediaUploadUrl } from '@/api/media';
import {
  createScrapbookPageNote,
  deleteScrapbookPageNote,
  listScrapbookPageNotes,
  patchScrapbookPageNote,
  type ScrapbookNoteColor,
  type ScrapbookPageNote,
} from '@/api/scrapbookNotes';
import {
  createScrapbookPageSticker,
  deleteScrapbookPageSticker,
  listScrapbookPageStickers,
  patchScrapbookPageSticker,
  type ScrapbookPageSticker,
  type ScrapbookStickerKind,
} from '@/api/scrapbookStickers';
import { MemoriesCanvas, type MemoryPhoto } from '@/components/memories/MemoriesCanvas';
import { StickersLayer, STICKER_BASE_SIZE, stickerEmoji } from '@/components/scrapbook/StickersLayer';
import { STICKY_NOTE_SIZE, StickyNotesLayer } from '@/components/scrapbook/StickyNotesLayer';
import { PaperColors } from '@/constants/paper';
import {
  ensurePlacesSessionToken,
  googlePlaceDetails,
  googlePlacesAutocomplete,
  type GooglePlacesAutocompletePrediction,
} from '@/api/googlePlaces';

const STICKER_OPTIONS: readonly { kind: ScrapbookStickerKind; label: string }[] = [
  { kind: 'heart', label: 'Heart' },
  { kind: 'star', label: 'Star' },
  { kind: 'smile', label: 'Smile' },
  { kind: 'sparkle', label: 'Sparkle' },
  { kind: 'flower', label: 'Flower' },
  { kind: 'sun', label: 'Sun' },
  { kind: 'moon', label: 'Moon' },
  { kind: 'cloud', label: 'Cloud' },
  { kind: 'rainbow', label: 'Rainbow' },
  { kind: 'check', label: 'Check' },
  { kind: 'music', label: 'Music' },
  { kind: 'coffee', label: 'Coffee' },
  { kind: 'camera', label: 'Camera' },
  { kind: 'balloon', label: 'Balloon' },
  { kind: 'gift', label: 'Gift' },
  { kind: 'party', label: 'Party' },
  { kind: 'tape', label: 'Tape' },
  { kind: 'thumbsUp', label: 'Thumbs up' },
  { kind: 'fire', label: 'Fire' },
  { kind: 'leaf', label: 'Leaf' },
];

const MOOD_TAG_OPTIONS: readonly string[] = [
  'cozy',
  'fancy',
  'casual',
  'loud',
  'quiet',
  'romantic',
  'chill',
  'adventurous',
  'sweet',
  'chaotic',
  'cute',
  'spicy',
];

export default function ScrapbookViewer() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const scrapbookId = useMemo(() => {
    const raw = params.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' ? v : null;
  }, [params.id]);

  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<ScrapbookPage> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Scrapbook');
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [scrapbookDetails, setScrapbookDetails] = useState<ScrapbookDetails | null>(null);
  const [pages, setPages] = useState<ScrapbookPage[]>([]);
  const [pageCursor, setPageCursor] = useState(0);
  const [creatingPage, setCreatingPage] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [notesByPageId, setNotesByPageId] = useState<Record<string, ScrapbookPageNote[]>>({});
  const [notesLoadingPageIds, setNotesLoadingPageIds] = useState<Record<string, boolean>>({});
  const [stickersByPageId, setStickersByPageId] = useState<Record<string, ScrapbookPageSticker[]>>({});
  const [stickersLoadingPageIds, setStickersLoadingPageIds] = useState<Record<string, boolean>>({});
  const [editingNote, setEditingNote] = useState<{
    pageId: string;
    noteId: string;
    text: string;
  } | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [noteActionsFor, setNoteActionsFor] = useState<{ pageId: string; noteId: string } | null>(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<{ pageId: string; noteId: string } | null>(null);

  const [stickerTrayOpen, setStickerTrayOpen] = useState(false);
  const [stickerActionsFor, setStickerActionsFor] = useState<{ pageId: string; stickerId: string } | null>(null);
  const [confirmStickerDeleteFor, setConfirmStickerDeleteFor] = useState<{ pageId: string; stickerId: string } | null>(null);
  const [activeStickerFor, setActiveStickerFor] = useState<{ pageId: string; stickerId: string } | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState<{
    date: string;
    place: string;
    placeId: string | null;
    moodTags: string[];
    review: string;
  } | null>(null);

  const [placeSessionToken, setPlaceSessionToken] = useState<string | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<GooglePlacesAutocompletePrediction[]>([]);
  const [placeSuggestionsLoading, setPlaceSuggestionsLoading] = useState(false);
  const [placeSuggestionsError, setPlaceSuggestionsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!scrapbookId) return;
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const [sb, ps] = await Promise.all([getScrapbook(scrapbookId), listScrapbookPages(scrapbookId)]);
      setTitle(sb.title);
      setRelationshipId(sb.relationshipId);
      setScrapbookDetails(sb.details ?? null);
      setPages(ps);
      setNotesByPageId({});
      setNotesLoadingPageIds({});
      setStickersByPageId({});
      setStickersLoadingPageIds({});
      setPageCursor((cur) => {
        if (ps.length === 0) return 0;
        return Math.max(0, Math.min(cur, ps.length - 1));
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [scrapbookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ensureFirstPage = useCallback(async () => {
    if (!scrapbookId) return;
    if (creatingPage) return;
    if (pages.length > 0) return;

    setCreatingPage(true);
    setStatus(null);
    try {
      const page = await createScrapbookPage(scrapbookId);
      setPages([page]);
      setPageCursor(0);
      setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: 0, animated: false });
        } catch {
          // ignore
        }
      }, 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPage(false);
    }
  }, [creatingPage, pages.length, scrapbookId]);

  useEffect(() => {
    if (!loading && !error) {
      void ensureFirstPage();
    }
  }, [ensureFirstPage, error, loading]);

  const currentPage = pages.length > 0 ? pages[Math.max(0, Math.min(pageCursor, pages.length - 1))] : null;

  const loadNotesForPage = useCallback(
    async (pageId: string) => {
      if (!scrapbookId) return;
      setNotesLoadingPageIds((prev) => ({ ...prev, [pageId]: true }));
      try {
        const notes = await listScrapbookPageNotes({ scrapbookId, pageId });
        setNotesByPageId((prev) => ({ ...prev, [pageId]: notes }));
      } catch (e: unknown) {
        // Non-fatal: allow the page to render without notes.
        setStatus((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
      } finally {
        setNotesLoadingPageIds((prev) => ({ ...prev, [pageId]: false }));
      }
    },
    [scrapbookId]
  );

  const loadStickersForPage = useCallback(
    async (pageId: string) => {
      if (!scrapbookId) return;
      setStickersLoadingPageIds((prev) => ({ ...prev, [pageId]: true }));
      try {
        const stickers = await listScrapbookPageStickers({ scrapbookId, pageId });
        setStickersByPageId((prev) => ({ ...prev, [pageId]: stickers }));
      } catch (e: unknown) {
        // Non-fatal: allow the page to render without stickers.
        setStatus((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
      } finally {
        setStickersLoadingPageIds((prev) => ({ ...prev, [pageId]: false }));
      }
    },
    [scrapbookId]
  );

  useEffect(() => {
    if (!currentPage || !scrapbookId) return;
    if (notesByPageId[currentPage.id]) return;
    if (notesLoadingPageIds[currentPage.id]) return;
    void loadNotesForPage(currentPage.id);
  }, [currentPage, loadNotesForPage, notesByPageId, notesLoadingPageIds, scrapbookId]);

  useEffect(() => {
    if (!currentPage || !scrapbookId) return;
    if (stickersByPageId[currentPage.id]) return;
    if (stickersLoadingPageIds[currentPage.id]) return;
    void loadStickersForPage(currentPage.id);
  }, [currentPage, loadStickersForPage, scrapbookId, stickersByPageId, stickersLoadingPageIds]);

  const updateCursorFromOffsetX = useCallback(
    (offsetX: number) => {
      if (!Number.isFinite(offsetX)) return;
      if (windowWidth <= 0) return;
      const raw = Math.round(offsetX / windowWidth);
      const idx = Math.max(0, Math.min(raw, Math.max(0, pages.length - 1)));
      setPageCursor((cur) => (cur === idx ? cur : idx));
      setNoteActionsFor(null);
      setConfirmDeleteFor(null);
      setStickerActionsFor(null);
      setConfirmStickerDeleteFor(null);
      setActiveStickerFor(null);
      setDetailsOpen(false);
      setDetailsDraft(null);
    },
    [pages.length, windowWidth]
  );

  const addPage = useCallback(async () => {
    if (!scrapbookId) return;
    if (creatingPage) return;
    setCreatingPage(true);
    setStatus(null);
    try {
      const page = await createScrapbookPage(scrapbookId);
      setPages((prev) => {
        const next = [...prev, page].sort((a, b) => a.pageIndex - b.pageIndex);
        const idx = next.findIndex((p) => p.id === page.id);

        // Scroll after React commits the new list.
        setTimeout(() => {
          if (idx >= 0) {
            setPageCursor(idx);
            try {
              listRef.current?.scrollToIndex({ index: idx, animated: true });
            } catch {
              // ignore
            }
          }
        }, 0);

        return next;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPage(false);
    }
  }, [creatingPage, scrapbookId]);

  const onTransformChanged = useCallback((args: { mediaId: string; x: number; y: number; scale: number }) => {
    setPages((prev) =>
      prev.map((p) => {
        const idx = p.media.findIndex((m) => m.id === args.mediaId);
        if (idx < 0) return p;
        const nextMedia = [...p.media];
        nextMedia[idx] = { ...nextMedia[idx], x: args.x, y: args.y, scale: args.scale };
        return { ...p, media: nextMedia };
      })
    );
  }, []);

  const onNoteTransformChanged = useCallback((args: { pageId: string; noteId: string; x: number; y: number }) => {
    setNotesByPageId((prev) => {
      const pageNotes = prev[args.pageId];
      if (!pageNotes) return prev;
      const idx = pageNotes.findIndex((n) => n.id === args.noteId);
      if (idx < 0) return prev;
      const next = [...pageNotes];
      next[idx] = { ...next[idx], x: args.x, y: args.y };
      return { ...prev, [args.pageId]: next };
    });
  }, []);

  const onStickerTransformChanged = useCallback(
    (args: { pageId: string; stickerId: string; x: number; y: number }) => {
      setStickersByPageId((prev) => {
        const pageStickers = prev[args.pageId];
        if (!pageStickers) return prev;
        const idx = pageStickers.findIndex((s) => s.id === args.stickerId);
        if (idx < 0) return prev;
        const next = [...pageStickers];
        next[idx] = { ...next[idx], x: args.x, y: args.y };
        return { ...prev, [args.pageId]: next };
      });
    },
    []
  );

  const onNoteTransformCommitted = useCallback(
    async (args: { pageId: string; noteId: string; x: number; y: number }) => {
      if (!scrapbookId) return;
      try {
        const updated = await patchScrapbookPageNote({
          scrapbookId,
          pageId: args.pageId,
          noteId: args.noteId,
          x: args.x,
          y: args.y,
        });
        setNotesByPageId((prev) => {
          const pageNotes = prev[args.pageId];
          if (!pageNotes) return prev;
          return { ...prev, [args.pageId]: pageNotes.map((n) => (n.id === updated.id ? updated : n)) };
        });
      } catch (e: unknown) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [scrapbookId]
  );

  const onStickerTransformCommitted = useCallback(
    async (args: { pageId: string; stickerId: string; x: number; y: number }) => {
      if (!scrapbookId) return;
      try {
        const updated = await patchScrapbookPageSticker({
          scrapbookId,
          pageId: args.pageId,
          stickerId: args.stickerId,
          x: args.x,
          y: args.y,
        });
        setStickersByPageId((prev) => {
          const pageStickers = prev[args.pageId];
          if (!pageStickers) return prev;
          return { ...prev, [args.pageId]: pageStickers.map((s) => (s.id === updated.id ? updated : s)) };
        });
      } catch (e: unknown) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [scrapbookId]
  );

  const openNoteEditor = useCallback((args: { pageId: string; noteId: string; text: string }) => {
    setEditingNote(args);
    setEditingText(args.text);
  }, []);

  const saveNoteText = useCallback(async () => {
    if (!editingNote || !scrapbookId) return;
    const { pageId, noteId } = editingNote;
    const text = editingText;
    try {
      const updated = await patchScrapbookPageNote({ scrapbookId, pageId, noteId, text });
      setNotesByPageId((prev) => {
        const pageNotes = prev[pageId];
        if (!pageNotes) return prev;
        return { ...prev, [pageId]: pageNotes.map((n) => (n.id === noteId ? updated : n)) };
      });
      setEditingNote(null);
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [editingNote, editingText, scrapbookId]);

  const openDetailsForCurrentPage = useCallback(() => {
    const details = scrapbookDetails;
    setDetailsDraft({
      date: typeof details?.date === 'string' ? details.date : '',
      place: typeof details?.place === 'string' ? details.place : '',
      placeId: typeof details?.placeId === 'string' ? details.placeId : null,
      moodTags: Array.isArray(details?.moodTags) ? details.moodTags : [],
      review: typeof details?.review === 'string' ? details.review : '',
    });
    setDetailsOpen(true);

    // Reset autocomplete state for a clean session.
    setPlaceSessionToken((prev) => ensurePlacesSessionToken(prev));
    setPlaceSuggestions([]);
    setPlaceSuggestionsError(null);

    // Close any other menus/modals.
    setStickerActionsFor(null);
    setConfirmStickerDeleteFor(null);
    setNoteActionsFor(null);
    setConfirmDeleteFor(null);
    setActiveStickerFor(null);
  }, [scrapbookDetails]);

  // Autocomplete place suggestions as the user types.
  useEffect(() => {
    if (!detailsOpen) return;
    if (!detailsDraft) return;

    // If a suggestion has been selected, don't keep querying autocomplete.
    // (If the user edits the field, the onChangeText handler clears placeId.)
    if (detailsDraft.placeId) {
      setPlaceSuggestions([]);
      setPlaceSuggestionsError(null);
      setPlaceSuggestionsLoading(false);
      return;
    }

    const raw = detailsDraft.place;
    const q = raw.trim();

    // If user cleared the input, clear suggestions.
    if (q.length === 0) {
      setPlaceSuggestions([]);
      setPlaceSuggestionsError(null);
      setPlaceSuggestionsLoading(false);
      return;
    }

    // If the user already picked a placeId and the text still matches, don't re-query.
    // (Typing after selecting will clear placeId in the onChange handler below.)

    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          setPlaceSuggestionsLoading(true);
          setPlaceSuggestionsError(null);
          const token = ensurePlacesSessionToken(placeSessionToken);
          if (token !== placeSessionToken) setPlaceSessionToken(token);

          const res = await googlePlacesAutocomplete({ input: q, sessionToken: token });
          if (cancelled) return;
          setPlaceSessionToken(res.sessionToken);
          setPlaceSuggestions(res.predictions.slice(0, 6));
        } catch (e: unknown) {
          if (cancelled) return;
          // Keep the field usable even if Places fails/missing key.
          setPlaceSuggestions([]);
          setPlaceSuggestionsError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!cancelled) setPlaceSuggestionsLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [detailsDraft?.place, detailsDraft, detailsOpen, placeSessionToken]);

  const toggleMoodTag = useCallback((tag: string) => {
    setDetailsDraft((prev) => {
      if (!prev) return prev;
      const has = prev.moodTags.includes(tag);
      const nextTags = has ? prev.moodTags.filter((t) => t !== tag) : [...prev.moodTags, tag];
      return { ...prev, moodTags: nextTags };
    });
  }, []);

  const selectPlaceSuggestion = useCallback(
    async (pred: GooglePlacesAutocompletePrediction) => {
      if (detailsSaving) return;

      // Ensure we have a token; using one across autocomplete + details improves relevance/cost.
      const token = ensurePlacesSessionToken(placeSessionToken);
      if (token !== placeSessionToken) setPlaceSessionToken(token);

      try {
        setPlaceSuggestionsLoading(true);
        setPlaceSuggestionsError(null);

        const res = await googlePlaceDetails({ placeId: pred.placeId, sessionToken: token });
        setPlaceSessionToken(res.sessionToken);

        const name = res.details.name;
        const addr = res.details.formattedAddress;
        const label = name && addr ? `${name} — ${addr}` : pred.description;

        setDetailsDraft((prev) => (prev ? { ...prev, place: label, placeId: pred.placeId } : prev));
        setPlaceSuggestions([]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setPlaceSuggestionsError(msg);
        // Non-fatal; user can still type a free-form place.
        setStatus((prev) => prev ?? msg);
      } finally {
        setPlaceSuggestionsLoading(false);
      }
    },
    [detailsSaving, placeSessionToken]
  );

  const saveDetails = useCallback(async () => {
    if (!scrapbookId) return;
    if (!detailsDraft) return;
    if (detailsSaving) return;

    const date = detailsDraft.date.trim();
    const place = detailsDraft.place.trim();
    const placeId = detailsDraft.placeId;
    const review = detailsDraft.review.trim();
    const moodTags = detailsDraft.moodTags;

    const nextDetails = {
      date: date.length > 0 ? date : null,
      place: place.length > 0 ? place : null,
      placeId: place.length > 0 ? placeId : null,
      moodTags: moodTags.length > 0 ? moodTags : null,
      review: review.length > 0 ? review : null,
    };

    // Optimistic update.
    const previousDetails = scrapbookDetails;
    setScrapbookDetails(nextDetails);

    setDetailsSaving(true);
    try {
      const updated = await patchScrapbookDetails({
        scrapbookId,
        date: nextDetails.date,
        place: nextDetails.place,
        placeId: nextDetails.placeId,
        moodTags: nextDetails.moodTags,
        review: nextDetails.review,
      });

      setScrapbookDetails(updated.details);
      setDetailsOpen(false);
      setDetailsDraft(null);
    } catch (e: unknown) {
      setScrapbookDetails(previousDetails ?? null);
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailsSaving(false);
    }
  }, [detailsDraft, detailsSaving, scrapbookDetails, scrapbookId]);

  const setNoteColor = useCallback(
    (args: { pageId: string; noteId: string; color: ScrapbookNoteColor }) => {
      if (!scrapbookId) return;

      // Optimistic UI update: change color immediately.
      const prevColor = (notesByPageId[args.pageId] ?? []).find((n) => n.id === args.noteId)?.color;
      setNotesByPageId((prev) => {
        const pageNotes = prev[args.pageId];
        if (!pageNotes) return prev;
        return {
          ...prev,
          [args.pageId]: pageNotes.map((n) => (n.id === args.noteId ? { ...n, color: args.color } : n)),
        };
      });

      // Then sync to backend.
      void (async () => {
        try {
          const updated = await patchScrapbookPageNote({
            scrapbookId,
            pageId: args.pageId,
            noteId: args.noteId,
            color: args.color,
          });
          setNotesByPageId((prev) => {
            const pageNotes = prev[args.pageId];
            if (!pageNotes) return prev;
            return { ...prev, [args.pageId]: pageNotes.map((n) => (n.id === args.noteId ? updated : n)) };
          });
        } catch (e: unknown) {
          // Roll back optimistic update on failure.
          if (prevColor) {
            setNotesByPageId((prev) => {
              const pageNotes = prev[args.pageId];
              if (!pageNotes) return prev;
              return {
                ...prev,
                [args.pageId]: pageNotes.map((n) => (n.id === args.noteId ? { ...n, color: prevColor } : n)),
              };
            });
          }
          setStatus(e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [notesByPageId, scrapbookId]
  );

  const deleteNote = useCallback(
    async (args: { pageId: string; noteId: string }) => {
      if (!scrapbookId) return;

      // Optimistic UI update so the user immediately sees something happen.
      const previous = notesByPageId[args.pageId] ?? null;
      setNotesByPageId((prev) => {
        const pageNotes = prev[args.pageId];
        if (!pageNotes) return prev;
        return { ...prev, [args.pageId]: pageNotes.filter((n) => n.id !== args.noteId) };
      });

      try {
        await deleteScrapbookPageNote({ scrapbookId, pageId: args.pageId, noteId: args.noteId });
      } catch (e: unknown) {
        // Roll back optimistic delete.
        if (previous) {
          setNotesByPageId((prev) => ({ ...prev, [args.pageId]: previous }));
        }
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [notesByPageId, scrapbookId]
  );

  const patchStickerOptimistic = useCallback(
    (args: {
      pageId: string;
      stickerId: string;
      patch: Partial<Pick<ScrapbookPageSticker, 'x' | 'y' | 'scale' | 'rotation'>>;
    }) => {
      if (!scrapbookId) return;

      const previous = (stickersByPageId[args.pageId] ?? []).find((s) => s.id === args.stickerId) ?? null;
      setStickersByPageId((prev) => {
        const pageStickers = prev[args.pageId];
        if (!pageStickers) return prev;
        return {
          ...prev,
          [args.pageId]: pageStickers.map((s) => (s.id === args.stickerId ? { ...s, ...args.patch } : s)),
        };
      });

      void (async () => {
        try {
          const updated = await patchScrapbookPageSticker({
            scrapbookId,
            pageId: args.pageId,
            stickerId: args.stickerId,
            ...(typeof args.patch.x === 'number' ? { x: args.patch.x } : {}),
            ...(typeof args.patch.y === 'number' ? { y: args.patch.y } : {}),
            ...(typeof args.patch.scale === 'number' ? { scale: args.patch.scale } : {}),
            ...(typeof args.patch.rotation === 'number' ? { rotation: args.patch.rotation } : {}),
          });
          setStickersByPageId((prev) => {
            const pageStickers = prev[args.pageId];
            if (!pageStickers) return prev;
            return { ...prev, [args.pageId]: pageStickers.map((s) => (s.id === updated.id ? updated : s)) };
          });
        } catch (e: unknown) {
          if (previous) {
            setStickersByPageId((prev) => {
              const pageStickers = prev[args.pageId];
              if (!pageStickers) return prev;
              return {
                ...prev,
                [args.pageId]: pageStickers.map((s) => (s.id === args.stickerId ? previous : s)),
              };
            });
          }
          setStatus(e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [scrapbookId, stickersByPageId]
  );

  const deleteSticker = useCallback(
    async (args: { pageId: string; stickerId: string }) => {
      if (!scrapbookId) return;

      const previous = stickersByPageId[args.pageId] ?? null;
      setStickersByPageId((prev) => {
        const pageStickers = prev[args.pageId];
        if (!pageStickers) return prev;
        return { ...prev, [args.pageId]: pageStickers.filter((s) => s.id !== args.stickerId) };
      });

      try {
        await deleteScrapbookPageSticker({ scrapbookId, pageId: args.pageId, stickerId: args.stickerId });
      } catch (e: unknown) {
        if (previous) {
          setStickersByPageId((prev) => ({ ...prev, [args.pageId]: previous }));
        }
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [scrapbookId, stickersByPageId]
  );

  const onNotePressed = useCallback(
    (args: { pageId: string; noteId: string }) => {
      setNoteActionsFor(args);
      setConfirmDeleteFor(null);
      setStickerActionsFor(null);
      setConfirmStickerDeleteFor(null);
    },
    []
  );

  const onStickerPressed = useCallback((args: { pageId: string; stickerId: string }) => {
    setStickerActionsFor(args);
    setConfirmStickerDeleteFor(null);
    setNoteActionsFor(null);
    setConfirmDeleteFor(null);
  }, []);

  const renderNoteActionsPopover = useCallback(
    (args: { pageId: string; stageWidth: number; stageHeight: number }) => {
      const target = noteActionsFor;
      if (!target) return null;
      if (target.pageId !== args.pageId) return null;

      const confirmingDelete =
        !!confirmDeleteFor && confirmDeleteFor.pageId === target.pageId && confirmDeleteFor.noteId === target.noteId;

      const note = (notesByPageId[target.pageId] ?? []).find((n) => n.id === target.noteId);
      if (!note) return null;

      // Compute pixel anchor from normalized x/y.
      const maxX = Math.max(0, args.stageWidth - STICKY_NOTE_SIZE.width);
      const maxY = Math.max(0, args.stageHeight - STICKY_NOTE_SIZE.height);
      const noteLeft = (typeof note.x === 'number' ? note.x : 0) * maxX;
      const noteTop = (typeof note.y === 'number' ? note.y : 0) * maxY;

      // Place the menu just above the note, clamped within stage.
      const MENU_W = 220;
      const MENU_H = 210;
      const desiredLeft = noteLeft + STICKY_NOTE_SIZE.width - MENU_W;
      const desiredTop = noteTop - MENU_H - 8;
      const left = Math.max(8, Math.min(desiredLeft, Math.max(8, args.stageWidth - MENU_W - 8)));
      const top = Math.max(8, Math.min(desiredTop, Math.max(8, args.stageHeight - MENU_H - 8)));

      return (
        <View style={[StyleSheet.absoluteFill, styles.popoverLayer]} pointerEvents="box-none">
          {/* Tap outside to close */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setNoteActionsFor(null);
              setConfirmDeleteFor(null);
            }}
          />

          <View style={[styles.popover, { left, top, width: MENU_W }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNoteActionsFor(null);
                openNoteEditor({ pageId: target.pageId, noteId: target.noteId, text: note.text ?? '' });
              }}
              style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
            >
              <Text style={styles.popoverRowText}>Edit text</Text>
            </Pressable>

            <View style={styles.actionDivider} />

            <Text style={styles.actionSectionLabel}>Change color</Text>
            <View style={styles.colorRow}>
              {([
                { label: 'Yellow', color: 'yellow' },
                { label: 'Pink', color: 'pink' },
                { label: 'Blue', color: 'blue' },
                { label: 'Purple', color: 'purple' },
              ] as const).map((c) => (
                <Pressable
                  key={c.color}
                  accessibilityRole="button"
                  onPress={() => {
                    void setNoteColor({ pageId: target.pageId, noteId: target.noteId, color: c.color });
                    setNoteActionsFor(null);
                  }}
                  style={({ pressed }) => [styles.colorChip, pressed && styles.actionRowPressed]}
                >
                  <Text style={styles.colorChipText}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actionDivider} />

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (confirmingDelete) {
                  // Second tap (while confirming) performs the delete.
                  void deleteNote(target);
                  setNoteActionsFor(null);
                  setConfirmDeleteFor(null);
                  return;
                }

                // First tap toggles a confirmation state inside the popover.
                setConfirmDeleteFor(target);
              }}
              style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
            >
              <Text style={[styles.popoverRowText, styles.destructiveText]}>
                {confirmingDelete ? 'Tap again to confirm delete' : 'Delete'}
              </Text>
            </Pressable>

            {confirmingDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmDeleteFor(null)}
                style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.popoverRowText}>Cancel delete</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [confirmDeleteFor, deleteNote, noteActionsFor, notesByPageId, openNoteEditor, setNoteColor]
  );

  const renderStickerActionsPopover = useCallback(
    (args: { pageId: string; stageWidth: number; stageHeight: number }) => {
      const target = stickerActionsFor;
      if (!target) return null;
      if (target.pageId !== args.pageId) return null;

      const confirmingDelete =
        !!confirmStickerDeleteFor &&
        confirmStickerDeleteFor.pageId === target.pageId &&
        confirmStickerDeleteFor.stickerId === target.stickerId;

      const sticker = (stickersByPageId[target.pageId] ?? []).find((s) => s.id === target.stickerId);
      if (!sticker) return null;

      const scale = typeof sticker.scale === 'number' ? sticker.scale : 1;
      const size = STICKER_BASE_SIZE * Math.min(Math.max(scale, 0.25), 4);

      const maxX = Math.max(0, args.stageWidth - size);
      const maxY = Math.max(0, args.stageHeight - size);
      const stickerLeft = (typeof sticker.x === 'number' ? sticker.x : 0) * maxX;
      const stickerTop = (typeof sticker.y === 'number' ? sticker.y : 0) * maxY;

      const MENU_W = 240;
      const MENU_H = confirmingDelete ? 240 : 200;
      const desiredLeft = stickerLeft + size - MENU_W;
      const desiredTop = stickerTop - MENU_H - 8;
      const left = Math.max(8, Math.min(desiredLeft, Math.max(8, args.stageWidth - MENU_W - 8)));
      const top = Math.max(8, Math.min(desiredTop, Math.max(8, args.stageHeight - MENU_H - 8)));

      const emoji = stickerEmoji(sticker.kind as ScrapbookStickerKind);

      return (
        <View style={[StyleSheet.absoluteFill, styles.popoverLayer]} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setStickerActionsFor(null);
              setConfirmStickerDeleteFor(null);
            }}
          />

          <View style={[styles.popover, { left, top, width: MENU_W }]}>
            <Text style={styles.actionSectionLabel}>Sticker {emoji}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const cur = typeof sticker.rotation === 'number' ? sticker.rotation : 0;
                patchStickerOptimistic({ pageId: target.pageId, stickerId: target.stickerId, patch: { rotation: cur + 15 } });
              }}
              style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
            >
              <Text style={styles.popoverRowText}>Rotate +15°</Text>
            </Pressable>

            <View style={styles.colorRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const cur = typeof sticker.scale === 'number' ? sticker.scale : 1;
                  const next = Math.min(4, cur * 1.15);
                  patchStickerOptimistic({ pageId: target.pageId, stickerId: target.stickerId, patch: { scale: next } });
                }}
                style={({ pressed }) => [styles.colorChip, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.colorChipText}>Bigger</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const cur = typeof sticker.scale === 'number' ? sticker.scale : 1;
                  const next = Math.max(0.25, cur / 1.15);
                  patchStickerOptimistic({ pageId: target.pageId, stickerId: target.stickerId, patch: { scale: next } });
                }}
                style={({ pressed }) => [styles.colorChip, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.colorChipText}>Smaller</Text>
              </Pressable>
            </View>

            <View style={styles.actionDivider} />

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (confirmingDelete) {
                  void deleteSticker(target);
                  setStickerActionsFor(null);
                  setConfirmStickerDeleteFor(null);
                  return;
                }
                setConfirmStickerDeleteFor(target);
              }}
              style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
            >
              <Text style={[styles.popoverRowText, styles.destructiveText]}>
                {confirmingDelete ? 'Tap again to confirm delete' : 'Delete'}
              </Text>
            </Pressable>

            {confirmingDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmStickerDeleteFor(null)}
                style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.popoverRowText}>Cancel delete</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [confirmStickerDeleteFor, deleteSticker, patchStickerOptimistic, stickerActionsFor, stickersByPageId]
  );

  const addPostItToCurrentPage = useCallback(async () => {
    if (!scrapbookId || !currentPage) return;
    setStatus(null);
    try {
      const note = await createScrapbookPageNote({
        scrapbookId,
        pageId: currentPage.id,
        text: '',
        color: 'yellow',
        x: 0.2,
        y: 0.2,
      });

      setNotesByPageId((prev) => {
        const existing = prev[currentPage.id] ?? [];
        return { ...prev, [currentPage.id]: [...existing, note] };
      });

      openNoteEditor({ pageId: currentPage.id, noteId: note.id, text: note.text ?? '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [currentPage, openNoteEditor, scrapbookId]);

  const addStickerToCurrentPage = useCallback(
    async (kind: ScrapbookStickerKind) => {
      if (!scrapbookId || !currentPage) return;
      setStatus(null);
      try {
        const defaults =
          kind === 'tape'
            ? { x: 0.06, y: 0.06, scale: 1.15, rotation: -15 }
            : { x: 0.08, y: 0.08, scale: 1, rotation: 0 };

        const sticker = await createScrapbookPageSticker({
          scrapbookId,
          pageId: currentPage.id,
          kind,
          ...defaults,
        });

        setStickersByPageId((prev) => {
          const existing = prev[currentPage.id] ?? [];
          return { ...prev, [currentPage.id]: [...existing, sticker] };
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [currentPage, scrapbookId]
  );

  const onTransformCommitted = useCallback(
    async (args: { mediaId: string; x: number; y: number; scale: number }) => {
      if (!scrapbookId) return;
      const page = pages.find((p) => p.media.some((m) => m.id === args.mediaId));
      if (!page) return;
      await updateScrapbookPageMediaPosition({
        scrapbookId,
        pageId: page.id,
        mediaId: args.mediaId,
        x: args.x,
        y: args.y,
        scale: args.scale,
      });
    },
    [pages, scrapbookId]
  );

  const addPhotoToCurrentPage = useCallback(async () => {
    if (!scrapbookId || !currentPage || !relationshipId) return;
    if (uploadingPhoto) return;

    setUploadingPhoto(true);
    setStatus(null);
    setError(null);

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setStatus('Photos permission not granted.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });
      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) {
        setStatus('No image selected.');
        return;
      }

      const width = typeof asset.width === 'number' ? asset.width : null;
      const height = typeof asset.height === 'number' ? asset.height : null;
      if (!width || !height) {
        setStatus('Could not determine image size.');
        return;
      }

      const contentType = typeof asset.mimeType === 'string' ? asset.mimeType : undefined;
      const { uploadUrl, blobKey } = await requestMediaUploadUrl({ relationshipId, contentType });

      // Upload to Azure Blob SAS URL.
      // NOTE: expo-file-system.uploadAsync is not available on web, so we use fetch there.
      if (Platform.OS === 'web') {
        const sourceRes = await fetch(asset.uri);
        if (!sourceRes.ok) {
          throw new Error(`Failed to read selected image (status ${sourceRes.status})`);
        }

        const blob = await sourceRes.blob();
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
          body: blob,
        });

        if (!putRes.ok) {
          const text = await putRes.text().catch(() => '');
          throw new Error(`Upload failed (status ${putRes.status})${text ? `: ${text}` : ''}`);
        }
      } else {
        const uploadRes = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
        });

        if (uploadRes.status < 200 || uploadRes.status >= 300) {
          throw new Error(`Upload failed (status ${uploadRes.status})`);
        }
      }

      await attachScrapbookPageMedia({
        scrapbookId,
        pageId: currentPage.id,
        blobKey,
        kind: 'photo',
        width,
        height,
      });

      const ps = await listScrapbookPages(scrapbookId);
      setPages(ps);
      setStatus('Photo added.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingPhoto(false);
    }
  }, [currentPage, relationshipId, scrapbookId, uploadingPhoto]);

  if (!scrapbookId) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Scrapbook' }} />
        <Text style={styles.errorText}>Missing scrapbook id.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Scrapbook' }} />
        <ActivityIndicator />
      </View>
    );
  }

  const pageLabel = pages.length > 0 ? `Page ${pageCursor + 1} / ${pages.length}` : 'Page 0 / 0';

  const stickerOptions = STICKER_OPTIONS;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.pageLabel}>{pageLabel}</Text>
        </View>

        <View style={styles.topBarActions}>
          <Pressable
            accessibilityRole="button"
            disabled={creatingPage}
            onPress={() => void addPage()}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              creatingPage && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>+ Add Page</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerErrorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [styles.bannerButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.bannerButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {status ? (
        <View style={styles.bannerStatus}>
          <Text style={styles.bannerStatusText}>{status}</Text>
        </View>
      ) : null}

      <FlatList
        ref={(r) => {
          listRef.current = r;
        }}
        data={pages}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.pagerList}
        contentContainerStyle={styles.pager}
        scrollEventThrottle={16}
        onScroll={(e) => {
          updateCursorFromOffsetX(e.nativeEvent.contentOffset.x);
        }}
        onMomentumScrollEnd={(e) => {
          updateCursorFromOffsetX(e.nativeEvent.contentOffset.x);
        }}
        onScrollEndDrag={(e) => {
          updateCursorFromOffsetX(e.nativeEvent.contentOffset.x);
        }}
        renderItem={({ item, index }) => {
          const photos: MemoryPhoto[] = item.media.map((m) => ({
            id: m.id,
            kind: m.kind,
            url: m.url ?? '',
            width: m.width,
            height: m.height,
            x: m.x,
            y: m.y,
            scale: m.scale,
          }));

          const notes = notesByPageId[item.id] ?? [];
          const stickers = stickersByPageId[item.id] ?? [];

          return (
            <View style={[styles.pageViewport, { width: windowWidth }]}>
              <View style={styles.paperPage}>
                <Text style={styles.pageTitle}>Page {index + 1}</Text>

                <MemoriesCanvas
                  photos={photos}
                  style={styles.canvas}
                  onStagePress={() => {
                    setActiveStickerFor(null);
                    setStickerActionsFor(null);
                    setConfirmStickerDeleteFor(null);
                    setNoteActionsFor(null);
                    setConfirmDeleteFor(null);
                  }}
                  onTransformChanged={onTransformChanged}
                  onTransformCommitted={onTransformCommitted}
                  renderOverlay={(stage) => (
                    <>
                      <StickersLayer
                        stickers={stickers}
                        stageWidth={stage.width}
                        stageHeight={stage.height}
                        activeStickerId={activeStickerFor?.pageId === item.id ? activeStickerFor.stickerId : null}
                        onActiveStickerIdChange={(stickerId) =>
                          setActiveStickerFor(stickerId ? { pageId: item.id, stickerId } : null)
                        }
                        onStickerPressed={(stickerId) => onStickerPressed({ pageId: item.id, stickerId })}
                        onTransformChanged={({ stickerId, x, y }) =>
                          onStickerTransformChanged({ pageId: item.id, stickerId, x, y })
                        }
                        onTransformCommitted={({ stickerId, x, y }) =>
                          onStickerTransformCommitted({ pageId: item.id, stickerId, x, y })
                        }
                      />
                      <StickyNotesLayer
                        notes={notes}
                        stageWidth={stage.width}
                        stageHeight={stage.height}
                        onNotePressed={(noteId) => onNotePressed({ pageId: item.id, noteId })}
                        onTransformChanged={({ noteId, x, y }) => onNoteTransformChanged({ pageId: item.id, noteId, x, y })}
                        onTransformCommitted={({ noteId, x, y }) =>
                          onNoteTransformCommitted({ pageId: item.id, noteId, x, y })
                        }
                      />
                      {renderStickerActionsPopover({ pageId: item.id, stageWidth: stage.width, stageHeight: stage.height })}
                      {renderNoteActionsPopover({ pageId: item.id, stageWidth: stage.width, stageHeight: stage.height })}
                    </>
                  )}
                />

                {photos.length === 0 ? (
                  <View style={styles.emptyHint}>
                    <Text style={styles.emptyHintText}>Add a photo to start your layout.</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={[styles.pageViewport, { width: windowWidth }]}>
            <View style={styles.paperPage}>
              <Text style={styles.pageTitle}>No pages yet</Text>
              <View style={styles.emptyHint}>
                <Text style={styles.emptyHintText}>
                  {creatingPage ? 'Creating your first page…' : 'Tap “+ Add Page” to start.'}
                </Text>
              </View>
            </View>
          </View>
        }
      />

      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          disabled={detailsSaving}
          onPress={openDetailsForCurrentPage}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            styles.detailsButton,
            detailsSaving && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Details</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!currentPage || uploadingPhoto}
          onPress={() => void addPhotoToCurrentPage()}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            (!currentPage || uploadingPhoto) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>+ Photo</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!currentPage}
          onPress={() => {
            setStickerTrayOpen(true);
            setActiveStickerFor(null);
            setStickerActionsFor(null);
            setConfirmStickerDeleteFor(null);
            setNoteActionsFor(null);
            setConfirmDeleteFor(null);
          }}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            !currentPage && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>+ Stickers</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!currentPage}
          onPress={() => void addPostItToCurrentPage()}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            !currentPage && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>+ Post-it</Text>
        </Pressable>
      </View>

      <Modal visible={detailsOpen} transparent animationType="fade" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.detailsHeaderRow}>
              <Text style={styles.modalTitle}>Details</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDetailsOpen(false);
                  setDetailsDraft(null);
                }}
                style={({ pressed }) => [styles.detailsClose, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.detailsCloseText}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.actionSectionLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                value={detailsDraft?.date ?? ''}
                onChangeText={(v) =>
                  setDetailsDraft((prev) => (prev ? { ...prev, date: v } : prev))
                }
                placeholder="2026-01-05"
                placeholderTextColor="rgba(46,42,39,0.45)"
                style={styles.detailsInput}
                editable={!detailsSaving}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.actionSectionLabel}>Place</Text>
              <TextInput
                value={detailsDraft?.place ?? ''}
                onChangeText={(v) => {
                  // If the user types after selecting a suggestion, treat it as manual input.
                  setDetailsDraft((prev) => (prev ? { ...prev, place: v, placeId: null } : prev));
                }}
                placeholder="Cafe, park, home…"
                placeholderTextColor="rgba(46,42,39,0.45)"
                style={styles.detailsInput}
                editable={!detailsSaving}
              />

              {detailsDraft && (placeSuggestionsLoading || placeSuggestionsError || placeSuggestions.length > 0) ? (
                <View style={styles.placeSuggestionsBox}>
                  {placeSuggestionsLoading ? (
                    <View style={styles.placeSuggestionLoadingRow}>
                      <ActivityIndicator size="small" color="rgba(46,42,39,0.6)" />
                      <Text style={styles.placeSuggestionHint}>Searching…</Text>
                    </View>
                  ) : null}

                  {placeSuggestionsError ? (
                    <Text style={styles.placeSuggestionError}>
                      {placeSuggestionsError}
                    </Text>
                  ) : null}

                  {placeSuggestions.map((p) => (
                    <Pressable
                      key={p.placeId}
                      accessibilityRole="button"
                      onPress={() => void selectPlaceSuggestion(p)}
                      disabled={detailsSaving}
                      style={({ pressed }) => [styles.placeSuggestionRow, pressed && styles.actionRowPressed]}
                    >
                      <Text style={styles.placeSuggestionPrimary} numberOfLines={1}>
                        {p.primaryText ?? p.description}
                      </Text>
                      {p.secondaryText ? (
                        <Text style={styles.placeSuggestionSecondary} numberOfLines={1}>
                          {p.secondaryText}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}

                  {!placeSuggestionsLoading && !placeSuggestionsError && placeSuggestions.length === 0 ? (
                    <Text style={styles.placeSuggestionHint}>No results</Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.actionSectionLabel}>Mood tags</Text>
              <View style={styles.moodRow}>
                {MOOD_TAG_OPTIONS.map((tag) => {
                  const active = (detailsDraft?.moodTags ?? []).includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      accessibilityRole="button"
                      onPress={() => toggleMoodTag(tag)}
                      disabled={detailsSaving}
                      style={({ pressed }) => [
                        styles.moodChip,
                        active && styles.moodChipActive,
                        pressed && styles.actionRowPressed,
                      ]}
                    >
                      <Text style={[styles.moodChipText, active && styles.moodChipTextActive]}>{tag}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.actionSectionLabel}>Date review</Text>
              <TextInput
                value={detailsDraft?.review ?? ''}
                onChangeText={(v) =>
                  setDetailsDraft((prev) => (prev ? { ...prev, review: v } : prev))
                }
                placeholder="A quick recap…"
                placeholderTextColor="rgba(46,42,39,0.45)"
                style={styles.detailsReviewInput}
                multiline
                editable={!detailsSaving}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDetailsOpen(false);
                  setDetailsDraft(null);
                }}
                disabled={detailsSaving}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.secondaryButton,
                  detailsSaving && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveDetails()}
                disabled={detailsSaving || !detailsDraft}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.primaryButton,
                  (detailsSaving || !detailsDraft) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>{detailsSaving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={stickerTrayOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStickerTrayOpen(false)}
      >
        <View style={styles.trayRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStickerTrayOpen(false)} />

          <View style={styles.trayCard}>
            <View style={styles.trayHeader}>
              <Text style={styles.trayTitle}>Stickers</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setStickerTrayOpen(false)}
                style={({ pressed }) => [styles.trayClose, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.trayCloseText}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.stickerGrid}>
              {stickerOptions.map((s) => (
                <Pressable
                  key={s.kind}
                  accessibilityRole="button"
                  onPress={() => {
                    setStickerTrayOpen(false);
                    void addStickerToCurrentPage(s.kind);
                  }}
                  style={({ pressed }) => [styles.stickerItem, pressed && styles.actionRowPressed]}
                >
                  <Text style={styles.stickerEmoji}>{stickerEmoji(s.kind as ScrapbookStickerKind)}</Text>
                  <Text style={styles.stickerLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!editingNote}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingNote(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit note</Text>
            <TextInput
              value={editingText}
              onChangeText={setEditingText}
              style={styles.modalInput}
              multiline
              placeholder="Write something…"
              placeholderTextColor="rgba(46,42,39,0.45)"
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditingNote(null)}
                style={({ pressed }) => [styles.modalButton, styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveNoteText()}
                style={({ pressed }) => [styles.modalButton, styles.primaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PaperColors.sand,
    padding: 18,
    gap: 8,
  },
  kicker: {
    color: PaperColors.ink,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  screen: {
    flex: 1,
    backgroundColor: PaperColors.sand,
  },
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarLeft: {
    gap: 3,
  },
  pageLabel: {
    color: PaperColors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 10,
  },
  pager: {
    paddingBottom: 90,
  },
  pagerList: {
    flex: 1,
  },
  pageViewport: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  paperPage: {
    flex: 1,
    backgroundColor: PaperColors.paper,
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    gap: 12,
  },
  pageTitle: {
    color: PaperColors.ink,
    opacity: 0.75,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  canvas: {
    height: 460,
    backgroundColor: 'rgba(46,42,39,0.04)',
  },
  bottomBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(46,42,39,0.08)',
    backgroundColor: PaperColors.sand,
  },
  emptyHint: {
    backgroundColor: PaperColors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: PaperColors.border,
  },
  emptyHintText: {
    color: PaperColors.ink,
    opacity: 0.72,
    lineHeight: 20,
  },
  bannerError: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(196, 44, 44, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196, 44, 44, 0.20)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bannerErrorText: {
    flex: 1,
    color: PaperColors.error,
    fontWeight: '700',
  },
  bannerStatus: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(46,42,39,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.10)',
  },
  bannerStatusText: {
    color: PaperColors.ink,
    opacity: 0.78,
    fontWeight: '600',
  },
  bannerButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  bannerButtonText: {
    fontWeight: '700',
    color: PaperColors.ink,
  },
  errorText: {
    color: PaperColors.error,
    fontWeight: '700',
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  detailsButton: {
    marginRight: 'auto',
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButton: {
    backgroundColor: PaperColors.lavender,
  },
  secondaryButton: {
    backgroundColor: PaperColors.white,
  },
  buttonText: {
    fontWeight: '700',
    color: PaperColors.ink,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: PaperColors.paper,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: PaperColors.border,
    gap: 12,
  },
  modalTitle: {
    fontWeight: '800',
    color: PaperColors.ink,
    fontSize: 16,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailsClose: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  detailsCloseText: {
    fontWeight: '900',
    color: PaperColors.ink,
  },
  detailsSection: {
    gap: 8,
  },
  detailsInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: PaperColors.white,
    color: PaperColors.ink,
  },
  placeSuggestionsBox: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.white,
    overflow: 'hidden',
  },
  placeSuggestionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: PaperColors.border,
  },
  placeSuggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: PaperColors.border,
  },
  placeSuggestionPrimary: {
    color: PaperColors.ink,
    fontWeight: '800',
  },
  placeSuggestionSecondary: {
    marginTop: 2,
    color: PaperColors.ink,
    opacity: 0.65,
    fontWeight: '700',
    fontSize: 12,
  },
  placeSuggestionHint: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: PaperColors.ink,
    opacity: 0.65,
    fontWeight: '700',
  },
  placeSuggestionError: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: PaperColors.error,
    fontWeight: '800',
  },
  detailsReviewInput: {
    minHeight: 90,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    padding: 12,
    backgroundColor: PaperColors.white,
    color: PaperColors.ink,
    textAlignVertical: 'top',
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moodChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  moodChipActive: {
    backgroundColor: PaperColors.lavender,
  },
  moodChipText: {
    fontWeight: '900',
    color: PaperColors.ink,
    opacity: 0.78,
  },
  moodChipTextActive: {
    opacity: 1,
  },
  actionSectionLabel: {
    color: PaperColors.ink,
    opacity: 0.75,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionRowPressed: {
    opacity: 0.92,
    transform: [{ translateY: 1 }],
  },
  popoverLayer: {
    // Must beat the sticky note overlay on both iOS (zIndex) and Android (elevation).
    zIndex: 50000,
    elevation: 500,
  },
  popover: {
    position: 'absolute',
    borderRadius: 16,
    padding: 10,
    backgroundColor: PaperColors.paper,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 500,
    zIndex: 50000,
    gap: 10,
  },
  popoverRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.border,
  },
  popoverRowText: {
    fontWeight: '800',
    color: PaperColors.ink,
  },
  destructiveText: {
    color: PaperColors.error,
  },
  actionDivider: {
    height: 1,
    backgroundColor: PaperColors.border,
    marginVertical: 4,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  colorChipText: {
    fontWeight: '800',
    color: PaperColors.ink,
  },
  modalInput: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    padding: 12,
    backgroundColor: PaperColors.white,
    color: PaperColors.ink,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },

  trayRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  trayCard: {
    backgroundColor: PaperColors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: 'rgba(46,42,39,0.10)',
    gap: 12,
  },
  trayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trayTitle: {
    fontWeight: '900',
    color: PaperColors.ink,
    fontSize: 16,
  },
  trayClose: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  trayCloseText: {
    fontWeight: '900',
    color: PaperColors.ink,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stickerItem: {
    width: '22%',
    minWidth: 74,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: PaperColors.white,
    borderWidth: 1,
    borderColor: PaperColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stickerEmoji: {
    fontSize: 26,
  },
  stickerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: PaperColors.ink,
    opacity: 0.7,
  },
});
