import { containAspectRect, type Rect } from '@/lib/layout/aspectRect';

// A-series paper keeps a constant aspect ratio: height/width = sqrt(2).
// React Native `aspectRatio` is width/height.
export const A4_PORTRAIT_WIDTH_OVER_HEIGHT = 210 / 297; // ~= 0.7070707
export const A4_LANDSCAPE_WIDTH_OVER_HEIGHT = 297 / 210; // ~= 1.4142857

export function containA4Rect(args: { containerWidth: number; containerHeight: number }): Rect {
  return containAspectRect({
    containerWidth: args.containerWidth,
    containerHeight: args.containerHeight,
    // Locked to portrait A4 to keep scrapbook pages consistent even if the device rotates.
    aspectWidthOverHeight: A4_PORTRAIT_WIDTH_OVER_HEIGHT,
  });
}
