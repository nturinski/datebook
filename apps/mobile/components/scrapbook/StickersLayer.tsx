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

export const STICKER_BASE_SIZE = 72;

// Stickers live above photos but below sticky notes.
const STICKERS_Z_BASE = 5000;
const STICKERS_ELEVATION_BASE = 50;

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

  function getBounds(forScale: number): { maxX: number; maxY: number } {
    const stage = stageRef.current;
    const size = STICKER_BASE_SIZE * clamp(forScale, 0.25, 4);
    return {
      maxX: Math.max(0, stage.width - size),
      maxY: Math.max(0, stage.height - size),
    };
  }

  function getPanValue(): { x: number; y: number } {
    return {
      x: ((pan.x as any).__getValue?.() ?? 0) as number,
      y: ((pan.y as any).__getValue?.() ?? 0) as number,
    };
  }

  function clampPanToStage() {
    const { maxX, maxY } = getBounds(scaleRef.current);
    const cur = getPanValue();
    const xPx = clamp(cur.x, 0, maxX);
    const yPx = clamp(cur.y, 0, maxY);
    if (xPx !== cur.x || yPx !== cur.y) {
      pan.setValue({ x: xPx, y: yPx });
    }
  }

  function computeNormalized(): { x: number; y: number } {
    const { maxX, maxY } = getBounds(scaleRef.current);
    const cur = getPanValue();
    const xPx = clamp(cur.x, 0, maxX);
    const yPx = clamp(cur.y, 0, maxY);
    return {
      x: maxX === 0 ? 0 : xPx / maxX,
      y: maxY === 0 ? 0 : yPx / maxY,
    };
  }

  useEffect(() => {
    if (dragging.current) return;
    const xNorm = typeof sticker.x === 'number' ? clamp(sticker.x, 0, 1) : 0;
    const yNorm = typeof sticker.y === 'number' ? clamp(sticker.y, 0, 1) : 0;
    const { maxX, maxY } = getBounds(scaleRef.current);
    pan.setValue({ x: xNorm * maxX, y: yNorm * maxY });
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

          if (!didMove.current) {
            onPress(sticker.id);
            return;
          }

          clampPanToStage();

          // Optional: make the tape sticker feel like it “wants” to live on corners.
          if (sticker.kind === 'tape') {
            const stage = stageRef.current;
            const scale = clamp(scaleRef.current, 0.25, 4);
            const size = STICKER_BASE_SIZE * scale;
            const { maxX, maxY } = getBounds(scale);
            const cur = getPanValue();
            const xPx = clamp(cur.x, 0, maxX);
            const yPx = clamp(cur.y, 0, maxY);

            const corners = [
              { x: 0, y: 0 },
              { x: maxX, y: 0 },
              { x: 0, y: maxY },
              { x: maxX, y: maxY },
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
  const size = STICKER_BASE_SIZE * scale;
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
