import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { BoundingBox, Stroke, StrokePoint } from '../types/stroke';

const average = (a: number, b: number): number => (a + b) / 2;

/**
 * Converts polygon outline points returned by `perfect-freehand` into a smooth
 * quadratic-curve SVG path string suitable for `new Path2D(svgPath)`.
 */
export function getSvgPathFromStroke(points: number[][], closed = true): string {
  const len = points.length;
  if (len < 4) {
    return '';
  }

  let a = points[0];
  let b = points[1];
  const c = points[2];

  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(
    b[1],
    c[1]
  ).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(
      2
    )} `;
  }

  if (closed) {
    result += 'Z';
  }

  return result;
}

/**
 * Computes the axis-aligned bounding box for a stroke in document coordinates,
 * expanded by the stroke radius to account for stroke thickness.
 */
export function computeStrokeBoundingBox(
  points: StrokePoint[],
  size: number
): BoundingBox {
  const pad = size + 2;
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

/**
 * Returns `perfect-freehand` options tuned separately for:
 * 1. Highlighter: uniform marker thickness (`thinning: 0`) with smooth rounded caps
 * 2. Pressure-sensitive Pen (`simulatePressure === false`): responsive variable-width
 *    strokes (`thinning: 0.62`) driven directly by hardware stylus pressure
 * 3. Mouse / Non-pressure Pen (`simulatePressure === true`): consistent, predictable
 *    stroke width (`thinning: 0.18`) with subtle natural smoothing
 */
export function getStrokeOptionsForTool(
  stroke: Pick<Stroke, 'size' | 'tool' | 'simulatePressure'>,
  isComplete: boolean
): StrokeOptions {
  const { size, tool, simulatePressure } = stroke;

  if (tool === 'highlighter') {
    return {
      size,
      thinning: 0,
      smoothing: 0.65,
      streamline: 0.6,
      simulatePressure: false,
      easing: (t) => t,
      last: isComplete,
      start: {
        cap: true,
        taper: 0,
      },
      end: {
        cap: true,
        taper: 0,
      },
    };
  }

  if (!simulatePressure) {
    // Hardware stylus pressure curve: natural variable width
    return {
      size,
      thinning: 0.62,
      smoothing: 0.58,
      streamline: 0.46,
      simulatePressure: false,
      easing: (t) => Math.sin((t * Math.PI) / 2),
      last: isComplete,
      start: {
        cap: true,
        taper: 0,
      },
      end: {
        cap: true,
        taper: 0,
      },
    };
  }

  // Mouse / non-pressure fallback: consistent stroke width
  return {
    size,
    thinning: 0.18,
    smoothing: 0.55,
    streamline: 0.5,
    simulatePressure: true,
    easing: (t) => t,
    last: isComplete,
    start: {
      cap: true,
      taper: 0,
    },
    end: {
      cap: true,
      taper: 0,
    },
  };
}

/**
 * Builds a `Path2D` for a stroke using `perfect-freehand` with tool-specific
 * smoothing, streamline, thinning, and rounded start/end caps.
 */
export function buildStrokePath2D(
  stroke: Pick<Stroke, 'points' | 'size' | 'tool' | 'simulatePressure'>,
  isComplete: boolean
): Path2D {
  const { points, size, tool, simulatePressure } = stroke;
  if (points.length === 0) {
    return new Path2D();
  }

  // Single-dot tap: render a clean circular dot with rounded edges, scaled by stylus pressure for pen
  if (points.length === 1) {
    const pt = points[0];
    const pressureFactor =
      tool === 'pen' && !simulatePressure
        ? Math.max(0.35, pt.pressure)
        : 1;
    const radius = Math.max(1, (size * pressureFactor) / 2);
    const dotPath = new Path2D();
    dotPath.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    return dotPath;
  }

  const inputPoints = points.map((p) => [p.x, p.y, p.pressure]);
  const options = getStrokeOptionsForTool(stroke, isComplete);
  const outlinePoints = getStroke(inputPoints, options);

  const pathData = getSvgPathFromStroke(outlinePoints, true);
  return pathData ? new Path2D(pathData) : new Path2D();
}

/**
 * Checks whether a stroke's document-coordinate bounding box intersects the
 * current visible viewport rectangle.
 */
export function isBoundingBoxVisible(
  bbox: BoundingBox,
  scrollX: number,
  scrollY: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return (
    bbox.maxX >= scrollX &&
    bbox.minX <= scrollX + viewportWidth &&
    bbox.maxY >= scrollY &&
    bbox.minY <= scrollY + viewportHeight
  );
}

/**
 * Resolves a cached `Path2D` for a stroke (or builds one for an active stroke).
 */
export function resolveStrokePath2D(
  stroke: Stroke,
  isComplete: boolean
): Path2D {
  let path = stroke.cachedPath;
  if (!path) {
    path = buildStrokePath2D(stroke, isComplete);
    if (isComplete) {
      stroke.cachedPath = path;
    }
  }
  return path;
}

/**
 * Renders a single stroke onto a 2D canvas context that has already been
 * translated by `(-scrollX, -scrollY)`.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  isComplete: boolean
): void {
  const path = resolveStrokePath2D(stroke, isComplete);

  ctx.save();
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();
}
