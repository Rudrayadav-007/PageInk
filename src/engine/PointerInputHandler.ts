import { StrokePoint } from '../types/stroke';

export interface PointerHandlerCallbacks {
  canStartStroke: (e: PointerEvent) => boolean;
  onStrokeStart: (point: StrokePoint, simulatePressure: boolean, pointerType: string) => void;
  onStrokeMove: (points: StrokePoint[]) => void;
  onStrokeEnd: () => void;
  onStrokeCancel: () => void;
}

/**
 * Handles low-latency Pointer Events on the drawing canvas, including:
 * - Pointer capture (`setPointerCapture` / `releasePointerCapture`)
 * - Coalesced event extraction (`getCoalescedEvents()`) for high-report-rate mice & styluses
 * - Viewport clamping so strokes stay within the visible browser viewport
 * - Prevention of accidental webpage text selection or native drag gestures
 * - Clean handling of `pointercancel`, `lostpointercapture`, and window blur
 */
export class PointerInputHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: PointerHandlerCallbacks;
  private activePointerId: number | null = null;
  private lastPoint: StrokePoint | null = null;

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
    this.canvas.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  public destroy(): void {
    this.releaseActivePointerCapture();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
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
    if (this.activePointerId !== null) {
      this.finishActiveStroke(false);
    }
  };

  /**
   * Clamps client coordinates to the visible browser viewport and converts
   * them into document coordinates (`clientX + scrollX`, `clientY + scrollY`).
   */
  private extractStrokePoint(e: PointerEvent): StrokePoint {
    const clampedX = Math.max(0, Math.min(window.innerWidth, e.clientX));
    const clampedY = Math.max(0, Math.min(window.innerHeight, e.clientY));

    // Default mouse pressure when buttons=1 is 0.5 in Pointer Events spec
    const rawPressure = e.pressure;
    const pressure =
      rawPressure > 0 && rawPressure <= 1 ? rawPressure : 0.5;

    return {
      x: clampedX + window.scrollX,
      y: clampedY + window.scrollY,
      pressure,
    };
  }

  /**
   * Determines whether `perfect-freehand` should simulate velocity-based pressure
   * (true for mouse or devices reporting fixed 0.5/0 pressure).
   */
  private shouldSimulatePressure(e: PointerEvent): boolean {
    if (e.pointerType === 'mouse') {
      return true;
    }
    return e.pressure === 0 || e.pressure === 0.5;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    // Only primary button (left click / stylus tip / primary touch) starts a stroke
    if (e.button !== 0) return;

    // Ignore secondary pointers if a stroke is already in progress (prevents multi-touch interference)
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
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails on synthetic events
    }

    const startPoint = this.extractStrokePoint(e);
    this.lastPoint = startPoint;

    this.callbacks.onStrokeStart(
      startPoint,
      this.shouldSimulatePressure(e),
      e.pointerType
    );
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
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
      const pt = this.extractStrokePoint(eventsToProcess[i]);

      // Filter out duplicate sub-pixel samples to keep perfect-freehand spline clean
      if (this.lastPoint) {
        const dx = pt.x - this.lastPoint.x;
        const dy = pt.y - this.lastPoint.y;
        if (dx * dx + dy * dy < 0.25) {
          continue;
        }
      }

      newPoints.push(pt);
      this.lastPoint = pt;
    }

    if (newPoints.length > 0) {
      this.callbacks.onStrokeMove(newPoints);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Capture the final release position if it moved slightly since the last pointermove
    const finalPoint = this.extractStrokePoint(e);
    if (this.lastPoint) {
      const dx = finalPoint.x - this.lastPoint.x;
      const dy = finalPoint.y - this.lastPoint.y;
      if (dx * dx + dy * dy >= 0.25) {
        this.callbacks.onStrokeMove([finalPoint]);
      }
    }

    this.finishActiveStroke(false);
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }
    this.finishActiveStroke(true);
  };

  private handleLostPointerCapture = (e: PointerEvent): void => {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }
    // Commit whatever stroke points were drawn before pointer capture was lost
    this.finishActiveStroke(false);
  };

  private finishActiveStroke(isCancel: boolean): void {
    this.releaseActivePointerCapture();
    this.activePointerId = null;
    this.lastPoint = null;

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

