import type { BoundingBox, Stroke } from '../types/stroke';

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
 * Returns `true` if the closed line segments `(p1x, p1y)->(p2x, p2y)` and
 * `(q1x, q1y)->(q2x, q2y)` intersect.
 */
export function segmentsIntersect(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number
): boolean {
  const ccw = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);

  return (
    ccw(p1x, p1y, q1x, q1y, q2x, q2y) !== ccw(p2x, p2y, q1x, q1y, q2x, q2y) &&
    ccw(p1x, p1y, p2x, p2y, q1x, q1y) !== ccw(p1x, p1y, p2x, p2y, q2x, q2y)
  );
}

/**
 * Computes the minimum squared distance between two 2D line segments:
 * segment A `(a0x, a0y) -> (a1x, a1y)` and segment B `(b0x, b0y) -> (b1x, b1y)`.
 * Supports fast eraser sweeps across long or sparse stroke segments.
 */
export function segmentToSegmentDistSquared(
  a0x: number,
  a0y: number,
  a1x: number,
  a1y: number,
  b0x: number,
  b0y: number,
  b1x: number,
  b1y: number
): number {
  if (segmentsIntersect(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y)) {
    return 0;
  }

  return Math.min(
    distToSegmentSquared(a0x, a0y, b0x, b0y, b1x, b1y),
    distToSegmentSquared(a1x, a1y, b0x, b0y, b1x, b1y),
    distToSegmentSquared(b0x, b0y, a0x, a0y, a1x, a1y),
    distToSegmentSquared(b1x, b1y, a0x, a0y, a1x, a1y)
  );
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

/**
 * Tests whether a single `Stroke` is touched anywhere along its polyline by the
 * swept eraser segment `(x0, y0) -> (x1, y1)` with radius `eraserRadius`.
 */
export function doesEraserHitStroke(
  stroke: Stroke,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  eraserRadius: number
): boolean {
  // Stage 1: Fast bounding-box rejection
  if (
    !doesEraserSweepIntersectBbox(stroke.bbox, x0, y0, x1, y1, eraserRadius)
  ) {
    return false;
  }

  const hitRadius = eraserRadius + stroke.size * 0.5;
  const hitRadiusSq = hitRadius * hitRadius;
  const pts = stroke.points;

  if (pts.length === 0) {
    return false;
  }

  if (pts.length === 1) {
    return (
      distToSegmentSquared(pts[0].x, pts[0].y, x0, y0, x1, y1) <= hitRadiusSq
    );
  }

  // Stage 2: Accurate segment-to-segment distance check along the stroke polyline
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (
      segmentToSegmentDistSquared(a.x, a.y, b.x, b.y, x0, y0, x1, y1) <=
      hitRadiusSq
    ) {
      return true;
    }
  }

  return false;
}

export interface EraseSweepResult {
  strokes: Stroke[];
  didModify: boolean;
}

/**
 * Whole-stroke eraser: removes any complete `Stroke` (Pen or Highlighter) whose
 * geometry is intersected by the swept eraser segment `(x0, y0) -> (x1, y1)`.
 *
 * - Uses fast AABB culling (`doesEraserSweepIntersectBbox`) before running
 *   segment-to-segment capsule hit testing.
 * - Independent strokes that merely overlap visually are untouched unless the
 *   eraser path directly intersects their geometry.
 * - Preserves untouched original `Stroke` object references for Undo/Redo history.
 */
export function eraseStrokesAlongSegment(
  strokes: readonly Stroke[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  eraserRadius: number
): EraseSweepResult {
  let didModify = false;
  const survivingStrokes: Stroke[] = [];

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    if (doesEraserHitStroke(stroke, x0, y0, x1, y1, eraserRadius)) {
      didModify = true;
    } else {
      survivingStrokes.push(stroke);
    }
  }

  return {
    strokes: didModify ? survivingStrokes : (strokes as Stroke[]),
    didModify,
  };
}
