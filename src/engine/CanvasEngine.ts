import type { Stroke, StrokePoint } from '../types/stroke';
import { HIGHLIGHTER_OPACITY, type ToolSettings } from '../types/tools';
import { eraseStrokesAlongSegment } from './EraserEngine';
import { HistoryManager, type HistoryStateSnapshot } from './HistoryManager';
import { PointerInputHandler } from './PointerInputHandler';
import {
  buildStrokePath2D,
  computeStrokeBoundingBox,
  isBoundingBoxVisible,
  renderStroke,
} from './StrokeRenderer';

export type HistoryChangeListener = (snapshot: HistoryStateSnapshot) => void;

/**
 * Core imperative 2D Canvas drawing engine for PageInk.
 * Completely decoupled from React state during pointer movement to guarantee
 * zero React re-renders while drawing/erasing and minimal input-to-photon latency.
 *
 * Layering & Highlighter Strategy:
 * - Highlighter strokes are rendered onto an offscreen viewport buffer at full
 *   alpha (`1.0`), then composited onto the main canvas at `HIGHLIGHTER_OPACITY` (`0.36`)
 *   underneath opaque Pen strokes.
 * - Continuous eraser drags split intersected strokes in real time while grouping
 *   the entire drag gesture into a single logical Undo history entry on release.
 */
export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private highlighterCanvas: HTMLCanvasElement;
  private highlighterCtx: CanvasRenderingContext2D;
  private pointerHandler: PointerInputHandler;
  private history: HistoryManager;
  private onHistoryChange?: HistoryChangeListener;

  private settings: ToolSettings;
  private strokes: Stroke[] = [];
  private activeStroke: Stroke | null = null;

  // Eraser session state
  private isErasing = false;
  private preEraseStrokesSnapshot: readonly Stroke[] | null = null;
  private didEraseDuringGesture = false;
  private lastErasePoint: StrokePoint | null = null;
  private eraserCursorDocPos: StrokePoint | null = null;

  private rafId: number | null = null;
  private needsRender = false;

  private viewportWidth = 0;
  private viewportHeight = 0;
  private dpr = 1;
  private strokeCounter = 0;

  constructor(
    canvas: HTMLCanvasElement,
    initialSettings: ToolSettings,
    onHistoryChange?: HistoryChangeListener
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { desynchronized: false });
    if (!context) {
      throw new Error('[PageInk] Failed to acquire 2D canvas context.');
    }
    this.ctx = context;

    this.highlighterCanvas = document.createElement('canvas');
    const hlContext = this.highlighterCanvas.getContext('2d');
    if (!hlContext) {
      throw new Error('[PageInk] Failed to acquire offscreen highlighter 2D context.');
    }
    this.highlighterCtx = hlContext;

    this.settings = { ...initialSettings };
    this.history = new HistoryManager();
    this.onHistoryChange = onHistoryChange;

    this.updateCanvasDimensions();

    this.pointerHandler = new PointerInputHandler(this.canvas, {
      canStartStroke: () =>
        this.settings.activeTool === 'pen' ||
        this.settings.activeTool === 'highlighter' ||
        this.settings.activeTool === 'eraser',
      onStrokeStart: this.handleStrokeStart,
      onStrokeMove: this.handleStrokeMove,
      onStrokeEnd: this.handleStrokeEnd,
      onStrokeCancel: this.handleStrokeCancel,
      onHoverMove: this.handleHoverMove,
    });

    window.addEventListener('resize', this.handleWindowResize, { passive: true });
    window.addEventListener('scroll', this.handleWindowScroll, { passive: true });
    this.notifyHistoryChange();
  }

  public updateSettings(newSettings: ToolSettings): void {
    const prevTool = this.settings.activeTool;
    this.settings = { ...newSettings };
    if (prevTool !== newSettings.activeTool) {
      this.scheduleRender();
    }
  }

  public getStrokes(): readonly Stroke[] {
    return this.strokes;
  }

  public undo(): boolean {
    if (this.activeStroke || this.isErasing) return false;
    const restored = this.history.undo(this.strokes);
    if (!restored) return false;
    this.strokes = restored;
    this.notifyHistoryChange();
    this.scheduleRender();
    return true;
  }

  public redo(): boolean {
    if (this.activeStroke || this.isErasing) return false;
    const restored = this.history.redo(this.strokes);
    if (!restored) return false;
    this.strokes = restored;
    this.notifyHistoryChange();
    this.scheduleRender();
    return true;
  }

  public clearAll(): boolean {
    if (this.strokes.length === 0) return false;
    this.history.recordBeforeMutation(this.strokes);
    this.strokes = [];
    this.activeStroke = null;
    this.notifyHistoryChange();
    this.scheduleRender();
    return true;
  }

  public getHistorySnapshot(): HistoryStateSnapshot {
    return this.history.getSnapshot(this.strokes);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pointerHandler.destroy();
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('scroll', this.handleWindowScroll);
    this.history.clear();
    this.strokes = [];
    this.activeStroke = null;
    this.preEraseStrokesSnapshot = null;
  }

  private notifyHistoryChange(): void {
    this.onHistoryChange?.(this.history.getSnapshot(this.strokes));
  }

  private nextStrokeId = (): string => {
    this.strokeCounter += 1;
    return `stroke-${Date.now()}-${this.strokeCounter}`;
  };

  private handleWindowResize = (): void => {
    this.updateCanvasDimensions();
    this.scheduleRender();
  };

  private handleWindowScroll = (): void => {
    this.scheduleRender();
  };

  private handleHoverMove = (point: StrokePoint | null): void => {
    if (this.settings.activeTool !== 'eraser') {
      if (this.eraserCursorDocPos !== null) {
        this.eraserCursorDocPos = null;
        this.scheduleRender();
      }
      return;
    }
    this.eraserCursorDocPos = point;
    this.scheduleRender();
  };

  /**
   * Synchronizes the backing store resolution of both the main canvas and the
   * offscreen highlighter buffer with the viewport CSS size and `window.devicePixelRatio`,
   * then immediately redraws existing strokes so resizing never loses ink.
   */
  private updateCanvasDimensions(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      dpr === this.dpr
    ) {
      return;
    }

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.dpr = dpr;

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.highlighterCanvas.width = pixelWidth;
    this.highlighterCanvas.height = pixelHeight;

    // Immediately render synchronously on resize so the canvas never flashes blank
    this.renderFrame();
  }

  private handleStrokeStart = (
    point: StrokePoint,
    simulatePressure: boolean
  ): void => {
    if (this.settings.activeTool === 'eraser') {
      this.isErasing = true;
      this.preEraseStrokesSnapshot = [...this.strokes];
      this.didEraseDuringGesture = false;
      this.lastErasePoint = point;
      this.eraserCursorDocPos = point;

      this.applyEraserSegment(point, point);
      this.scheduleRender();
      return;
    }

    const activeTool =
      this.settings.activeTool === 'highlighter' ? 'highlighter' : 'pen';
    const size =
      activeTool === 'highlighter'
        ? this.settings.highlighterSize
        : this.settings.penSize;
    const color =
      activeTool === 'highlighter'
        ? this.settings.highlighterColor
        : this.settings.color;

    this.activeStroke = {
      id: this.nextStrokeId(),
      tool: activeTool,
      color,
      size,
      points: [point],
      simulatePressure: activeTool === 'highlighter' ? false : simulatePressure,
      bbox: computeStrokeBoundingBox([point], size),
    };

    this.scheduleRender();
  };

  private handleStrokeMove = (
    newPoints: StrokePoint[],
    simulatePressure: boolean
  ): void => {
    if (this.isErasing) {
      let prev = this.lastErasePoint ?? newPoints[0];
      for (let i = 0; i < newPoints.length; i++) {
        const curr = newPoints[i];
        this.applyEraserSegment(prev, curr);
        prev = curr;
      }
      this.lastErasePoint = prev;
      this.eraserCursorDocPos = prev;
      this.scheduleRender();
      return;
    }

    if (!this.activeStroke) return;

    const stroke = this.activeStroke;
    if (stroke.tool === 'pen') {
      stroke.simulatePressure = simulatePressure;
    }

    for (let i = 0; i < newPoints.length; i++) {
      const pt = newPoints[i];
      stroke.points.push(pt);

      // Incrementally expand bounding box
      const pad = stroke.size + 2;
      if (pt.x - pad < stroke.bbox.minX) stroke.bbox.minX = pt.x - pad;
      if (pt.y - pad < stroke.bbox.minY) stroke.bbox.minY = pt.y - pad;
      if (pt.x + pad > stroke.bbox.maxX) stroke.bbox.maxX = pt.x + pad;
      if (pt.y + pad > stroke.bbox.maxY) stroke.bbox.maxY = pt.y + pad;
    }

    // Invalidate cached path while stroke is actively growing
    stroke.cachedPath = undefined;
    this.scheduleRender();
  };

  private handleStrokeEnd = (): void => {
    if (this.isErasing) {
      if (this.didEraseDuringGesture && this.preEraseStrokesSnapshot) {
        this.history.recordBeforeMutation(this.preEraseStrokesSnapshot);
        this.notifyHistoryChange();
      }
      this.isErasing = false;
      this.preEraseStrokesSnapshot = null;
      this.didEraseDuringGesture = false;
      this.lastErasePoint = null;
      this.scheduleRender();
      return;
    }

    if (!this.activeStroke) return;

    const completedStroke = this.activeStroke;
    this.activeStroke = null;

    if (completedStroke.points.length > 0) {
      this.history.recordBeforeMutation(this.strokes);
      completedStroke.bbox = computeStrokeBoundingBox(
        completedStroke.points,
        completedStroke.size
      );
      completedStroke.cachedPath = buildStrokePath2D(completedStroke, true);
      this.strokes.push(completedStroke);
      this.notifyHistoryChange();
    }

    this.scheduleRender();
  };

  private handleStrokeCancel = (): void => {
    if (this.isErasing) {
      // Restore pre-erase strokes if the pointer gesture was cancelled (e.g., palm/multi-touch cancel)
      if (this.preEraseStrokesSnapshot) {
        this.strokes = [...this.preEraseStrokesSnapshot];
      }
      this.isErasing = false;
      this.preEraseStrokesSnapshot = null;
      this.didEraseDuringGesture = false;
      this.lastErasePoint = null;
      this.scheduleRender();
      return;
    }

    if (!this.activeStroke) return;
    this.activeStroke = null;
    this.scheduleRender();
  };

  private applyEraserSegment(p0: StrokePoint, p1: StrokePoint): void {
    if (this.strokes.length === 0) return;

    const eraserRadius = this.settings.eraserSize / 2;
    const { strokes: updatedStrokes, didModify } = eraseStrokesAlongSegment(
      this.strokes,
      p0.x,
      p0.y,
      p1.x,
      p1.y,
      eraserRadius,
      this.nextStrokeId
    );

    if (didModify) {
      this.strokes = updatedStrokes;
      this.didEraseDuringGesture = true;
    }
  }

  /**
   * Schedules a single `requestAnimationFrame` callback when state is dirty.
   * No idle animation loop runs when the user is not actively drawing or scrolling.
   */
  public scheduleRender(): void {
    this.needsRender = true;
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.needsRender) {
        this.needsRender = false;
        this.renderFrame();
      }
    });
  }

  private renderFrame(): void {
    const ctx = this.ctx;
    const hlCtx = this.highlighterCtx;
    const { viewportWidth, viewportHeight, dpr } = this;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Collect visible highlighter and pen strokes
    let hasVisibleHighlighters = false;
    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      if (
        s.tool === 'highlighter' &&
        isBoundingBoxVisible(s.bbox, scrollX, scrollY, viewportWidth, viewportHeight)
      ) {
        hasVisibleHighlighters = true;
        break;
      }
    }
    if (this.activeStroke && this.activeStroke.tool === 'highlighter') {
      hasVisibleHighlighters = true;
    }

    // Pass 1: Render all visible highlighter strokes onto the offscreen highlighter buffer
    // at 100% opacity, then composite the buffer once at HIGHLIGHTER_OPACITY (0.36).
    if (hasVisibleHighlighters) {
      hlCtx.save();
      hlCtx.setTransform(1, 0, 0, 1, 0, 0);
      hlCtx.clearRect(0, 0, this.highlighterCanvas.width, this.highlighterCanvas.height);
      hlCtx.scale(dpr, dpr);
      hlCtx.translate(-scrollX, -scrollY);

      for (let i = 0; i < this.strokes.length; i++) {
        const stroke = this.strokes[i];
        if (
          stroke.tool === 'highlighter' &&
          isBoundingBoxVisible(
            stroke.bbox,
            scrollX,
            scrollY,
            viewportWidth,
            viewportHeight
          )
        ) {
          renderStroke(hlCtx, stroke, true);
        }
      }

      if (this.activeStroke && this.activeStroke.tool === 'highlighter') {
        renderStroke(hlCtx, this.activeStroke, false);
      }

      hlCtx.restore();

      ctx.save();
      ctx.globalAlpha = HIGHLIGHTER_OPACITY;
      ctx.drawImage(this.highlighterCanvas, 0, 0);
      ctx.restore();
    }

    // Pass 2: Render all visible Pen strokes on top in crisp full opacity
    ctx.scale(dpr, dpr);
    ctx.translate(-scrollX, -scrollY);

    for (let i = 0; i < this.strokes.length; i++) {
      const stroke = this.strokes[i];
      if (
        stroke.tool === 'pen' &&
        isBoundingBoxVisible(
          stroke.bbox,
          scrollX,
          scrollY,
          viewportWidth,
          viewportHeight
        )
      ) {
        renderStroke(ctx, stroke, true);
      }
    }

    if (this.activeStroke && this.activeStroke.tool === 'pen') {
      renderStroke(ctx, this.activeStroke, false);
    }

    // Pass 3: Render visual eraser cursor ring when Eraser tool is active
    if (this.settings.activeTool === 'eraser' && this.eraserCursorDocPos) {
      const radius = this.settings.eraserSize / 2;
      const { x, y } = this.eraserCursorDocPos;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = this.isErasing
        ? 'rgba(255, 255, 255, 0.22)'
        : 'rgba(255, 255, 255, 0.1)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(24, 24, 27, 0.85)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, radius - 1.2), 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
