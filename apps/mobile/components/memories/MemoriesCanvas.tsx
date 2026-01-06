import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

export type MemoryPhoto = {
  id: string;
  kind: 'photo' | string;
  url: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  scale?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function DraggablePhoto(props: {
  photo: MemoryPhoto;
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
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
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

export function MemoriesCanvas(props: {
  photos: MemoryPhoto[];
  style?: StyleProp<ViewStyle>;
  basePhotoWidth?: number;
  renderOverlay?: (stage: { width: number; height: number }) => ReactNode;
  onStagePress?: () => void;
  onTransformChanged: (args: { mediaId: string; x: number; y: number; scale: number }) => void;
  onTransformCommitted: (args: { mediaId: string; x: number; y: number; scale: number }) => Promise<void>;
}) {
  const { photos, style, basePhotoWidth = 150, renderOverlay, onStagePress, onTransformChanged, onTransformCommitted } = props;

  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);

  function onStageLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setStageSize({ width, height });
  }

  return (
    <View style={[styles.stage, style]} onLayout={onStageLayout}>
      {onStagePress ? (
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={onStagePress}
        />
      ) : null}

      {stageSize
        ? photos
            .filter((m) => m.kind === 'photo' && typeof m.url === 'string' && m.url.length > 0)
            .map((m) => {
              const ratio =
                typeof m.width === 'number' && typeof m.height === 'number' && m.width > 0 && m.height > 0
                  ? m.width / m.height
                  : 4 / 3;

              const photoWidth = basePhotoWidth;
              const photoHeight = clamp(photoWidth / ratio, 80, 220);

              const isActive = activeMediaId === m.id;
              const zIndex = isActive ? 1000 : 1;

              return (
                <DraggablePhoto
                  key={m.id}
                  photo={m}
                  stageWidth={stageSize.width}
                  stageHeight={stageSize.height}
                  photoWidth={photoWidth}
                  photoHeight={photoHeight}
                  isActive={isActive}
                  zIndex={zIndex}
                  onActivate={(mediaId) => setActiveMediaId(mediaId)}
                  onTransformChanged={onTransformChanged}
                  onTransformCommitted={onTransformCommitted}
                />
              );
            })
        : null}

      {stageSize && renderOverlay ? renderOverlay(stageSize) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    height: 360,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(46,42,39,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.10)',
  },
  draggablePhoto: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  draggablePhotoHitbox: {
    flex: 1,
  },
  draggablePhotoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  resizeHandle: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(46,42,39,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  resizeHandleMark: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
