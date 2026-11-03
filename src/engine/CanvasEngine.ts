import type { Stroke, StrokePoint } from '../types/stroke';
import { HIGHLIGHTER_OPACITY, type ToolSettings } from '../types/tools';
import { eraseStrokesAlongSegment } from './EraserEngine';
import { HistoryManager, type HistoryStateSnapshot } from './HistoryManager';
import { PointerInputHandler, type ScrollOffsets } from './PointerInputHandler';
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
 * Layering & Coordinate Strategy:
 * - Stores stroke coordinates in document space (`clientX + scrollX`, `clientY + scrollY`).
 * - Tracks both window scrolling (`window.scrollX`/`scrollY`) and inner scrollable containers
 *   (used by SPAs such as ChatGPT) via a capture-phase scroll listener.
 * - Monitors `window.resize`, `visualViewport.resize`, and `matchMedia('(resolution: ...)')`
 *   to handle browser zoom and multi-monitor `devicePixelRatio` changes seamlessly.
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
  private isPassthrough = false;

  // Scroll tracking (supports both window scroll and primary inner SPA scroll container)
  private activeScrollElement: Element | null = null;

  // DPR media query listener cleanup
  private dprMediaQuery: MediaQueryList | null = null;

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
    this.setupDprObserver();

    this.pointerHandler = new PointerInputHandler(this.canvas, {
      canStartStroke: () =>
        !this.isPassthrough &&
        (this.settings.activeTool === 'pen' ||
          this.settings.activeTool === 'highlighter' ||
          this.settings.activeTool === 'eraser'),
      getScrollOffsets: this.getScrollOffsets,
      onStrokeStart: this.handleStrokeStart,
      onStrokeMove: this.handleStrokeMove,
      onStrokeEnd: this.handleStrokeEnd,
      onStrokeCancel: this.handleStrokeCancel,
      onHoverMove: this.handleHoverMove,
    });

    window.addEventListener('resize', this.handleWindowResize, { passive: true });
    // Capture-phase scroll listener catches both window scrolling and SPA scroll containers (e.g. ChatGPT)
    window.addEventListener('scroll', this.handleDocumentScroll, {
      capture: true,
      passive: true,
    });
    window.visualViewport?.addEventListener('resize', this.handleWindowResize, {
      passive: true,
    });
    window.visualViewport?.addEventListener('scroll', this.handleWindowScroll, {
      passive: true,
    });

    this.notifyHistoryChange();
  }

  public updateSettings(newSettings: ToolSettings): void {
    const prevTool = this.settings.activeTool;
    this.settings = { ...newSettings };
    if (prevTool !== newSettings.activeTool) {
      if (newSettings.activeTool !== 'eraser') {
        this.eraserCursorDocPos = null;
      }
      this.scheduleRender();
    }
  }

  /**
   * Toggles temporary webpage browse/passthrough mode (e.g. while holding Space).
   * If a stroke or erase gesture is currently in progress, commits it cleanly first.
   */
  public setPassthrough(passthrough: boolean): void {
    if (this.isPassthrough === passthrough) return;
    this.isPassthrough = passthrough;
    if (passthrough) {
      this.pointerHandler.finishCurrentStrokeIfActive();
      this.eraserCursorDocPos = null;
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
    this.teardownDprObserver();
    this.pointerHandler.destroy();
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('scroll', this.handleDocumentScroll, { capture: true });
    window.visualViewport?.removeEventListener('resize', this.handleWindowResize);
    window.visualViewport?.removeEventListener('scroll', this.handleWindowScroll);
    this.history.clear();
    this.strokes = [];
    this.activeStroke = null;
    this.preEraseStrokesSnapshot = null;
    this.activeScrollElement = null;
  }

  /**
   * Returns the effective document scroll offsets, combining `window.scrollX`/`scrollY`
   * with the primary inner scroll container when on an SPA like ChatGPT whose `window.scrollY` stays `0`.
   */
  public getScrollOffsets = (): ScrollOffsets => {
    let scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    let scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    if (
      scrollX === 0 &&
      scrollY === 0 &&
      this.activeScrollElement &&
      this.activeScrollElement.isConnected
    ) {
      scrollX = this.activeScrollElement.scrollLeft;
      scrollY = this.activeScrollElement.scrollTop;
    }

    return { scrollX, scrollY };
  };

  private setupDprObserver(): void {
    this.teardownDprObserver();
    if (typeof window.matchMedia !== 'function') return;
    const currentDpr = window.devicePixelRatio || 1;
    this.dprMediaQuery = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
    this.dprMediaQuery.addEventListener('change', this.handleDprChange);
  }

  private teardownDprObserver(): void {
    if (this.dprMediaQuery) {
      this.dprMediaQuery.removeEventListener('change', this.handleDprChange);
      this.dprMediaQuery = null;
    }
  }

  private handleDprChange = (): void => {
    this.setupDprObserver();
    this.updateCanvasDimensions();
    this.scheduleRender();
  };

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

  private handleDocumentScroll = (e: Event): void => {
    const target = e.target;
    if (
      target instanceof Element &&
      target !== document.documentElement &&
      target !== document.body
    ) {
      // Only track large primary page scroll containers (at least 50% of viewport area)
      // so small code-block or dropdown scrolls don't shift full-page annotations.
      const rect = target.getBoundingClientRect();
      if (
        rect.width >= window.innerWidth * 0.5 &&
        rect.height >= window.innerHeight * 0.5
      ) {
        this.activeScrollElement = target;
      }
    }
    this.scheduleRender();
  };

  private handleHoverMove = (point: StrokePoint | null): void => {
    if (this.settings.activeTool !== 'eraser' || this.isPassthrough) {
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
   * then immediately redraws existing strokes so resizing or zooming never loses ink.
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
    const { scrollX, scrollY } = this.getScrollOffsets();

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

    // Pass 1: Render visible highlighter strokes grouped by color onto the offscreen
    // highlighter buffer at 100% opacity, then composite each color layer at HIGHLIGHTER_OPACITY (0.36).
    if (hasVisibleHighlighters) {
      const highlighterColors: string[] = [];
      for (let i = 0; i < this.strokes.length; i++) {
        const s = this.strokes[i];
        if (
          s.tool === 'highlighter' &&
          isBoundingBoxVisible(s.bbox, scrollX, scrollY, viewportWidth, viewportHeight) &&
          !highlighterColors.includes(s.color)
        ) {
          highlighterColors.push(s.color);
        }
      }
      if (
        this.activeStroke &&
        this.activeStroke.tool === 'highlighter' &&
        !highlighterColors.includes(this.activeStroke.color)
      ) {
        highlighterColors.push(this.activeStroke.color);
      }

      for (let cIdx = 0; cIdx < highlighterColors.length; cIdx++) {
        const targetColor = highlighterColors[cIdx];

        hlCtx.save();
        hlCtx.setTransform(1, 0, 0, 1, 0, 0);
        hlCtx.clearRect(0, 0, this.highlighterCanvas.width, this.highlighterCanvas.height);
        hlCtx.scale(dpr, dpr);
        hlCtx.translate(-scrollX, -scrollY);

        for (let i = 0; i < this.strokes.length; i++) {
          const stroke = this.strokes[i];
          if (
            stroke.tool === 'highlighter' &&
            stroke.color === targetColor &&
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

        if (
          this.activeStroke &&
          this.activeStroke.tool === 'highlighter' &&
          this.activeStroke.color === targetColor
        ) {
          renderStroke(hlCtx, this.activeStroke, false);
        }

        hlCtx.restore();

        ctx.save();
        ctx.globalAlpha = HIGHLIGHTER_OPACITY;
        ctx.drawImage(this.highlighterCanvas, 0, 0);
        ctx.restore();
      }
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

    // Pass 3: Render visual eraser cursor ring when Eraser tool is active and not in passthrough mode
    if (
      !this.isPassthrough &&
      this.settings.activeTool === 'eraser' &&
      this.eraserCursorDocPos
    ) {
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
