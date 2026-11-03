import type { ToolType } from './tools';

export interface StrokePoint {
  /** Document X coordinate (viewport clientX + scrollX) */
  x: number;
  /** Document Y coordinate (viewport clientY + scrollY) */
  y: number;
  /** Normalized pointer pressure (0..1) */
  pressure: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Stroke {
  id: string;
  tool: Exclude<ToolType, 'eraser'>;
  color: string;
  size: number;
  points: StrokePoint[];
  /** Whether the stroke has come from real pressure-sensitive input */
  simulatePressure: boolean;
  /** Cached Path2D in document coordinates for fast zero-allocation redraws */
   cachedPath?: Path2D;
  /** Cached bounding box in document coordinates for viewport culling and hit-testing */
  bbox: BoundingBox;
}
