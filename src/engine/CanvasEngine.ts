import type { Stroke, StrokePoint } from '../types/stroke';
import { HIGHLIGHTER_OPACITY, ToolSettings } from '../types/tools';
import { PointerInputHandler } from './PointerInputHandler';
import {
  buildStrokePath2D,
  computeStrokeBoundingBox,
  isBoundingBoxVisible,
  renderStroke,
} from './StrokeRenderer';

/**
 * Core imperative 2D Canvas drawing engine for PageInk.
 * Completely decoupled from React state during pointer movement to guarantee
 * zero React re-renders while drawing and minimal input-to-photon latency.
 *
 * Layering & Highlighter Strategy:
 * - Highlighter strokes are rendered onto an offscreen viewport buffer at full
 *   alpha (`1.0`), then composited onto the main canvas at `HIGHLIGHTER_OPACITY` (`0.36`)
 *   underneath opaque Pen strokes.
 * - Because overlapping highlighter strokes merge at `1.0` alpha on the offscreen layer
 *   before the layer is drawn with `globalAlpha = 0.36`, overlapping highlights of the
 *   same color never darken or turn muddy, and highlights never wash out pen ink.
 */
export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private highlighterCanvas: HTMLCanvasElement;
  private highlighterCtx: CanvasRenderingContext2D;
  private pointerHandler: PointerInputHandler;

  private settings: ToolSettings;
  private strokes: Stroke[] = [];
  private activeStroke: Stroke | null = null;

  private rafId: number | null = null;
  private needsRender = false;

  private viewportWidth = 0;
  private viewportHeight = 0;
  private dpr = 1;
  private strokeCounter = 0;

  constructor(canvas: HTMLCanvasElement, initialSettings: ToolSettings) {
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

    this.updateCanvasDimensions();

    this.pointerHandler = new PointerInputHandler(this.canvas, {
      canStartStroke: () =>
        this.settings.activeTool === 'pen' ||
        this.settings.activeTool === 'highlighter',
      onStrokeStart: this.handleStrokeStart,
      onStrokeMove: this.handleStrokeMove,
      onStrokeEnd: this.handleStrokeEnd,
      onStrokeCancel: this.handleStrokeCancel,
    });

    window.addEventListener('resize', this.handleWindowResize, { passive: true });
    window.addEventListener('scroll', this.handleWindowScroll, { passive: true });
  }

  public updateSettings(newSettings: ToolSettings): void {
    this.settings = { ...newSettings };
  }

  public getStrokes(): readonly Stroke[] {
    return this.strokes;
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pointerHandler.destroy();
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('scroll', this.handleWindowScroll);
    this.strokes = [];
    this.activeStroke = null;
  }

  private handleWindowResize = (): void => {
    this.updateCanvasDimensions();
    this.scheduleRender();
  };

  private handleWindowScroll = (): void => {
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

    this.strokeCounter += 1;

    this.activeStroke = {
      id: `stroke-${Date.now()}-${this.strokeCounter}`,
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
    if (!this.activeStroke) return;

    const completedStroke = this.activeStroke;
    this.activeStroke = null;

    if (completedStroke.points.length > 0) {
      completedStroke.bbox = computeStrokeBoundingBox(
        completedStroke.points,
        completedStroke.size
      );
      completedStroke.cachedPath = buildStrokePath2D(completedStroke, true);
      this.strokes.push(completedStroke);
    }

    this.scheduleRender();
  };

  private handleStrokeCancel = (): void => {
    if (!this.activeStroke) return;
    this.activeStroke = null;
    this.scheduleRender();
  };

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
    // This guarantees uniform translucency with zero excessive darkening where highlights overlap,
    // and keeps highlights visually underneath crisp pen strokes.
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

    ctx.restore();
  }
}
