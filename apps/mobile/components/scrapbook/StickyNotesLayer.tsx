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

import type { ScrapbookPageNote, ScrapbookNoteColor } from '@/api/scrapbookNotes';
import { PaperColors } from '@/constants/paper';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const STICKY_NOTE_SIZE = {
  // Slightly squarer than before.
  width: 160,
  height: 160,
} as const;

// Keep notes on top of everything else in the canvas.
// Photos top out around zIndex ~1000; give notes a big, obvious ceiling.
const NOTES_Z_BASE = 9000;
const NOTES_ELEVATION_BASE = 90;

const NOTE_TOP_BAR_HEIGHT = 18;

export function getNoteColors(
  color: ScrapbookNoteColor
): { fill: string; topBar: string; border: string; ink: string } {
  switch (color) {
    case 'purple':
      return {
        fill: '#E7D9F7',
        topBar: '#D7C1F2',
        border: 'rgba(46,42,39,0.18)',
        ink: PaperColors.ink,
      };
    case 'pink':
      return {
        fill: '#F7D7DD',
        topBar: '#EFBCC8',
        border: 'rgba(46,42,39,0.18)',
        ink: PaperColors.ink,
      };
    case 'blue':
      return {
        fill: '#D7E6F7',
        topBar: '#BFD6F2',
        border: 'rgba(46,42,39,0.18)',
        ink: PaperColors.ink,
      };
    case 'yellow':
    default:
      return {
        fill: '#F7F0C7',
        topBar: '#EDE2A8',
        border: 'rgba(46,42,39,0.18)',
        ink: PaperColors.ink,
      };
  }
}

function DraggableNote(props: {
  note: ScrapbookPageNote;
  stageWidth: number;
  stageHeight: number;
  isActive: boolean;
  zIndex: number;
  onActivate: (noteId: string) => void;
  onPress: (noteId: string) => void;
  onTransformChanged: (args: { noteId: string; x: number; y: number }) => void;
  onTransformCommitted: (args: { noteId: string; x: number; y: number }) => Promise<void>;
}) {
  const { note, stageWidth, stageHeight, isActive, zIndex, onActivate, onPress, onTransformChanged, onTransformCommitted } =
    props;

  const pan = useRef(new Animated.ValueXY()).current;
  const start = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const didMove = useRef(false);

  const stageRef = useRef({ width: stageWidth, height: stageHeight });
  useEffect(() => {
    stageRef.current = { width: stageWidth, height: stageHeight };
  }, [stageWidth, stageHeight]);

  function getBounds(): { maxX: number; maxY: number } {
    const stage = stageRef.current;
    return {
      maxX: Math.max(0, stage.width - STICKY_NOTE_SIZE.width),
      maxY: Math.max(0, stage.height - STICKY_NOTE_SIZE.height),
    };
  }

  function getPanValue(): { x: number; y: number } {
    return {
      x: ((pan.x as any).__getValue?.() ?? 0) as number,
      y: ((pan.y as any).__getValue?.() ?? 0) as number,
    };
  }

  function clampPanToStage() {
    const { maxX, maxY } = getBounds();
    const cur = getPanValue();
    const xPx = clamp(cur.x, 0, maxX);
    const yPx = clamp(cur.y, 0, maxY);
    if (xPx !== cur.x || yPx !== cur.y) {
      pan.setValue({ x: xPx, y: yPx });
    }
  }

  function computeNormalized(): { x: number; y: number } {
    const { maxX, maxY } = getBounds();
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
    const xNorm = typeof note.x === 'number' ? clamp(note.x, 0, 1) : 0;
    const yNorm = typeof note.y === 'number' ? clamp(note.y, 0, 1) : 0;
    const { maxX, maxY } = getBounds();
    pan.setValue({ x: xNorm * maxX, y: yNorm * maxY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, note.x, note.y]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          onActivate(note.id);
          dragging.current = true;
          didMove.current = false;
          start.current = getPanValue();
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragging.current) return;
          const { maxX, maxY } = getBounds();
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
            onPress(note.id);
            return;
          }

          clampPanToStage();
          const { x, y } = computeNormalized();
          onTransformChanged({ noteId: note.id, x, y });
          await onTransformCommitted({ noteId: note.id, x, y });
          didMove.current = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id]
  );

  const colors = getNoteColors(note.color);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.noteContainer,
        {
          width: STICKY_NOTE_SIZE.width,
          height: STICKY_NOTE_SIZE.height,
          transform: pan.getTranslateTransform(),
          zIndex,
          // Android draw order: elevation is often the deciding factor.
          elevation: isActive ? NOTES_ELEVATION_BASE + 9 : NOTES_ELEVATION_BASE,
        },
      ]}
    >
      <View
        style={[
          styles.note,
          {
            backgroundColor: colors.fill,
            borderColor: colors.border,
            shadowOpacity: isActive ? 0.2 : 0.12,
            // Android draws by elevation first; keep notes above photos even when a photo is active.
            elevation: isActive ? NOTES_ELEVATION_BASE + 9 : NOTES_ELEVATION_BASE,
          },
        ]}
      >
        <View style={[styles.noteTopBar, { backgroundColor: colors.topBar }]} />

        <View style={styles.noteContent}>
          <Text
            pointerEvents="none"
            selectable={false}
            numberOfLines={7}
            style={[styles.noteText, { color: colors.ink }]}
          >
            {note.text?.trim()?.length ? note.text : 'Tap to write…'}
          </Text>
        </View>
        <View style={styles.noteCornerFold} />
      </View>
    </Animated.View>
  );
}

export function StickyNotesLayer(props: {
  notes: ScrapbookPageNote[];
  stageWidth: number;
  stageHeight: number;
  style?: StyleProp<ViewStyle>;
  onNotePressed: (noteId: string) => void;
  onTransformChanged: (args: { noteId: string; x: number; y: number }) => void;
  onTransformCommitted: (args: { noteId: string; x: number; y: number }) => Promise<void>;
}) {
  const { notes, stageWidth, stageHeight, style, onNotePressed, onTransformChanged, onTransformCommitted } = props;
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  return (
    <View pointerEvents="box-none" style={[styles.layer, style]}>
      {notes.map((n) => {
        const isActive = n.id === activeNoteId;
        // Photos use zIndex up to ~1000; keep notes consistently above.
        const zIndex = isActive ? NOTES_Z_BASE + 100 : NOTES_Z_BASE;
        return (
          <DraggableNote
            key={n.id}
            note={n}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            isActive={isActive}
            zIndex={zIndex}
            onActivate={(id) => setActiveNoteId(id)}
            onPress={onNotePressed}
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
    zIndex: NOTES_Z_BASE,
    elevation: NOTES_ELEVATION_BASE,
  },
  noteContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Less rounded => more “square” post-it.
    borderRadius: 8,
  },
  note: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    overflow: 'hidden',
  },
  noteTopBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    height: NOTE_TOP_BAR_HEIGHT,
    opacity: 0.95,
  },
  noteContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: NOTE_TOP_BAR_HEIGHT + 10,
  },
  noteText: {
    fontWeight: '700',
    opacity: 0.9,
    lineHeight: 18,
    fontSize: 13,
  },
  noteCornerFold: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.32)',
    // Sharper fold: less rounding.
    borderTopLeftRadius: 7,
    // A tiny crease so it reads as a folded layer.
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(46,42,39,0.10)',
  },
});
