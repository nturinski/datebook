export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function containAspectRect(args: {
  containerWidth: number;
  containerHeight: number;
  aspectWidthOverHeight: number;
}): Rect {
  const { containerWidth, containerHeight, aspectWidthOverHeight } = args;

  if (!Number.isFinite(containerWidth) || !Number.isFinite(containerHeight)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  if (containerWidth <= 0 || containerHeight <= 0 || !Number.isFinite(aspectWidthOverHeight) || aspectWidthOverHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const containerAspect = containerWidth / containerHeight;

  let width: number;
  let height: number;

  // If the container is wider than the target aspect, height constrains; otherwise width constrains.
  if (containerAspect >= aspectWidthOverHeight) {
    height = containerHeight;
    width = height * aspectWidthOverHeight;
  } else {
    width = containerWidth;
    height = width / aspectWidthOverHeight;
  }

  const x = (containerWidth - width) / 2;
  const y = (containerHeight - height) / 2;

  return { x, y, width, height };
}
