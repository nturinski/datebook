import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import type { ScrapbookPageSticker, ScrapbookStickerKind } from '@/api/scrapbookStickers';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Base sticker size is proportional to the current canvas width so the layout feels consistent across devices.
// For an A4 "paper" stage (width ~= 0.707 * height), this lands very close to the previous 72px default.
export function getStickerBaseSizePx(stageWidth: number): number {
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) return 72;
  return clamp(stageWidth * 0.22, 44, 120);
}

// Back-compat constant (previous fixed base size).
export const STICKER_BASE_SIZE = 72;

const STICKER_MIN_VISIBLE_PX = 16;

// Stickers live above photos but below sticky notes.
const STICKERS_Z_BASE = 5000;
const STICKERS_ELEVATION_BASE = 50;

type StickerBounds = {
  insideMaxX: number;
  insideMaxY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function stickerEmoji(kind: ScrapbookStickerKind): string {
  switch (kind) {
    case 'heart':
      return '❤️';
    case 'star':
      return '⭐';
    case 'smile':
      return '😊';
    case 'sparkle':
      return '✨';
    case 'flower':
      return '🌸';
    case 'sun':
      return '☀️';
    case 'moon':
      return '🌙';
    case 'cloud':
      return '☁️';
    case 'rainbow':
      return '🌈';
    case 'check':
      return '✅';
    case 'music':
      return '🎵';
    case 'coffee':
      return '☕';
    case 'camera':
      return '📷';
    case 'balloon':
      return '🎈';
    case 'gift':
      return '🎁';
    case 'party':
      return '🎉';
    case 'tape':
      return '🩹';
    case 'thumbsUp':
      return '👍';
    case 'fire':
      return '🔥';
    case 'leaf':
      return '🍃';
    default:
      return '✨';
  }
}

function DraggableSticker(props: {
  sticker: ScrapbookPageSticker;
  stageWidth: number;
  stageHeight: number;
  isActive: boolean;
  zIndex: number;
  onActivate: (stickerId: string) => void;
  onPress: (stickerId: string) => void;
  onTransformChanged: (args: { stickerId: string; x: number; y: number }) => void;
  onTransformCommitted: (args: { stickerId: string; x: number; y: number }) => Promise<void>;
}) {
  const { sticker, stageWidth, stageHeight, isActive, zIndex, onActivate, onPress, onTransformChanged, onTransformCommitted } =
    props;

  const pan = useRef(new Animated.ValueXY()).current;
  const start = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const didMove = useRef(false);

  const stageRef = useRef({ width: stageWidth, height: stageHeight });
  const scaleRef = useRef(typeof sticker.scale === 'number' ? sticker.scale : 1);

  useEffect(() => {
    stageRef.current = { width: stageWidth, height: stageHeight };
  }, [stageWidth, stageHeight]);

  useEffect(() => {
    scaleRef.current = typeof sticker.scale === 'number' ? sticker.scale : 1;
  }, [sticker.scale]);

  function getBounds(forScale: number): StickerBounds {
    const stage = stageRef.current;
    const base = getStickerBaseSizePx(stage.width);
    const size = base * clamp(forScale, 0.25, 4);

    // Old (fully-inside) range, used for normalization so existing saved stickers don't shift.
    const insideMaxX = Math.max(0, stage.width - size);
    const insideMaxY = Math.max(0, stage.height - size);

    // Allow the sticker to hang off the page while keeping at least a small corner visible.
    const visible = Math.min(STICKER_MIN_VISIBLE_PX, Math.max(6, size * 0.25));
    const minX = -Math.max(0, size - visible);
    const minY = -Math.max(0, size - visible);
    const maxX = Math.max(minX, stage.width - visible);
    const maxY = Math.max(minY, stage.height - visible);

    return { insideMaxX, insideMaxY, minX, minY, maxX, maxY };
  }

  function getPanValue(): { x: number; y: number } {
    return {
      x: ((pan.x as any).__getValue?.() ?? 0) as number,
      y: ((pan.y as any).__getValue?.() ?? 0) as number,
    };
  }

  function clampPanToStage() {
    const { minX, minY, maxX, maxY } = getBounds(scaleRef.current);
    const cur = getPanValue();
    const xPx = clamp(cur.x, minX, maxX);
    const yPx = clamp(cur.y, minY, maxY);
    if (xPx !== cur.x || yPx !== cur.y) {
      pan.setValue({ x: xPx, y: yPx });
    }
  }

  function computeNormalized(): { x: number; y: number } {
    const { insideMaxX, insideMaxY, minX, minY, maxX, maxY } = getBounds(scaleRef.current);
    const cur = getPanValue();
    const xPx = clamp(cur.x, minX, maxX);
    const yPx = clamp(cur.y, minY, maxY);
    return {
      // Backward compatible normalization: 1.0 still means "fully at the right/bottom edge".
      // Values can go <0 or >1 when hanging off the page.
      x: insideMaxX === 0 ? 0 : xPx / insideMaxX,
      y: insideMaxY === 0 ? 0 : yPx / insideMaxY,
    };
  }

  useEffect(() => {
    if (dragging.current) return;
    const xNorm = typeof sticker.x === 'number' ? sticker.x : 0;
    const yNorm = typeof sticker.y === 'number' ? sticker.y : 0;
    const { insideMaxX, insideMaxY, minX, minY, maxX, maxY } = getBounds(scaleRef.current);
    const xPx = clamp(xNorm * insideMaxX, minX, maxX);
    const yPx = clamp(yNorm * insideMaxY, minY, maxY);
    pan.setValue({ x: xPx, y: yPx });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sticker.id, sticker.x, sticker.y]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          onActivate(sticker.id);
          dragging.current = true;
          didMove.current = false;
          start.current = getPanValue();
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragging.current) return;
          const { minX, minY, maxX, maxY } = getBounds(scaleRef.current);
          const nextX = clamp(start.current.x + gesture.dx, minX, maxX);
          const nextY = clamp(start.current.y + gesture.dy, minY, maxY);
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

          if (!didMove.current) {
            onPress(sticker.id);
            return;
          }

          clampPanToStage();

          // Optional: make the tape sticker feel like it “wants” to live on corners.
          if (sticker.kind === 'tape') {
            const stage = stageRef.current;
            const scale = clamp(scaleRef.current, 0.25, 4);
            const base = getStickerBaseSizePx(stage.width);
            const size = base * scale;
            const { insideMaxX, insideMaxY } = getBounds(scale);
            const cur = getPanValue();
            const xPx = cur.x;
            const yPx = cur.y;

            const corners = [
              { x: 0, y: 0 },
              { x: insideMaxX, y: 0 },
              { x: 0, y: insideMaxY },
              { x: insideMaxX, y: insideMaxY },
            ];

            let best = corners[0];
            let bestDist = Number.POSITIVE_INFINITY;
            for (const c of corners) {
              const dx = xPx - c.x;
              const dy = yPx - c.y;
              const d = Math.hypot(dx, dy);
              if (d < bestDist) {
                bestDist = d;
                best = c;
              }
            }

            // Snap threshold scales with sticker size; cap it so small stages don’t snap too aggressively.
            const snapDistancePx = Math.min(size * 0.9, Math.min(stage.width, stage.height) * 0.25);
            if (bestDist <= snapDistancePx) {
              pan.setValue({ x: best.x, y: best.y });
            }
          }

          const { x, y } = computeNormalized();
          onTransformChanged({ stickerId: sticker.id, x, y });
          await onTransformCommitted({ stickerId: sticker.id, x, y });
          didMove.current = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sticker.id]
  );

  const scale = clamp(typeof sticker.scale === 'number' ? sticker.scale : 1, 0.25, 4);
  const base = getStickerBaseSizePx(stageWidth);
  const size = base * scale;
  const rotation = typeof sticker.rotation === 'number' ? sticker.rotation : 0;
  const emoji = stickerEmoji(sticker.kind);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.stickerContainer,
        {
          width: size,
          height: size,
          transform: [...pan.getTranslateTransform(), { rotate: `${rotation}deg` }],
          zIndex,
          elevation: isActive ? STICKERS_ELEVATION_BASE + 8 : STICKERS_ELEVATION_BASE,
        },
      ]}
    >
      <View style={[styles.sticker, isActive && styles.stickerActive]}>
        <Text selectable={false} style={[styles.stickerText, { fontSize: Math.max(28, size * 0.58) }]}>
          {emoji}
        </Text>
      </View>
    </Animated.View>
  );
}

export function StickersLayer(props: {
  stickers: ScrapbookPageSticker[];
  stageWidth: number;
  stageHeight: number;
  style?: StyleProp<ViewStyle>;
  activeStickerId?: string | null;
  onActiveStickerIdChange?: (stickerId: string | null) => void;
  onStickerPressed: (stickerId: string) => void;
  onTransformChanged: (args: { stickerId: string; x: number; y: number }) => void;
  onTransformCommitted: (args: { stickerId: string; x: number; y: number }) => Promise<void>;
}) {
  const {
    stickers,
    stageWidth,
    stageHeight,
    style,
    activeStickerId: controlledActiveStickerId,
    onActiveStickerIdChange,
    onStickerPressed,
    onTransformChanged,
    onTransformCommitted,
  } = props;

  const [uncontrolledActiveStickerId, setUncontrolledActiveStickerId] = useState<string | null>(null);
  const activeStickerId = controlledActiveStickerId ?? uncontrolledActiveStickerId;

  function setActiveStickerId(next: string | null) {
    if (controlledActiveStickerId !== undefined) {
      onActiveStickerIdChange?.(next);
    } else {
      setUncontrolledActiveStickerId(next);
    }
  }

  return (
    <View pointerEvents="box-none" style={[styles.layer, style]}>
      {stickers.map((s) => {
        const isActive = s.id === activeStickerId;
        const zIndex = isActive ? STICKERS_Z_BASE + 100 : STICKERS_Z_BASE;
        return (
          <DraggableSticker
            key={s.id}
            sticker={s}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            isActive={isActive}
            zIndex={zIndex}
            onActivate={(id) => setActiveStickerId(id)}
            onPress={onStickerPressed}
            onTransformChanged={onTransformChanged}
            onTransformCommitted={onTransformCommitted}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: STICKERS_Z_BASE,
    elevation: STICKERS_ELEVATION_BASE,
  },
  stickerContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  sticker: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the emoji “sticker” itself fully transparent (no opaque tile behind it).
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  stickerActive: {
    // When selected, show a subtle outline without adding any fill.
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.18)',
  },
  stickerText: {
    fontWeight: '900',
  },
});
