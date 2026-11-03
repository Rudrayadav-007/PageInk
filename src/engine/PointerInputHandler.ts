import type { StrokePoint } from '../types/stroke';

export interface PointerHandlerCallbacks {
  canStartStroke: (e: PointerEvent) => boolean;
  onStrokeStart: (
    point: StrokePoint,
    simulatePressure: boolean,
    pointerType: string
  ) => void;
  onStrokeMove: (points: StrokePoint[], simulatePressure: boolean) => void;
  onStrokeEnd: () => void;
  onStrokeCancel: () => void;
  onHoverMove?: (point: StrokePoint | null) => void;
}

/** Minimum clamped pressure so light stylus contact never collapses to a 0-width stroke */
export const MIN_STYLUS_PRESSURE = 0.12;
/** Maximum clamped pressure */
export const MAX_STYLUS_PRESSURE = 1.0;
/** Default neutral fallback pressure when device/browser does not report pressure */
export const FALLBACK_PRESSURE = 0.5;
/** Exponential moving average factor for smoothing sudden stylus pressure spikes */
const PRESSURE_SMOOTHING_ALPHA = 0.45;

/**
 * Normalizes raw `PointerEvent.pressure` into a natural handwriting curve
 * in `[MIN_STYLUS_PRESSURE, MAX_STYLUS_PRESSURE]` and smooths rapid frame-to-frame
 * pressure jumps with an exponential moving average.
 */
export function normalizeAndSmoothPressure(
  rawPressure: number,
  hasRealPressure: boolean,
  previousPressure: number | null
): number {
  if (!hasRealPressure) {
    return FALLBACK_PRESSURE;
  }

  // Clamp raw pressure into a safe positive range
  const clamped = Math.max(
    0.01,
    Math.min(1, Number.isFinite(rawPressure) ? rawPressure : FALLBACK_PRESSURE)
  );

  // Apply a gentle gamma curve (exponent 0.8) so light/medium handwriting feels responsive
  // without requiring heavy physical force on the tablet surface, then map into [0.12, 1.0].
  const curved =
    MIN_STYLUS_PRESSURE +
    (MAX_STYLUS_PRESSURE - MIN_STYLUS_PRESSURE) * Math.pow(clamped, 0.8);

  if (previousPressure === null) {
    return Number(curved.toFixed(4));
  }

  const smoothed =
    previousPressure + PRESSURE_SMOOTHING_ALPHA * (curved - previousPressure);
  return Number(
    Math.max(
      MIN_STYLUS_PRESSURE,
      Math.min(MAX_STYLUS_PRESSURE, smoothed)
    ).toFixed(4)
  );
}

/**
 * Determines whether a `PointerEvent` carries real hardware pressure information.
 * Supports:
 * - Standard Windows Ink / Wintab `pointerType === "pen"` styluses (XP-Pen Artist, XP-Pen Deco, Wacom, Surface)
 * - Tablets or drivers reporting `pointerType === "mouse"` or `"touch"` that nonetheless expose variable `e.pressure` (neither 0 nor 0.5).
 */
export function detectHardwarePressure(e: PointerEvent): boolean {
  const p = e.pressure;
  if (!Number.isFinite(p) || p <= 0 || p > 1) {
    return false;
  }
  // In Pointer Events spec, active non-pressure devices report exactly 0.5.
  // Any value distinct from 0.5 (even if pointerType is "mouse" on a custom tablet driver)
  // indicates real hardware pressure modulation.
  if (Math.abs(p - 0.5) > 0.001) {
    return true;
  }
  // If pointerType is explicitly 'pen', treat 0.5 on initial contact as real pen input
  // so subsequent pressure samples use hardware pressure rather than velocity simulation.
  return e.pointerType === 'pen';
}

/**
 * Handles low-latency Pointer Events on the drawing canvas, including:
 * - Stylus pressure normalization and smoothing (XP-Pen, Wacom, Windows Ink, mouse-emulated tablets)
 * - Multi-touch rejection so palm/pinch gestures do not trigger unintended strokes
 * - Pointer capture (`setPointerCapture` / `releasePointerCapture`)
 * - Coalesced event extraction (`getCoalescedEvents()`) for high-report-rate mice & styluses
 * - Viewport clamping so strokes stay within the visible browser viewport
 * - Prevention of accidental webpage text selection or native drag gestures
 */
export class PointerInputHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: PointerHandlerCallbacks;
  private activePointerId: number | null = null;
  private activePointerType: string | null = null;
  private activeTouchPointers = new Set<number>();
  private hasRealPressure = false;
  private lastPoint: StrokePoint | null = null;
  private lastSmoothedPressure: number | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: PointerHandlerCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.attachListeners();
  }

  private attachListeners(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  public destroy(): void {
    this.releaseActivePointerCapture();
    this.activeTouchPointers.clear();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('blur', this.handleWindowBlur);
  }

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.activePointerId !== null) {
      e.preventDefault();
    }
  };

  private handleWindowBlur = (): void => {
    this.activeTouchPointers.clear();
    this.callbacks.onHoverMove?.(null);
    if (this.activePointerId !== null) {
      this.finishActiveStroke(false);
    }
  };

  private handlePointerLeave = (): void => {
    if (this.activePointerId === null) {
      this.callbacks.onHoverMove?.(null);
    }
  };

  /**
   * Clamps client coordinates to the visible browser viewport and converts
   * them into document coordinates (`clientX + scrollX`, `clientY + scrollY`)
   * with normalized and smoothed stylus pressure.
   */
  private extractStrokePoint(e: PointerEvent): StrokePoint {
    const clampedX = Math.max(0, Math.min(window.innerWidth, e.clientX));
    const clampedY = Math.max(0, Math.min(window.innerHeight, e.clientY));

    if (!this.hasRealPressure && detectHardwarePressure(e)) {
      this.hasRealPressure = true;
    }

    const pressure = normalizeAndSmoothPressure(
      e.pressure,
      this.hasRealPressure,
      this.lastSmoothedPressure
    );
    this.lastSmoothedPressure = pressure;

    return {
      x: clampedX + window.scrollX,
      y: clampedY + window.scrollY,
      pressure,
    };
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.activeTouchPointers.add(e.pointerId);
      // Multi-touch gesture detected (e.g., two-finger pinch/scroll or palm + finger):
      // cancel any active touch stroke immediately to avoid accidental drawing.
      if (this.activeTouchPointers.size > 1) {
        if (this.activePointerId !== null && this.activePointerType === 'touch') {
          this.finishActiveStroke(true);
        }
        return;
      }
    }

    // Only primary contact (left mouse button / stylus tip / single touch) starts a stroke
    if (e.button !== 0) return;

    // If a stylus/pen touches down while a touch stroke just started (palm rejection),
    // cancel the accidental touch stroke and let the stylus take over.
    if (
      this.activePointerId !== null &&
      this.activePointerType === 'touch' &&
      e.pointerType === 'pen'
    ) {
      this.finishActiveStroke(true);
    }

    // Ignore secondary pointers if a stroke is already in progress
    if (this.activePointerId !== null) return;

    if (!this.callbacks.canStartStroke(e)) return;

    e.preventDefault();
    e.stopPropagation();

    // Clear any existing webpage text selection so dragging never highlights page text
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }

    this.activePointerId = e.pointerId;
    this.activePointerType = e.pointerType || 'mouse';
    this.hasRealPressure = detectHardwarePressure(e);
    this.lastSmoothedPressure = null;

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails on synthetic events
    }

    const startPoint = this.extractStrokePoint(e);
    this.lastPoint = startPoint;
    this.callbacks.onHoverMove?.(startPoint);

    this.callbacks.onStrokeStart(
      startPoint,
      !this.hasRealPressure,
      this.activePointerType
    );
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.activePointerId === null) {
      // Passive hover movement (used for rendering the eraser cursor ring)
      if (this.callbacks.onHoverMove && e.pointerType !== 'touch') {
        const clampedX = Math.max(0, Math.min(window.innerWidth, e.clientX));
        const clampedY = Math.max(0, Math.min(window.innerHeight, e.clientY));
        this.callbacks.onHoverMove({
          x: clampedX + window.scrollX,
          y: clampedY + window.scrollY,
          pressure: FALLBACK_PRESSURE,
        });
      }
      return;
    }

    if (e.pointerId !== this.activePointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const coalesced =
      typeof e.getCoalescedEvents === 'function'
        ? e.getCoalescedEvents()
        : [e];

    const eventsToProcess = coalesced.length > 0 ? coalesced : [e];
    const newPoints: StrokePoint[] = [];

    for (let i = 0; i < eventsToProcess.length; i++) {
      const sample = eventsToProcess[i];
      const pt = this.extractStrokePoint(sample);

      // Filter out duplicate sub-pixel samples unless pressure changed meaningfully
      if (this.lastPoint) {
        const dx = pt.x - this.lastPoint.x;
        const dy = pt.y - this.lastPoint.y;
        const dp = Math.abs(pt.pressure - this.lastPoint.pressure);
        if (dx * dx + dy * dy < 0.2 && dp < 0.025) {
          continue;
        }
      }

      newPoints.push(pt);
      this.lastPoint = pt;
    }

    if (this.lastPoint) {
      this.callbacks.onHoverMove?.(this.lastPoint);
    }

    if (newPoints.length > 0) {
      this.callbacks.onStrokeMove(newPoints, !this.hasRealPressure);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    this.activeTouchPointers.delete(e.pointerId);

    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const finalPoint = this.extractStrokePoint(e);
    if (this.lastPoint) {
      const dx = finalPoint.x - this.lastPoint.x;
      const dy = finalPoint.y - this.lastPoint.y;
      if (dx * dx + dy * dy >= 0.2) {
        this.callbacks.onStrokeMove([finalPoint], !this.hasRealPressure);
      }
    }

    if (e.pointerType === 'touch') {
      this.callbacks.onHoverMove?.(null);
    } else {
      this.callbacks.onHoverMove?.(finalPoint);
    }

    this.finishActiveStroke(false);
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    this.activeTouchPointers.delete(e.pointerId);
    this.callbacks.onHoverMove?.(null);

    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }
    this.finishActiveStroke(true);
  };

  private handleLostPointerCapture = (e: PointerEvent): void => {
    this.activeTouchPointers.delete(e.pointerId);

    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }
    this.finishActiveStroke(false);
  };

  private finishActiveStroke(isCancel: boolean): void {
    this.releaseActivePointerCapture();
    this.activePointerId = null;
    this.activePointerType = null;
    this.hasRealPressure = false;
    this.lastPoint = null;
    this.lastSmoothedPressure = null;

    if (isCancel) {
      this.callbacks.onStrokeCancel();
    } else {
      this.callbacks.onStrokeEnd();
    }
  }

  private releaseActivePointerCapture(): void {
    if (this.activePointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture(this.activePointerId)) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
      } catch {
        // Ignore if pointer was already released
      }
    }
  }
}
