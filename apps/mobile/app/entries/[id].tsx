import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { getEntryById, type TimelineEntry } from '@/api/entries';
import { attachEntryMedia, requestMediaUploadUrl, updateEntryMediaPosition } from '@/api/media';
import { PaperColors } from '@/constants/paper';

function dateOnlyFromIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type EntryPhoto = NonNullable<TimelineEntry['media']>[number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function DraggablePhoto(props: {
  photo: EntryPhoto;
  stageWidth: number;
  stageHeight: number;
  photoWidth: number;
  photoHeight: number;
  isActive: boolean;
  zIndex: number;
  onActivate: (mediaId: string) => void;
  onTransformChanged: (args: { mediaId: string; x: number; y: number; scale: number }) => void;
  onTransformCommitted: (args: { mediaId: string; x: number; y: number; scale: number }) => Promise<void>;
}) {
  const {
    photo,
    stageWidth,
    stageHeight,
    photoWidth,
    photoHeight,
    isActive,
    zIndex,
    onActivate,
    onTransformChanged,
    onTransformCommitted,
  } = props;

  const pan = useRef(new Animated.ValueXY()).current;
  const start = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const resizing = useRef(false);
  const didMove = useRef(false);
  const didResize = useRef(false);

  // Keep latest stage + base photo dimensions in refs so PanResponders don't need to be recreated.
  const stageRef = useRef({ width: stageWidth, height: stageHeight });
  const baseSizeRef = useRef({ width: photoWidth, height: photoHeight });
  useEffect(() => {
    stageRef.current = { width: stageWidth, height: stageHeight };
  }, [stageWidth, stageHeight]);
  useEffect(() => {
    baseSizeRef.current = { width: photoWidth, height: photoHeight };
  }, [photoWidth, photoHeight]);

  const SCALE_MIN = 0.5;
  const SCALE_MAX = 3;
  const HANDLE_SIZE = 26;
  const HANDLE_INSET = 6;
  const [scale, setScale] = useState<number>(() => {
    const s = typeof photo.scale === 'number' ? photo.scale : 1;
    return clamp(s, SCALE_MIN, SCALE_MAX);
  });
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const renderedWidth = Math.max(20, photoWidth * scale);
  const renderedHeight = Math.max(20, photoHeight * scale);

  function getRenderedSize(forScale: number): { width: number; height: number } {
    const s = clamp(forScale, SCALE_MIN, SCALE_MAX);
    const base = baseSizeRef.current;
    return {
      width: Math.max(20, base.width * s),
      height: Math.max(20, base.height * s),
    };
  }

  function isInResizeHandle(evt: any): boolean {
    if (!isActive) return false;
    const ne = evt?.nativeEvent;
    const lx = typeof ne?.locationX === 'number' ? ne.locationX : null;
    const ly = typeof ne?.locationY === 'number' ? ne.locationY : null;
    if (lx === null || ly === null) return false;

    const size = getRenderedSize(scaleRef.current);
    const minX = size.width - (HANDLE_INSET + HANDLE_SIZE);
    const minY = size.height - (HANDLE_INSET + HANDLE_SIZE);
    return lx >= minX && ly >= minY;
  }

  function getBounds(forScale: number): { maxX: number; maxY: number } {
    const s = clamp(forScale, SCALE_MIN, SCALE_MAX);
    const stage = stageRef.current;
    const base = baseSizeRef.current;
    const w = Math.max(20, base.width * s);
    const h = Math.max(20, base.height * s);
    return {
      maxX: Math.max(0, stage.width - w),
      maxY: Math.max(0, stage.height - h),
    };
  }

  // Sync animated position from persisted normalized x/y (or defaults).
  useEffect(() => {
    if (dragging.current || resizing.current) return;
    const xNorm = typeof photo.x === 'number' ? clamp(photo.x, 0, 1) : 0;
    const yNorm = typeof photo.y === 'number' ? clamp(photo.y, 0, 1) : 0;
    const { maxX, maxY } = getBounds(scaleRef.current);
    pan.setValue({ x: xNorm * maxX, y: yNorm * maxY });
  }, [photo.id, photo.x, photo.y, pan]);

  useEffect(() => {
    if (dragging.current || resizing.current) return;
    const next = clamp(typeof photo.scale === 'number' ? photo.scale : 1, SCALE_MIN, SCALE_MAX);
    setScale(next);
  }, [photo.id, photo.scale]);

  function getPanValue(): { x: number; y: number } {
    return {
      x: ((pan.x as any).__getValue?.() ?? 0) as number,
      y: ((pan.y as any).__getValue?.() ?? 0) as number,
    };
  }

  function clampPanToStage(forScale: number) {
    const { maxX, maxY } = getBounds(forScale);
    const cur = getPanValue();
    const xPx = clamp(cur.x, 0, maxX);
    const yPx = clamp(cur.y, 0, maxY);
    if (xPx !== cur.x || yPx !== cur.y) {
      pan.setValue({ x: xPx, y: yPx });
    }
  }

  function computeNormalized(forScale: number): { x: number; y: number } {
    const { maxX, maxY } = getBounds(forScale);
    const cur = getPanValue();
    const xPx = clamp(cur.x, 0, maxX);
    const yPx = clamp(cur.y, 0, maxY);
    return {
      x: maxX === 0 ? 0 : xPx / maxX,
      y: maxY === 0 ? 0 : yPx / maxY,
    };
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          // Allows tap-to-select without waiting for movement.
          return true;
        },
        onStartShouldSetPanResponderCapture: (evt) => {
          // If the user is touching the resize handle, let the resize responder win.
          return !isInResizeHandle(evt);
        },
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onMoveShouldSetPanResponderCapture: (evt, gesture) => {
          if (isInResizeHandle(evt)) return false;
          return Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2;
        },
        onPanResponderGrant: () => {
          if (resizing.current) return;
          onActivate(photo.id);
          dragging.current = true;
          didMove.current = false;
          start.current = {
            x: getPanValue().x,
            y: getPanValue().y,
          };
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragging.current) return;
          const { maxX, maxY } = getBounds(scaleRef.current);
          const nextX = clamp(start.current.x + gesture.dx, 0, maxX);
          const nextY = clamp(start.current.y + gesture.dy, 0, maxY);
          pan.setValue({ x: nextX, y: nextY });
          didMove.current = true;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {
          dragging.current = false;
          didMove.current = false;
        },
        onPanResponderRelease: async () => {
          dragging.current = false;

          // Tap-to-select should not trigger a save.
          if (!didMove.current && !didResize.current) {
            didMove.current = false;
            return;
          }

          const nextScale = clamp(scaleRef.current, SCALE_MIN, SCALE_MAX);
          clampPanToStage(nextScale);
          const { x, y } = computeNormalized(nextScale);
          onTransformChanged({ mediaId: photo.id, x, y, scale: nextScale });
          await onTransformCommitted({ mediaId: photo.id, x, y, scale: nextScale });

          didMove.current = false;
          didResize.current = false;
        },
      }),
    // Only depends on the stable identity. Bounds are read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photo.id]
  );

  const resizeStart = useRef({ scale: 1, x: 0, y: 0 });

  async function commitTransform(nextScale: number): Promise<void> {
    const s = clamp(nextScale, SCALE_MIN, SCALE_MAX);
    clampPanToStage(s);
    const { x, y } = computeNormalized(s);
    onTransformChanged({ mediaId: photo.id, x, y, scale: s });
    await onTransformCommitted({ mediaId: photo.id, x, y, scale: s });
  }

  function onResizePointerDown(evt: any) {
    // Web-only: React Native Web can route pointer events differently than PanResponder,
    // and the parent PanResponder can easily steal the gesture. Pointer capture is more reliable.
    if (Platform.OS !== 'web') return;
    if (!isActive) return;

    try {
      evt?.stopPropagation?.();
      evt?.preventDefault?.();
    } catch {
      // ignore
    }

    onActivate(photo.id);
    resizing.current = true;
    didResize.current = false;

    const startClientX = evt?.clientX ?? evt?.nativeEvent?.clientX;
    const startClientY = evt?.clientY ?? evt?.nativeEvent?.clientY;
    const startScale = scaleRef.current;
    resizeStart.current = { scale: startScale, x: 0, y: 0 };

    const move = (e: any) => {
      if (!resizing.current) return;
      const cx = e?.clientX;
      const cy = e?.clientY;
      if (typeof cx !== 'number' || typeof cy !== 'number') return;
      if (typeof startClientX !== 'number' || typeof startClientY !== 'number') return;

      const delta = ((cx - startClientX) + (cy - startClientY)) / 2;
      const nextScale = clamp(startScale + delta / 150, SCALE_MIN, SCALE_MAX);
      setScale(nextScale);
      clampPanToStage(nextScale);
      didResize.current = true;
    };

    const up = async () => {
      if (!resizing.current) return;
      resizing.current = false;
      try {
        await commitTransform(scaleRef.current);
      } finally {
        didResize.current = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 1 || Math.abs(gesture.dy) > 1,
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => Math.abs(gesture.dx) > 1 || Math.abs(gesture.dy) > 1,
        onPanResponderGrant: () => {
          onActivate(photo.id);
          resizing.current = true;
          didResize.current = false;
          const cur = getPanValue();
          resizeStart.current = {
            scale: scaleRef.current,
            x: cur.x,
            y: cur.y,
          };
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!resizing.current) return;
          // A simple feel-good scaler: dragging the corner ~150px roughly adds 1.0 scale.
          const delta = (gesture.dx + gesture.dy) / 2;
          const nextScale = clamp(resizeStart.current.scale + delta / 150, SCALE_MIN, SCALE_MAX);
          setScale(nextScale);

          // Keep the photo within bounds as it grows/shrinks.
          clampPanToStage(nextScale);
          didResize.current = true;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {
          resizing.current = false;
          didResize.current = false;
        },
        onPanResponderRelease: async () => {
          resizing.current = false;
          await commitTransform(scaleRef.current);

          didResize.current = false;
        },
      }),
    // Only depends on stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photo.id]
  );

  return (
    <Animated.View
      style={[
        styles.draggablePhoto,
        {
          width: renderedWidth,
          height: renderedHeight,
          transform: pan.getTranslateTransform(),
          zIndex,
        },
      ]}
    >
      <View style={styles.draggablePhotoHitbox} {...panResponder.panHandlers}>
        <Image source={{ uri: photo.url }} style={styles.draggablePhotoImage} resizeMode="cover" />

        {isActive ? (
          <View
            style={styles.resizeHandle}
            {...(Platform.OS === 'web' ? { onPointerDown: onResizePointerDown } : resizeResponder.panHandlers)}
          >
            <View style={styles.resizeHandleMark} />
            <View style={[styles.resizeHandleMark, { opacity: 0.55 }]} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function EntryDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => {
    const raw = params.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' ? v : null;
  }, [params.id]);

  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const [photoStageSize, setPhotoStageSize] = useState<{ width: number; height: number } | null>(null);
  const [savingPosition, setSavingPosition] = useState<string | null>(null);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const e = await getEntryById(id);
        setEntry(e);
      } catch (e: unknown) {
        setEntry(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function refreshEntry() {
    if (!id) return;
    const e = await getEntryById(id);
    setEntry(e);
  }

  function onPhotoStageLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setPhotoStageSize({ width, height });
  }

  async function pickAndAttachPhoto() {
    if (!entry) return;
    if (!entry.relationshipId) {
      setUploadStatus('This entry is missing relationshipId; refresh and try again.');
      return;
    }
    if (uploading) return;

    setUploading(true);
    setUploadStatus(null);

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setUploadStatus('Photos permission not granted.');
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
        setUploadStatus('No image selected.');
        return;
      }

      const width = typeof asset.width === 'number' ? asset.width : null;
      const height = typeof asset.height === 'number' ? asset.height : null;
      if (!width || !height) {
        setUploadStatus('Could not determine image size.');
        return;
      }

      const contentType = typeof asset.mimeType === 'string' ? asset.mimeType : undefined;

      const { uploadUrl, blobKey } = await requestMediaUploadUrl({
        relationshipId: entry.relationshipId,
        contentType,
      });

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

      await attachEntryMedia({
        entryId: entry.id,
        blobKey,
        kind: 'photo',
        width,
        height,
      });

      // Refresh so the new photo appears immediately.
      await refreshEntry();

      setUploadStatus('Photo attached.');
    } catch (e: unknown) {
      setUploadStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  if (!id) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Entry' }} />
        <Text style={styles.error}>Missing entry id.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Entry' }} />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Stack.Screen options={{ title: 'Memory' }} />

      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Memory</Text>
        </View>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        {entry ? (
          <View style={styles.card}>
            <Text style={styles.muted}>Date</Text>
            <Text style={styles.valueStrong}>{dateOnlyFromIso(entry.occurredAt)}</Text>

            <Text style={[styles.muted, { marginTop: 10 }]}>Title</Text>
            <Text style={styles.entryTitle}>{entry.title}</Text>

            <Text style={[styles.muted, { marginTop: 10 }]}>Notes</Text>
            {entry.body ? <Text style={styles.body}>{entry.body}</Text> : <Text style={styles.muted}>(none)</Text>}

            <Text style={[styles.muted, { marginTop: 10 }]}>Photos</Text>
            {Array.isArray(entry.media) && entry.media.some((m) => m.kind === 'photo') ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.mutedSmall}>Drag photos to reposition. Positions save when you release.</Text>
                <Text style={styles.mutedSmall}>Drag the bottom-right corner to resize.</Text>

                <View style={styles.photoStage} onLayout={onPhotoStageLayout}>
                  {photoStageSize
                    ? entry.media
                        .filter((m) => m.kind === 'photo' && typeof m.url === 'string' && m.url.length > 0)
                        .map((m) => {
                          const ratio =
                            typeof m.width === 'number' && typeof m.height === 'number' && m.width > 0 && m.height > 0
                              ? m.width / m.height
                              : 4 / 3;

                          const photoWidth = 140;
                          const photoHeight = clamp(photoWidth / ratio, 80, 190);

                          const isActive = activeMediaId === m.id;
                          const zIndex = isActive ? 1000 : 1;

                          return (
                            <DraggablePhoto
                              key={m.id}
                              photo={m as any}
                              stageWidth={photoStageSize.width}
                              stageHeight={photoStageSize.height}
                              photoWidth={photoWidth}
                              photoHeight={photoHeight}
                              isActive={isActive}
                              zIndex={zIndex}
                              onActivate={(mediaId) => setActiveMediaId(mediaId)}
                              onTransformChanged={({ mediaId, x, y, scale }) => {
                                setEntry((prev) => {
                                  if (!prev?.media) return prev;
                                  return {
                                    ...prev,
                                    media: prev.media.map((mm) => (mm.id === mediaId ? { ...mm, x, y, scale } : mm)),
                                  };
                                });
                              }}
                              onTransformCommitted={async ({ mediaId, x, y, scale }) => {
                                if (!entry) return;
                                setSavingPosition(mediaId);
                                try {
                                  await updateEntryMediaPosition({ entryId: entry.id, mediaId, x, y, scale });
                                } finally {
                                  setSavingPosition((cur) => (cur === mediaId ? null : cur));
                                }
                              }}
                            />
                          );
                        })
                    : null}
                </View>

                {savingPosition ? <Text style={styles.mutedSmall}>Saving position…</Text> : null}
              </View>
            ) : (
              <Text style={styles.muted}>(none)</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void pickAndAttachPhoto()}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  (pressed || uploading) && styles.buttonPressed,
                  uploading && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.buttonText}>{uploading ? 'Uploading…' : 'Attach photo'}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/entries/edit/[id]', params: { id: entry.id } })}
                style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Edit</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Back</Text>
              </Pressable>
            </View>

            {uploadStatus ? <Text style={styles.muted}>{uploadStatus}</Text> : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: PaperColors.sand,
  },
  page: {
    flex: 1,
    backgroundColor: PaperColors.sand,
  },
  pageContent: {
    padding: 18,
  },
  paper: {
    backgroundColor: PaperColors.paper,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    gap: 12,
  },
  header: {
    gap: 6,
  },
  kicker: {
    color: PaperColors.ink,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    color: PaperColors.ink,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  card: {
    backgroundColor: PaperColors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PaperColors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: 8,
  },
  muted: {
    color: PaperColors.ink,
    opacity: 0.65,
  },
  valueStrong: {
    color: PaperColors.ink,
    fontWeight: '800',
    opacity: 0.95,
  },
  entryTitle: {
    color: PaperColors.ink,
    fontWeight: '900',
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.85,
    lineHeight: 20,
  },
  mutedSmall: {
    color: PaperColors.ink,
    opacity: 0.55,
    fontSize: 12,
    lineHeight: 16,
  },
  photoStage: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
  },
  draggablePhoto: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.12)',
    backgroundColor: PaperColors.white,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  draggablePhotoHitbox: {
    flex: 1,
  },
  draggablePhotoImage: {
    width: '100%',
    height: '100%',
  },
  resizeHandle: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.25)',
    backgroundColor: 'rgba(250, 248, 244, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  resizeHandleMark: {
    width: 12,
    height: 2,
    backgroundColor: 'rgba(46,42,39,0.55)',
    transform: [{ rotate: '-45deg' }],
    borderRadius: 2,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  primaryButton: {
    backgroundColor: PaperColors.sage,
  },
  secondaryButton: {
    backgroundColor: PaperColors.lavender,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '800',
    color: PaperColors.ink,
  },
  error: {
    color: PaperColors.error,
  },
});
