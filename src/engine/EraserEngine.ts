import type { BoundingBox, Stroke, StrokePoint } from '../types/stroke';
import { buildStrokePath2D, computeStrokeBoundingBox } from './StrokeRenderer.ts';

/**
 * Maximum spacing (in document pixels) between adjacent points along a stroke
 * before `densifyStrokePoints` subdivides the segment so the eraser can split
 * even long fast straight lines smoothly.
 */
const MAX_SEGMENT_LENGTH = 5;

/**
 * Computes the minimum squared distance from point `(px, py)` to the line segment
 * `(ax, ay) -> (bx, by)`.
 */
export function distToSegmentSquared(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  if (l2 === 0) {
    return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  }
  let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * (bx - ax);
  const projY = ay + t * (by - ay);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/**
 * Subdivides any segment in `points` longer than `maxSegmentLen` via linear
 * interpolation of `x`, `y`, and `pressure`. This guarantees that fast strokes
 * with widely spaced sample points can still be cleanly split in the middle
 * by the eraser.
 */
export function densifyStrokePoints(
  points: StrokePoint[],
  maxSegmentLen = MAX_SEGMENT_LENGTH
): StrokePoint[] {
  if (points.length <= 1) {
    return points;
  }

  const result: StrokePoint[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);

    if (dist > maxSegmentLen) {
      const steps = Math.ceil(dist / maxSegmentLen);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({
          x: a.x + dx * t,
          y: a.y + dy * t,
          pressure: Number((a.pressure + (b.pressure - a.pressure) * t).toFixed(4)),
        });
      }
    }
    result.push(b);
  }

  return result;
}

/**
 * Fast AABB check between a stroke's bounding box and the swept capsule bounding
 * box of an eraser movement from `(x0, y0)` to `(x1, y1)` with radius `eraserRadius`.
 */
export function doesEraserSweepIntersectBbox(
  bbox: BoundingBox,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  eraserRadius: number
): boolean {
  const minX = Math.min(x0, x1) - eraserRadius;
  const maxX = Math.max(x0, x1) + eraserRadius;
  const minY = Math.min(y0, y1) - eraserRadius;
  const maxY = Math.max(y0, y1) + eraserRadius;

  return (
    bbox.maxX >= minX &&
    bbox.minX <= maxX &&
    bbox.maxY >= minY &&
    bbox.minY <= maxY
  );
}

export interface EraseSweepResult {
  strokes: Stroke[];
  didModify: boolean;
}

/**
 * Applies a single swept eraser segment `(x0, y0) -> (x1, y1)` with radius `eraserRadius`
 * across the given `strokes` array.
 *
 * - Uses fast AABB culling (`doesEraserSweepIntersectBbox`) before running per-point
 *   geometric capsule hit testing.
 * - Splits intersected strokes into 0, 1, or multiple contiguous surviving sub-strokes,
 *   preserving each remaining segment's original tool, color, width, relative z-order,
 *   and per-point stylus pressure data.
 */
export function eraseStrokesAlongSegment(
  strokes: readonly Stroke[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  eraserRadius: number,
  nextId: () => string
): EraseSweepResult {
  let didModify = false;
  const nextStrokes: Stroke[] = [];

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];

    // Stage 1: Fast bounding-box rejection
    if (
      !doesEraserSweepIntersectBbox(
        stroke.bbox,
        x0,
        y0,
        x1,
        y1,
        eraserRadius
      )
    ) {
      nextStrokes.push(stroke);
      continue;
    }

    // Effective hit threshold accounts for both the eraser radius and half of the stroke's width
    const hitRadius = eraserRadius + stroke.size * 0.45;
    const hitRadiusSq = hitRadius * hitRadius;

    // Densify long segments first so fast straight strokes can be erased in their middle
    const densePoints = densifyStrokePoints(stroke.points);

    // Stage 2: Check if any point on the densified stroke falls inside the eraser capsule
    let anyPointErased = false;
    const keepFlags = new Uint8Array(densePoints.length);

    for (let pIdx = 0; pIdx < densePoints.length; pIdx++) {
      const pt = densePoints[pIdx];
      const distSq = distToSegmentSquared(pt.x, pt.y, x0, y0, x1, y1);
      if (distSq <= hitRadiusSq) {
        anyPointErased = true;
        keepFlags[pIdx] = 0;
      } else {
        keepFlags[pIdx] = 1;
      }
    }

    if (!anyPointErased) {
      nextStrokes.push(stroke);
      continue;
    }

    didModify = true;

    // Stage 3: Partition surviving contiguous runs of points into new Stroke fragments
    let runStart = -1;
    for (let pIdx = 0; pIdx <= densePoints.length; pIdx++) {
      const keep = pIdx < densePoints.length ? keepFlags[pIdx] === 1 : false;

      if (keep && runStart === -1) {
        runStart = pIdx;
      } else if (!keep && runStart !== -1) {
        const segmentPoints = densePoints.slice(runStart, pIdx);
        runStart = -1;

        if (segmentPoints.length >= 1) {
          const fragment: Stroke = {
            id: nextId(),
            tool: stroke.tool,
            color: stroke.color,
            size: stroke.size,
            points: segmentPoints,
            simulatePressure: stroke.simulatePressure,
            bbox: computeStrokeBoundingBox(segmentPoints, stroke.size),
          };
          fragment.cachedPath = buildStrokePath2D(fragment, true);
          nextStrokes.push(fragment);
        }
      }
    }
  }

  return {
    strokes: didModify ? nextStrokes : (strokes as Stroke[]),
    didModify,
  };
}
