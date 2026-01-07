import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { ScrapbookPageText, ScrapbookTextFont } from '@/api/scrapbookTexts';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getTextBaseSizePx(stageWidth: number): { width: number; height: number } {
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) return { width: 180, height: 64 };
  const width = clamp(stageWidth * 0.55, 140, 320);
  const height = clamp(stageWidth * 0.18, 44, 110);
  return { width, height };
}

function getFontFamily(font: ScrapbookTextFont | undefined): string | undefined {
  switch (font) {
    case 'justAnotherHand':
      // Loaded in the app root via @expo-google-fonts/just-another-hand.
      return 'JustAnotherHand_400Regular';
    case 'script':
      return Platform.select({
        ios: 'Snell Roundhand',
        android: 'cursive',
        web: '"Snell Roundhand", "Segoe Script", "Bradley Hand", cursive',
        default: undefined,
      });
    case 'marker':
      return Platform.select({
        ios: 'Marker Felt',
        android: 'sans-serif',
        web: '"Marker Felt", "Segoe Print", "Comic Sans MS", sans-serif',
        default: undefined,
      });
    case 'print':
      return Platform.select({
        ios: 'Georgia',
        android: 'serif',
        web: 'Georgia, "Times New Roman", serif',
        default: undefined,
      });
    case 'hand':
    default:
      return Platform.select({
        ios: 'Bradley Hand',
        android: 'cursive',
        web: '"Bradley Hand", "Segoe Script", "Comic Sans MS", "Snell Roundhand", cursive',
        default: undefined,
      });
  }
}

const TEXT_Z_BASE = 6500;
const TEXT_ELEVATION_BASE = 65;
const MIN_VISIBLE_PX = 18;

const BASE_FONT_SIZE = 22;
const BASE_LINE_HEIGHT = 26;

type Bounds = {
  insideMaxX: number;
  insideMaxY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function DraggableText(props: {
  item: ScrapbookPageText;
  stageWidth: number;
  stageHeight: number;
  isActive: boolean;
  zIndex: number;
  onActivate: (textId: string) => void;
  onPress: (textId: string) => void;
  onTransformChanged: (args: { textId: string; x: number; y: number; scale: number }) => void;
  onTransformCommitted: (args: { textId: string; x: number; y: number; scale: number }) => Promise<void>;
}) {
  const { item, stageWidth, stageHeight, isActive, zIndex, onActivate, onPress, onTransformChanged, onTransformCommitted } =
    props;

  const pan = useRef(new Animated.ValueXY()).current;
  const dragging = useRef(false);
  const resizing = useRef(false);
  const didMove = useRef(false);
  const didResize = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const stageRef = useRef({ width: stageWidth, height: stageHeight });
  useEffect(() => {
    stageRef.current = { width: stageWidth, height: stageHeight };
  }, [stageWidth, stageHeight]);

  const SCALE_MIN = 0.25;
  const SCALE_MAX = 6;
  const HANDLE_SIZE = 26;
  const HANDLE_INSET = 6;

  const [scale, setScale] = useState<number>(() => {
    const s = typeof item.scale === 'number' ? item.scale : 1;
    return clamp(s, SCALE_MIN, SCALE_MAX);
  });
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    if (dragging.current || resizing.current) return;
    const next = clamp(typeof item.scale === 'number' ? item.scale : 1, SCALE_MIN, SCALE_MAX);
    setScale(next);
  }, [item.id, item.scale]);

  function getSize(forScale: number): { width: number; height: number } {
    const base = getTextBaseSizePx(stageRef.current.width);
    const s = clamp(forScale, SCALE_MIN, SCALE_MAX);
    return { width: base.width * s, height: base.height * s };
  }

  function getBounds(forScale: number): Bounds {
    const stage = stageRef.current;
    const size = getSize(forScale);

    const insideMaxX = Math.max(0, stage.width - size.width);
    const insideMaxY = Math.max(0, stage.height - size.height);

    const visible = Math.min(MIN_VISIBLE_PX, Math.max(8, Math.min(size.width, size.height) * 0.25));
    const minX = -Math.max(0, size.width - visible);
    const minY = -Math.max(0, size.height - visible);
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

  function clampPanToStage(forScale: number) {
    const { minX, minY, maxX, maxY } = getBounds(forScale);
    const cur = getPanValue();
    const xPx = clamp(cur.x, minX, maxX);
    const yPx = clamp(cur.y, minY, maxY);
    if (xPx !== cur.x || yPx !== cur.y) {
      pan.setValue({ x: xPx, y: yPx });
    }
  }

  function computeNormalized(forScale: number): { x: number; y: number } {
    const { insideMaxX, insideMaxY, minX, minY, maxX, maxY } = getBounds(forScale);
    const cur = getPanValue();
    const xPx = clamp(cur.x, minX, maxX);
    const yPx = clamp(cur.y, minY, maxY);
    return {
      x: insideMaxX === 0 ? 0 : xPx / insideMaxX,
      y: insideMaxY === 0 ? 0 : yPx / insideMaxY,
    };
  }

  useEffect(() => {
    if (dragging.current || resizing.current) return;
    const xNorm = typeof item.x === 'number' ? item.x : 0;
    const yNorm = typeof item.y === 'number' ? item.y : 0;
    const { insideMaxX, insideMaxY, minX, minY, maxX, maxY } = getBounds(scaleRef.current);
    const xPx = clamp(xNorm * insideMaxX, minX, maxX);
    const yPx = clamp(yNorm * insideMaxY, minY, maxY);
    pan.setValue({ x: xPx, y: yPx });
  }, [item.id, item.x, item.y, pan]);

  function isInResizeHandle(evt: any): boolean {
    if (!isActive) return false;
    const ne = evt?.nativeEvent;
    const lx = typeof ne?.locationX === 'number' ? ne.locationX : null;
    const ly = typeof ne?.locationY === 'number' ? ne.locationY : null;
    if (lx === null || ly === null) return false;

    const size = getSize(scaleRef.current);
    const minX = size.width - (HANDLE_INSET + HANDLE_SIZE);
    const minY = size.height - (HANDLE_INSET + HANDLE_SIZE);
    return lx >= minX && ly >= minY;
  }

  async function commitTransform(nextScale: number): Promise<void> {
    const s = clamp(nextScale, SCALE_MIN, SCALE_MAX);
    clampPanToStage(s);
    const { x, y } = computeNormalized(s);
    onTransformChanged({ textId: item.id, x, y, scale: s });
    await onTransformCommitted({ textId: item.id, x, y, scale: s });
  }

  function onResizePointerDown(evt: any) {
    if (Platform.OS !== 'web') return;
    if (!isActive) return;

    try {
      evt?.stopPropagation?.();
      evt?.preventDefault?.();
    } catch {
      // ignore
    }

    onActivate(item.id);
    resizing.current = true;
    didResize.current = false;

    const startClientX = evt?.clientX ?? evt?.nativeEvent?.clientX;
    const startClientY = evt?.clientY ?? evt?.nativeEvent?.clientY;
    const startScale = scaleRef.current;

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
          onActivate(item.id);
          resizing.current = true;
          didResize.current = false;
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!resizing.current) return;
          const delta = (gesture.dx + gesture.dy) / 2;
          const nextScale = clamp(scaleRef.current + delta / 150, SCALE_MIN, SCALE_MAX);
          setScale(nextScale);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: (evt) => !isInResizeHandle(evt),
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onMoveShouldSetPanResponderCapture: (evt, gesture) => {
          if (isInResizeHandle(evt)) return false;
          return Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2;
        },
        onPanResponderGrant: () => {
          if (resizing.current) return;
          onActivate(item.id);
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

          if (!didMove.current && !didResize.current) {
            onPress(item.id);
            didMove.current = false;
            didResize.current = false;
            return;
          }

          const nextScale = clamp(scaleRef.current, SCALE_MIN, SCALE_MAX);
          clampPanToStage(nextScale);
          const { x, y } = computeNormalized(nextScale);
          onTransformChanged({ textId: item.id, x, y, scale: nextScale });
          await onTransformCommitted({ textId: item.id, x, y, scale: nextScale });

          didMove.current = false;
          didResize.current = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id]
  );

  const rotation = typeof item.rotation === 'number' ? item.rotation : 0;
  const font = (typeof item.font === 'string' ? (item.font as ScrapbookTextFont) : 'hand') as ScrapbookTextFont;
  const size = getSize(scale);
  const fontSize = Math.round(BASE_FONT_SIZE * scale);
  const lineHeight = Math.round(BASE_LINE_HEIGHT * scale);

  return (
    <Animated.View
      style={[
        styles.textContainer,
        {
          width: size.width,
          height: size.height,
          transform: [...pan.getTranslateTransform(), { rotate: `${rotation}deg` }],
          zIndex,
          elevation: isActive ? TEXT_ELEVATION_BASE + 8 : TEXT_ELEVATION_BASE,
        },
      ]}
    >
      <View style={styles.textHitbox} {...panResponder.panHandlers} collapsable={false}>
        <View style={[styles.textCard, isActive && styles.textCardActive]}>
          <Text
            selectable={false}
            numberOfLines={3}
            style={[
              styles.text,
              {
                color: typeof item.color === 'string' && item.color.length ? item.color : '#2E2A27',
                fontFamily: getFontFamily(font),
                fontSize,
                lineHeight,
              },
            ]}
          >
            {item.text?.trim()?.length ? item.text : 'Text'}
          </Text>

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
      </View>
    </Animated.View>
  );
}

export function TextLayer(props: {
  texts: ScrapbookPageText[];
  stageWidth: number;
  stageHeight: number;
  style?: StyleProp<ViewStyle>;
  activeTextId?: string | null;
  onActiveTextIdChange?: (textId: string | null) => void;
  onTextPressed: (textId: string) => void;
  onTransformChanged: (args: { textId: string; x: number; y: number; scale: number }) => void;
  onTransformCommitted: (args: { textId: string; x: number; y: number; scale: number }) => Promise<void>;
}) {
  const {
    texts,
    stageWidth,
    stageHeight,
    style,
    activeTextId: controlledActiveTextId,
    onActiveTextIdChange,
    onTextPressed,
    onTransformChanged,
    onTransformCommitted,
  } = props;

  const [uncontrolledActiveTextId, setUncontrolledActiveTextId] = useState<string | null>(null);
  const activeTextId = controlledActiveTextId ?? uncontrolledActiveTextId;

  function setActiveTextId(next: string | null) {
    if (typeof onActiveTextIdChange === 'function') onActiveTextIdChange(next);
    if (controlledActiveTextId === undefined) setUncontrolledActiveTextId(next);
  }

  return (
    <View style={[styles.layer, style]} pointerEvents="box-none">
      {texts.map((t) => {
        const isActive = activeTextId === t.id;
        const zIndex = isActive ? 2000 : 1;
        return (
          <DraggableText
            key={t.id}
            item={t}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            isActive={isActive}
            zIndex={TEXT_Z_BASE + zIndex}
            onActivate={(textId) => setActiveTextId(textId)}
            onPress={(textId) => {
              setActiveTextId(textId);
              onTextPressed(textId);
            }}
            onTransformChanged={({ textId, x, y, scale }) => onTransformChanged({ textId, x, y, scale })}
            onTransformCommitted={({ textId, x, y, scale }) => onTransformCommitted({ textId, x, y, scale })}
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
    zIndex: TEXT_Z_BASE,
    elevation: TEXT_ELEVATION_BASE,
  },
  textContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  textHitbox: {
    flex: 1,
  },
  textCard: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.0)',
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.12)',
  },
  textCardActive: {
    borderColor: 'rgba(46,42,39,0.22)',
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  text: {
    fontWeight: Platform.select({ ios: '600', default: '700' }) as any,
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
