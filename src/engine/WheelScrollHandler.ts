/**
 * Normalizes a `WheelEvent`'s `deltaX` and `deltaY` into CSS pixels based on `deltaMode`.
 * - `0` (`DOM_DELTA_PIXEL`): 1:1 pixels
 * - `1` (`DOM_DELTA_LINE`): ~16px per line
 * - `2` (`DOM_DELTA_PAGE`): ~85% of viewport width/height per page
 */
export function normalizeWheelDeltaToPixels(
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  viewportWidth: number,
  viewportHeight: number
): { dx: number; dy: number } {
  if (deltaMode === 1) {
    return { dx: deltaX * 16, dy: deltaY * 16 };
  }
  if (deltaMode === 2) {
    return {
      dx: deltaX * Math.max(100, viewportWidth * 0.85),
      dy: deltaY * Math.max(100, viewportHeight * 0.85),
    };
  }
  return { dx: deltaX, dy: deltaY };
}

/**
 * Checks whether `overflowValue` permits user scrolling (`auto`, `scroll`, or `overlay`).
 */
export function isOverflowScrollable(overflowValue: string): boolean {
  return (
    overflowValue === 'auto' ||
    overflowValue === 'scroll' ||
    overflowValue === 'overlay'
  );
}

/**
 * Checks whether an element can currently scroll in the given vertical (`dy`) or
 * horizontal (`dx`) direction by at least 1 pixel.
 */
export function canElementScrollInDirection(
  el: Element,
  dx: number,
  dy: number,
  overflowX: string,
  overflowY: string
): { canScrollX: boolean; canScrollY: boolean } {
  let canScrollY = false;
  let canScrollX = false;

  if (Math.abs(dy) > 0.01 && isOverflowScrollable(overflowY)) {
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    if (maxScrollTop > 1) {
      if (dy > 0 && el.scrollTop < maxScrollTop - 0.5) {
        canScrollY = true;
      } else if (dy < 0 && el.scrollTop > 0.5) {
        canScrollY = true;
      }
    }
  }

  if (Math.abs(dx) > 0.01 && isOverflowScrollable(overflowX)) {
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    if (maxScrollLeft > 1) {
      if (dx > 0 && el.scrollLeft < maxScrollLeft - 0.5) {
        canScrollX = true;
      } else if (dx < 0 && el.scrollLeft > 0.5) {
        canScrollX = true;
      }
    }
  }

  return { canScrollX, canScrollY };
}

/**
 * Walks up the DOM ancestor chain from `startEl` to find the nearest element that
 * can scroll in the requested `(dx, dy)` wheel direction, falling back to
 * `document.scrollingElement` (or `document.documentElement`).
 */
export function findScrollableTarget(
  startEl: Element | null,
  dx: number,
  dy: number
): Element | null {
  const rootScroller =
    document.scrollingElement || document.documentElement || document.body;

  let current: Element | null = startEl;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const { canScrollX, canScrollY } = canElementScrollInDirection(
      current,
      dx,
      dy,
      style.overflowX,
      style.overflowY
    );

    if (canScrollY || canScrollX) {
      return current;
    }

    current =
      current.parentElement ||
      (current.getRootNode() instanceof ShadowRoot
        ? (current.getRootNode() as ShadowRoot).host
        : null);
  }

  return rootScroller;
}

/**
 * Handles wheel / trackpad scrolling while the PageInk annotation canvas is active
 * in Draw mode:
 * - Preserves `Ctrl + wheel` (or `Meta + wheel`) so native browser zoom continues working.
 * - Temporarily disables `pointer-events` on the canvas during `document.elementFromPoint()`
 *   to identify the true underlying webpage element (e.g., ChatGPT's conversation scroll area).
 * - Scrolls the nearest scrollable ancestor (or document scrolling element) directly via
 *   `scrollBy({ left: dx, top: dy, behavior: 'auto' })`.
 */
export function handleCanvasWheelScroll(
  e: WheelEvent,
  canvas: HTMLCanvasElement,
  isPassthrough: boolean
): Element | null {
  // 1. Preserve native browser zoom for Ctrl + wheel (and trackpad pinch-to-zoom which sets ctrlKey=true)
  if (e.ctrlKey || e.metaKey) {
    return null;
  }

  // 2. If already in Space Browse mode, the canvas has pointer-events: none and native scrolling handles it
  if (isPassthrough) {
    return null;
  }

  const { dx, dy } = normalizeWheelDeltaToPixels(
    e.deltaX,
    e.deltaY,
    e.deltaMode,
    window.innerWidth,
    window.innerHeight
  );

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return null;
  }

  // 3. Temporarily make the annotation canvas transparent to hit-testing so
  // document.elementFromPoint() returns the underlying webpage element at the cursor.
  const prevPointerEvents = canvas.style.pointerEvents;
  canvas.style.pointerEvents = 'none';
  let underlyingEl: Element | null = null;
  try {
    underlyingEl = document.elementFromPoint(e.clientX, e.clientY);
  } finally {
    canvas.style.pointerEvents = prevPointerEvents;
  }

  const scrollTarget = findScrollableTarget(underlyingEl, dx, dy);
  if (!scrollTarget) {
    return null;
  }

  e.preventDefault();
  e.stopPropagation();

  if (typeof scrollTarget.scrollBy === 'function') {
    scrollTarget.scrollBy({
      left: dx,
      top: dy,
      behavior: 'auto',
    });
  } else {
    scrollTarget.scrollLeft += dx;
    scrollTarget.scrollTop += dy;
  }

  return scrollTarget;
}

