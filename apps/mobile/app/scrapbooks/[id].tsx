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
  ScrollView,
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
  createScrapbookPageSticker,
  deleteScrapbookPageSticker,
  listScrapbookPageStickers,
  patchScrapbookPageSticker,
  type ScrapbookPageSticker,
  type ScrapbookStickerKind,
} from '@/api/scrapbookStickers';
import {
  createScrapbookPageText,
  deleteScrapbookPageText,
  listScrapbookPageTexts,
  patchScrapbookPageText,
  type ScrapbookPageText,
  type ScrapbookTextFont,
} from '@/api/scrapbookTexts';
import { MemoriesCanvas, type MemoryPhoto } from '@/components/memories/MemoriesCanvas';
import { getStickerBaseSizePx, StickersLayer, stickerEmoji } from '@/components/scrapbook/StickersLayer';
import { getTextBaseSizePx, TextLayer } from '@/components/scrapbook/TextLayer';
import { PaperColors } from '@/constants/paper';
import { containA4Rect } from '@/lib/layout/a4';
import { listMyRelationships, type RelationshipMember } from '@/api/relationships';
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

const TEXT_FONT_OPTIONS: readonly { font: ScrapbookTextFont; label: string }[] = [
  { font: 'hand', label: 'Hand' },
  { font: 'justAnotherHand', label: 'Just Another Hand' },
  { font: 'script', label: 'Script' },
  { font: 'marker', label: 'Marker' },
  { font: 'print', label: 'Print' },
];

const TEXT_COLOR_OPTIONS: readonly { color: string; label: string }[] = [
  { color: '#2E2A27', label: 'Ink' },
  { color: '#B23A48', label: 'Red' },
  { color: '#2A6F97', label: 'Blue' },
  { color: '#2D6A4F', label: 'Green' },
  { color: '#6D597A', label: 'Purple' },
  { color: '#000000', label: 'Black' },
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
  const [relationshipMembersByUserId, setRelationshipMembersByUserId] = useState<Record<string, RelationshipMember>>({});
  const [scrapbookDetails, setScrapbookDetails] = useState<ScrapbookDetails | null>(null);
  const [pages, setPages] = useState<ScrapbookPage[]>([]);
  const [pageCursor, setPageCursor] = useState(0);
  const [creatingPage, setCreatingPage] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [stickersByPageId, setStickersByPageId] = useState<Record<string, ScrapbookPageSticker[]>>({});
  const [stickersLoadingPageIds, setStickersLoadingPageIds] = useState<Record<string, boolean>>({});

  const [textsByPageId, setTextsByPageId] = useState<Record<string, ScrapbookPageText[]>>({});
  const [textsLoadingPageIds, setTextsLoadingPageIds] = useState<Record<string, boolean>>({});

  const [stickerTrayOpen, setStickerTrayOpen] = useState(false);
  const [stickerActionsFor, setStickerActionsFor] = useState<{ pageId: string; stickerId: string } | null>(null);
  const [confirmStickerDeleteFor, setConfirmStickerDeleteFor] = useState<{ pageId: string; stickerId: string } | null>(null);
  const [activeStickerFor, setActiveStickerFor] = useState<{ pageId: string; stickerId: string } | null>(null);
  const [stickerActionsPopoverHeight, setStickerActionsPopoverHeight] = useState<number>(260);

  const [textActionsFor, setTextActionsFor] = useState<{ pageId: string; textId: string } | null>(null);
  const [confirmTextDeleteFor, setConfirmTextDeleteFor] = useState<{ pageId: string; textId: string } | null>(null);
  const [activeTextFor, setActiveTextFor] = useState<{ pageId: string; textId: string } | null>(null);
  const [textEditorFor, setTextEditorFor] = useState<{ pageId: string; textId: string } | null>(null);
  const [textDraft, setTextDraft] = useState<{ text: string; font: ScrapbookTextFont; color: string } | null>(null);
  const [textDraftOriginal, setTextDraftOriginal] = useState<{ pageId: string; textId: string; text: string; font: ScrapbookTextFont; color: string } | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState<{
    date: string;
    place: string;
    placeId: string | null;
    moodTags: string[];
    review: string;
  } | null>(null);

  const [canvasFrameSize, setCanvasFrameSize] = useState<{ width: number; height: number } | null>(null);

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
      setStickersByPageId({});
      setStickersLoadingPageIds({});
      setTextsByPageId({});
      setTextsLoadingPageIds({});
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

  useEffect(() => {
    if (!relationshipId) {
      setRelationshipMembersByUserId({});
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rels = await listMyRelationships();
        const rel = rels.find((r) => r.relationshipId === relationshipId) ?? null;
        const map: Record<string, RelationshipMember> = {};
        for (const m of rel?.members ?? []) map[m.userId] = m;
        if (!cancelled) setRelationshipMembersByUserId(map);
      } catch {
        // Non-fatal: attribution falls back to short ids.
        if (!cancelled) setRelationshipMembersByUserId({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relationshipId]);

  const contributorLabelForUserId = useCallback(
    (userId: string | null | undefined): string => {
      if (!userId) return 'Unknown';
      const member = relationshipMembersByUserId[userId];
      if (member?.email) return member.email;
      // Fallback: show a short suffix of the UUID.
      const parts = String(userId).split('-');
      const suffix = parts[parts.length - 1];
      return suffix && suffix.length >= 6 ? `User …${suffix.slice(-6)}` : 'Unknown';
    },
    [relationshipMembersByUserId]
  );

  const contributorInitialsForUserId = useCallback(
    (userId: string | null | undefined): string => {
      const label = contributorLabelForUserId(userId);
      const at = label.indexOf('@');
      const base = (at >= 0 ? label.slice(0, at) : label).trim();
      if (!base) return '?';

      const tokens = base
        .split(/[^a-zA-Z0-9]+/g)
        .map((t) => t.trim())
        .filter(Boolean);

      const first = tokens[0] ?? base;
      const second = tokens.length >= 2 ? tokens[1] : '';

      const a = first[0] ?? '?';
      const b = second[0] ?? (first.length >= 2 ? first[1] : '');
      return `${a}${b}`.toUpperCase();
    },
    [contributorLabelForUserId]
  );

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

  const loadTextsForPage = useCallback(
    async (pageId: string) => {
      if (!scrapbookId) return;
      setTextsLoadingPageIds((prev) => ({ ...prev, [pageId]: true }));
      try {
        const texts = await listScrapbookPageTexts({ scrapbookId, pageId });
        setTextsByPageId((prev) => ({ ...prev, [pageId]: texts }));
      } catch (e: unknown) {
        // Non-fatal: allow the page to render without texts.
        setStatus((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
      } finally {
        setTextsLoadingPageIds((prev) => ({ ...prev, [pageId]: false }));
      }
    },
    [scrapbookId]
  );

  useEffect(() => {
    if (!currentPage || !scrapbookId) return;
    if (stickersByPageId[currentPage.id]) return;
    if (stickersLoadingPageIds[currentPage.id]) return;
    void loadStickersForPage(currentPage.id);
  }, [currentPage, loadStickersForPage, scrapbookId, stickersByPageId, stickersLoadingPageIds]);

  useEffect(() => {
    if (!currentPage || !scrapbookId) return;
    if (textsByPageId[currentPage.id]) return;
    if (textsLoadingPageIds[currentPage.id]) return;
    void loadTextsForPage(currentPage.id);
  }, [currentPage, loadTextsForPage, scrapbookId, textsByPageId, textsLoadingPageIds]);

  const updateCursorFromOffsetX = useCallback(
    (offsetX: number) => {
      if (!Number.isFinite(offsetX)) return;
      if (windowWidth <= 0) return;
      const raw = Math.round(offsetX / windowWidth);
      const idx = Math.max(0, Math.min(raw, Math.max(0, pages.length - 1)));
      setPageCursor((cur) => (cur === idx ? cur : idx));
      setStickerActionsFor(null);
      setConfirmStickerDeleteFor(null);
      setActiveStickerFor(null);
      setTextActionsFor(null);
      setConfirmTextDeleteFor(null);
      setActiveTextFor(null);
      setTextEditorFor(null);
      setTextDraft(null);
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

  const onTextTransformChanged = useCallback(
    (args: { pageId: string; textId: string; x: number; y: number; scale: number }) => {
      setTextsByPageId((prev) => {
        const pageTexts = prev[args.pageId];
        if (!pageTexts) return prev;
        const idx = pageTexts.findIndex((t) => t.id === args.textId);
        if (idx < 0) return prev;
        const next = [...pageTexts];
        next[idx] = { ...next[idx], x: args.x, y: args.y, scale: args.scale };
        return { ...prev, [args.pageId]: next };
      });
    },
    []
  );

  const onTextTransformCommitted = useCallback(
    async (args: { pageId: string; textId: string; x: number; y: number; scale: number }) => {
      if (!scrapbookId) return;
      try {
        const updated = await patchScrapbookPageText({
          scrapbookId,
          pageId: args.pageId,
          textId: args.textId,
          x: args.x,
          y: args.y,
          scale: args.scale,
        });

        setTextsByPageId((prev) => {
          const pageTexts = prev[args.pageId];
          if (!pageTexts) return prev;
          return { ...prev, [args.pageId]: pageTexts.map((t) => (t.id === updated.id ? updated : t)) };
        });
      } catch (e: unknown) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [scrapbookId]
  );

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
    setActiveStickerFor(null);
    setTextActionsFor(null);
    setConfirmTextDeleteFor(null);
    setActiveTextFor(null);
    setTextEditorFor(null);
    setTextDraft(null);
    setTextDraftOriginal(null);
  }, [scrapbookDetails]);

  const applyTextDraftPreview = useCallback((args: { pageId: string; textId: string; patch: Partial<Pick<ScrapbookPageText, 'text' | 'font' | 'color'>> }) => {
    setTextsByPageId((prev) => {
      const pageTexts = prev[args.pageId];
      if (!pageTexts) return prev;
      const idx = pageTexts.findIndex((t) => t.id === args.textId);
      if (idx < 0) return prev;
      const next = [...pageTexts];
      next[idx] = { ...next[idx], ...args.patch };
      return { ...prev, [args.pageId]: next };
    });
  }, []);

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

  const patchTextOptimistic = useCallback(
    (args: {
      pageId: string;
      textId: string;
      patch: Partial<Pick<ScrapbookPageText, 'text' | 'font' | 'color' | 'x' | 'y' | 'scale' | 'rotation'>>;
    }) => {
      if (!scrapbookId) return;

      const previous = (textsByPageId[args.pageId] ?? []).find((t) => t.id === args.textId) ?? null;
      setTextsByPageId((prev) => {
        const pageTexts = prev[args.pageId];
        if (!pageTexts) return prev;
        return {
          ...prev,
          [args.pageId]: pageTexts.map((t) => (t.id === args.textId ? { ...t, ...args.patch } : t)),
        };
      });

      void (async () => {
        try {
          const updated = await patchScrapbookPageText({
            scrapbookId,
            pageId: args.pageId,
            textId: args.textId,
            ...(typeof args.patch.text === 'string' ? { text: args.patch.text } : {}),
            ...(typeof args.patch.font === 'string' ? { font: args.patch.font } : {}),
            ...(typeof args.patch.color === 'string' ? { color: args.patch.color } : {}),
            ...(typeof args.patch.x === 'number' ? { x: args.patch.x } : {}),
            ...(typeof args.patch.y === 'number' ? { y: args.patch.y } : {}),
            ...(typeof args.patch.scale === 'number' ? { scale: args.patch.scale } : {}),
            ...(typeof args.patch.rotation === 'number' ? { rotation: args.patch.rotation } : {}),
          });

          setTextsByPageId((prev) => {
            const pageTexts = prev[args.pageId];
            if (!pageTexts) return prev;
            return { ...prev, [args.pageId]: pageTexts.map((t) => (t.id === updated.id ? updated : t)) };
          });
        } catch (e: unknown) {
          if (previous) {
            setTextsByPageId((prev) => {
              const pageTexts = prev[args.pageId];
              if (!pageTexts) return prev;
              return { ...prev, [args.pageId]: pageTexts.map((t) => (t.id === args.textId ? previous : t)) };
            });
          }
          setStatus(e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [scrapbookId, textsByPageId]
  );

  const deleteText = useCallback(
    async (args: { pageId: string; textId: string }) => {
      if (!scrapbookId) return;

      const previous = textsByPageId[args.pageId] ?? null;
      setTextsByPageId((prev) => {
        const pageTexts = prev[args.pageId];
        if (!pageTexts) return prev;
        return { ...prev, [args.pageId]: pageTexts.filter((t) => t.id !== args.textId) };
      });

      try {
        await deleteScrapbookPageText({ scrapbookId, pageId: args.pageId, textId: args.textId });
      } catch (e: unknown) {
        if (previous) setTextsByPageId((prev) => ({ ...prev, [args.pageId]: previous }));
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [scrapbookId, textsByPageId]
  );

  const onTextPressed = useCallback((args: { pageId: string; textId: string }) => {
    setTextActionsFor(args);
    setConfirmTextDeleteFor(null);
  }, []);

  const renderTextActionsPopover = useCallback(
    (args: { pageId: string; stageWidth: number; stageHeight: number }) => {
      const target = textActionsFor;
      if (!target) return null;
      if (target.pageId !== args.pageId) return null;

      const confirmingDelete =
        !!confirmTextDeleteFor &&
        confirmTextDeleteFor.pageId === target.pageId &&
        confirmTextDeleteFor.textId === target.textId;

      const textItem = (textsByPageId[target.pageId] ?? []).find((t) => t.id === target.textId);
      if (!textItem) return null;

      const scale = typeof textItem.scale === 'number' ? textItem.scale : 1;
      const base = getTextBaseSizePx(args.stageWidth);
      const sizeW = base.width * Math.min(Math.max(scale, 0.25), 6);
      const sizeH = base.height * Math.min(Math.max(scale, 0.25), 6);

      const maxX = Math.max(0, args.stageWidth - sizeW);
      const maxY = Math.max(0, args.stageHeight - sizeH);
      const leftPx = (typeof textItem.x === 'number' ? textItem.x : 0) * maxX;
      const topPx = (typeof textItem.y === 'number' ? textItem.y : 0) * maxY;

      const MENU_W = 260;
      const MENU_H = confirmingDelete ? 260 : 240;
      const desiredLeft = leftPx + sizeW - MENU_W;
      const desiredTop = topPx - MENU_H - 8;
      const left = Math.max(8, Math.min(desiredLeft, Math.max(8, args.stageWidth - MENU_W - 8)));
      const top = Math.max(8, Math.min(desiredTop, Math.max(8, args.stageHeight - MENU_H - 8)));

      return (
        <View style={[StyleSheet.absoluteFill, styles.popoverLayer]} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setTextActionsFor(null);
              setConfirmTextDeleteFor(null);
            }}
          />

          <View
            style={[
              styles.popover,
              {
                left,
                top,
                width: MENU_W,
                maxHeight: Math.max(120, args.stageHeight - 16),
              },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.popoverScrollContent}>
              <Text style={styles.actionSectionLabel}>Text</Text>

              <Text style={styles.attributionLine}>Placed by: {contributorLabelForUserId(textItem.createdByUserId)}</Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setTextActionsFor(null);
                  setConfirmTextDeleteFor(null);
                  const draft = {
                    text: typeof textItem.text === 'string' ? textItem.text : '',
                    font: (typeof textItem.font === 'string' ? (textItem.font as ScrapbookTextFont) : 'hand') as ScrapbookTextFont,
                    color: typeof textItem.color === 'string' ? textItem.color : '#2E2A27',
                  };
                  setTextEditorFor({ pageId: target.pageId, textId: target.textId });
                  setTextDraft(draft);
                  setTextDraftOriginal({ pageId: target.pageId, textId: target.textId, ...draft });
                }}
                style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.popoverRowText}>Edit</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const cur = typeof textItem.rotation === 'number' ? textItem.rotation : 0;
                  patchTextOptimistic({ pageId: target.pageId, textId: target.textId, patch: { rotation: cur + 15 } });
                }}
                style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.popoverRowText}>Rotate +15°</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const cur = typeof textItem.rotation === 'number' ? textItem.rotation : 0;
                  patchTextOptimistic({ pageId: target.pageId, textId: target.textId, patch: { rotation: cur - 15 } });
                }}
                style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.popoverRowText}>Rotate -15°</Text>
              </Pressable>

              <View style={styles.colorRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const cur = typeof textItem.scale === 'number' ? textItem.scale : 1;
                    const next = Math.min(6, cur * 1.15);
                    patchTextOptimistic({ pageId: target.pageId, textId: target.textId, patch: { scale: next } });
                  }}
                  style={({ pressed }) => [styles.colorChip, pressed && styles.actionRowPressed]}
                >
                  <Text style={styles.colorChipText}>Bigger</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const cur = typeof textItem.scale === 'number' ? textItem.scale : 1;
                    const next = Math.max(0.25, cur / 1.15);
                    patchTextOptimistic({ pageId: target.pageId, textId: target.textId, patch: { scale: next } });
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
                    void deleteText(target);
                    setTextActionsFor(null);
                    setConfirmTextDeleteFor(null);
                    setActiveTextFor(null);
                    return;
                  }
                  setConfirmTextDeleteFor(target);
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
                  onPress={() => setConfirmTextDeleteFor(null)}
                  style={({ pressed }) => [styles.popoverRow, pressed && styles.actionRowPressed]}
                >
                  <Text style={styles.popoverRowText}>Cancel delete</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      );
    },
    [
      contributorLabelForUserId,
      confirmTextDeleteFor,
      deleteText,
      patchTextOptimistic,
      textActionsFor,
      textsByPageId,
    ]
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

  const onStickerPressed = useCallback((args: { pageId: string; stickerId: string }) => {
    setStickerActionsFor(args);
    setConfirmStickerDeleteFor(null);
  }, []);

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
      const base = getStickerBaseSizePx(args.stageWidth);
      const size = base * Math.min(Math.max(scale, 0.25), 4);

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

          <View
            style={[
              styles.popover,
              {
                left,
                top,
                width: MENU_W,
                maxHeight: Math.max(120, args.stageHeight - 16),
              },
            ]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (!Number.isFinite(h)) return;
              if (Math.abs(h - stickerActionsPopoverHeight) > 1) {
                setStickerActionsPopoverHeight(h);
              }
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.popoverScrollContent}>
              <Text style={styles.actionSectionLabel}>Sticker {emoji}</Text>

              <Text style={styles.attributionLine}>Placed by: {contributorLabelForUserId(sticker.createdByUserId)}</Text>

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
            </ScrollView>
          </View>
        </View>
      );
    },
    [
      contributorLabelForUserId,
      confirmStickerDeleteFor,
      deleteSticker,
      patchStickerOptimistic,
      stickerActionsFor,
      stickerActionsPopoverHeight,
      stickersByPageId,
    ]
  );


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

  const addTextToCurrentPage = useCallback(async () => {
    if (!scrapbookId || !currentPage) return;
    setStatus(null);
    try {
      const created = await createScrapbookPageText({
        scrapbookId,
        pageId: currentPage.id,
        text: 'Text',
        font: 'hand',
        color: '#2E2A27',
        x: 0.1,
        y: 0.15,
        scale: 1,
        rotation: 0,
      });

      setTextsByPageId((prev) => {
        const existing = prev[currentPage.id] ?? [];
        return { ...prev, [currentPage.id]: [...existing, created] };
      });

      setActiveTextFor({ pageId: currentPage.id, textId: created.id });
      setTextEditorFor({ pageId: currentPage.id, textId: created.id });
      setTextDraft({ text: created.text ?? 'Text', font: created.font ?? 'hand', color: created.color ?? '#2E2A27' });
      setTextDraftOriginal({
        pageId: currentPage.id,
        textId: created.id,
        text: created.text ?? 'Text',
        font: created.font ?? 'hand',
        color: created.color ?? '#2E2A27',
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [currentPage, scrapbookId]);

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
            createdByUserId: m.createdByUserId,
            width: m.width,
            height: m.height,
            x: m.x,
            y: m.y,
            scale: m.scale,
          }));
          const stickers = stickersByPageId[item.id] ?? [];

          return (
            <View style={[styles.pageViewport, { width: windowWidth, height: '100%' }]}>
              <View style={styles.paperPage}>
                <Text style={styles.pageTitle}>Page {index + 1}</Text>

                <View
                  style={styles.canvasFrame}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
                    if (width <= 0 || height <= 0) return;
                    setCanvasFrameSize({ width, height });
                  }}
                >
                  {(() => {
                    const rect = canvasFrameSize
                      ? containA4Rect({
                          containerWidth: canvasFrameSize.width,
                          containerHeight: canvasFrameSize.height,
                        })
                      : null;
                    const a4Style = rect
                      ? { width: rect.width, height: rect.height, alignSelf: 'center' as const }
                      : { flex: 1 };

                    return (
                      <MemoriesCanvas
                        photos={photos}
                        style={a4Style}
                        getContributorInitials={contributorInitialsForUserId}
                        onPhotoPressed={(mediaId) => {
                          const media = item.media.find((m) => m.id === mediaId) ?? null;
                          if (!media) return;
                          const placedBy = contributorLabelForUserId(media.createdByUserId);
                          setStatus(`Photo placed by ${placedBy}`);

                          // Auto-clear this transient message unless something else has overwritten it.
                          setTimeout(() => {
                            setStatus((cur) => {
                              if (typeof cur === 'string' && cur.startsWith('Photo placed by ')) return null;
                              return cur;
                            });
                          }, 2500);
                        }}
                        onStagePress={() => {
                          setActiveStickerFor(null);
                          setStickerActionsFor(null);
                          setConfirmStickerDeleteFor(null);
                          setActiveTextFor(null);
                          setTextActionsFor(null);
                          setConfirmTextDeleteFor(null);
                        }}
                        onTransformChanged={onTransformChanged}
                        onTransformCommitted={onTransformCommitted}
                        renderOverlay={(stage) => (
                          <>
                            <TextLayer
                              texts={textsByPageId[item.id] ?? []}
                              stageWidth={stage.width}
                              stageHeight={stage.height}
                              activeTextId={activeTextFor?.pageId === item.id ? activeTextFor.textId : null}
                              getContributorInitials={contributorInitialsForUserId}
                              onActiveTextIdChange={(textId) => setActiveTextFor(textId ? { pageId: item.id, textId } : null)}
                              onTextPressed={(textId) => onTextPressed({ pageId: item.id, textId })}
                              onTransformChanged={({ textId, x, y, scale }) =>
                                onTextTransformChanged({ pageId: item.id, textId, x, y, scale })
                              }
                              onTransformCommitted={({ textId, x, y, scale }) =>
                                onTextTransformCommitted({ pageId: item.id, textId, x, y, scale })
                              }
                            />
                            <StickersLayer
                              stickers={stickers}
                              stageWidth={stage.width}
                              stageHeight={stage.height}
                              activeStickerId={activeStickerFor?.pageId === item.id ? activeStickerFor.stickerId : null}
                              getContributorInitials={contributorInitialsForUserId}
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
                            {renderStickerActionsPopover({ pageId: item.id, stageWidth: stage.width, stageHeight: stage.height })}
                            {renderTextActionsPopover({ pageId: item.id, stageWidth: stage.width, stageHeight: stage.height })}
                          </>
                        )}
                      />
                    );
                  })()}
                </View>

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
          <View style={[styles.pageViewport, { width: windowWidth, height: '100%' }]}>
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
            setActiveTextFor(null);
            setTextActionsFor(null);
            setConfirmTextDeleteFor(null);
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
          onPress={() => {
            setActiveStickerFor(null);
            setStickerActionsFor(null);
            setConfirmStickerDeleteFor(null);
            setActiveTextFor(null);
            setTextActionsFor(null);
            setConfirmTextDeleteFor(null);
            void addTextToCurrentPage();
          }}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            !currentPage && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>+ Text</Text>
        </Pressable>
      </View>

      <Modal
        visible={!!textEditorFor}
        transparent
        animationType="fade"
        onRequestClose={() => {
          // Treat as cancel.
          const target = textEditorFor;
          const original = textDraftOriginal;
          if (target && original && original.pageId === target.pageId && original.textId === target.textId) {
            applyTextDraftPreview({
              pageId: target.pageId,
              textId: target.textId,
              patch: { text: original.text, font: original.font, color: original.color },
            });
          }
          setTextEditorFor(null);
          setTextDraft(null);
          setTextDraftOriginal(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit text</Text>

            <TextInput
              value={textDraft?.text ?? ''}
              onChangeText={(v) => {
                const target = textEditorFor;
                setTextDraft((prev) => (prev ? { ...prev, text: v } : { text: v, font: 'hand', color: '#2E2A27' }));
                if (target) {
                  applyTextDraftPreview({ pageId: target.pageId, textId: target.textId, patch: { text: v } });
                }
              }}
              placeholder="Write something…"
              placeholderTextColor="rgba(46,42,39,0.45)"
              style={styles.modalInput}
              multiline
            />

            <View style={styles.detailsSection}>
              <Text style={styles.actionSectionLabel}>Font</Text>
              <View style={styles.colorRow}>
                {TEXT_FONT_OPTIONS.map((o) => {
                  const active = (textDraft?.font ?? 'hand') === o.font;
                  return (
                    <Pressable
                      key={o.font}
                      accessibilityRole="button"
                      onPress={() => {
                        const target = textEditorFor;
                        setTextDraft((prev) => (prev ? { ...prev, font: o.font } : prev));
                        if (target) {
                          applyTextDraftPreview({ pageId: target.pageId, textId: target.textId, patch: { font: o.font } });
                        }
                      }}
                      style={({ pressed }) => [styles.colorChip, active && styles.moodChipActive, pressed && styles.actionRowPressed]}
                    >
                      <Text style={styles.colorChipText}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.actionSectionLabel}>Color</Text>
              <View style={styles.colorRow}>
                {TEXT_COLOR_OPTIONS.map((o) => {
                  const active = (textDraft?.color ?? '#2E2A27') === o.color;
                  return (
                    <Pressable
                      key={o.color}
                      accessibilityRole="button"
                      onPress={() => {
                        const target = textEditorFor;
                        setTextDraft((prev) => (prev ? { ...prev, color: o.color } : prev));
                        if (target) {
                          applyTextDraftPreview({ pageId: target.pageId, textId: target.textId, patch: { color: o.color } });
                        }
                      }}
                      style={({ pressed }) => [styles.colorChip, active && styles.moodChipActive, pressed && styles.actionRowPressed]}
                    >
                      <Text style={styles.colorChipText}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const target = textEditorFor;
                  const original = textDraftOriginal;
                  if (target && original && original.pageId === target.pageId && original.textId === target.textId) {
                    applyTextDraftPreview({
                      pageId: target.pageId,
                      textId: target.textId,
                      patch: { text: original.text, font: original.font, color: original.color },
                    });
                  }

                  setTextEditorFor(null);
                  setTextDraft(null);
                  setTextDraftOriginal(null);
                }}
                style={({ pressed }) => [styles.modalButton, styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={!textEditorFor || !textDraft}
                onPress={() => {
                  const target = textEditorFor;
                  const draft = textDraft;
                  if (!target || !draft) return;
                  patchTextOptimistic({
                    pageId: target.pageId,
                    textId: target.textId,
                    patch: {
                      text: draft.text,
                      font: draft.font,
                      color: draft.color,
                    },
                  });
                  setTextEditorFor(null);
                  setTextDraft(null);
                  setTextDraftOriginal(null);
                }}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.primaryButton,
                  (!textEditorFor || !textDraft) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    flexGrow: 1,
    alignItems: 'stretch',
  },
  pagerList: {
    flex: 1,
    alignSelf: 'stretch',
  },
  pageViewport: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flex: 1,
    alignSelf: 'stretch',
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
    flex: 1,
    minHeight: 280,
    backgroundColor: 'rgba(46,42,39,0.04)',
  },
  canvasFrame: {
    flex: 1,
    minHeight: Platform.OS === 'web' ? 640 : 280,
    alignItems: 'center',
    justifyContent: 'center',
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
  attributionLine: {
    marginTop: 6,
    marginBottom: 10,
    color: PaperColors.ink,
    opacity: 0.7,
    fontSize: 12,
    fontWeight: '600',
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
    padding: 0,
    backgroundColor: PaperColors.paper,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 500,
    zIndex: 50000,
  },
  popoverScrollContent: {
    padding: 10,
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
