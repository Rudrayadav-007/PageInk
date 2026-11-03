import { Stroke, StrokePoint } from '../types/stroke';
import { ToolSettings } from '../types/tools';
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
 */
export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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
    this.settings = { ...initialSettings };

    this.updateCanvasDimensions();

    this.pointerHandler = new PointerInputHandler(this.canvas, {
      canStartStroke: () => this.settings.activeTool === 'pen',
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
   * Synchronizes the backing store resolution of the canvas with the viewport
   * CSS size and current `window.devicePixelRatio`, then immediately redraws
   * existing strokes so resizing never loses ink.
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

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Immediately render synchronously on resize so the canvas never flashes blank
    this.renderFrame();
  }

  private handleStrokeStart = (
    point: StrokePoint,
    simulatePressure: boolean
  ): void => {
    const size = this.settings.penSize;
    this.strokeCounter += 1;

    this.activeStroke = {
      id: `stroke-${Date.now()}-${this.strokeCounter}`,
      tool: 'pen',
      color: this.settings.color,
      size,
      points: [point],
      simulatePressure,
      bbox: computeStrokeBoundingBox([point], size),
    };

    this.scheduleRender();
  };

  private handleStrokeMove = (newPoints: StrokePoint[]): void => {
    if (!this.activeStroke) return;

    const stroke = this.activeStroke;
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
    const { viewportWidth, viewportHeight, dpr } = this;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply DPR scaling and translate from document coordinates to viewport coordinates
    ctx.scale(dpr, dpr);
    ctx.translate(-scrollX, -scrollY);

    // Render committed strokes that intersect the visible viewport
    for (let i = 0; i < this.strokes.length; i++) {
      const stroke = this.strokes[i];
      if (
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

    // Render currently active in-progress stroke
    if (this.activeStroke) {
      renderStroke(ctx, this.activeStroke, false);
    }

    ctx.restore();
  }
}

