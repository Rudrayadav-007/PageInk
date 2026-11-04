# Changelog

All notable changes to the **PageInk** Chrome extension are documented in this file.

## [0.8.1] - Draggable Floating Resume Icon & Separate Close Control

### Added
- **Separate Minimize (`—`) and Close (`×`) Controls** (`src/components/Toolbar.tsx`, `src/styles/overlay.css`):
  - Restored a dedicated **Close PageInk (`×`)** button alongside the **Minimize / Pause (`—`)** button at the right end of the toolbar with distinct hover states (`pi-minimize-btn` and `pi-close-btn`).
  - Clicking **Minimize / Pause (`—`)** pauses drawing and shows the floating resume icon; clicking **Close PageInk (`×`)** completely exits the session and removes the overlay.
- **Draggable Floating Resume Icon** (`src/components/OverlayApp.tsx`, `src/styles/overlay.css`):
  - Implemented Pointer Events dragging on the floating PageInk icon (`pi-resume-fab`) with pointer capture, viewport clamping (`clampFabPosition`), and a `5px` movement threshold (`exceedsFabDragThreshold`) so dragging repositions the icon without accidentally triggering resume, while a short click resumes drawing immediately.
  - Preserves the floating icon's custom position in memory across repeated Pause/Resume cycles and clamps it on browser window resize.

---

## [0.8.0] - Pause / Resume Mode, 2px Default Pen & Installation Guide

### Added
- **Pause / Resume Mode with Floating PageInk Icon** (`src/components/OverlayApp.tsx`, `src/components/Toolbar.tsx`, `src/styles/overlay.css`):
  - Replaced the toolbar's destructive close (`X`) button with a **Pause / Minimize (`-`)** button (also triggered by pressing `Escape` while drawing).
  - Pausing hides the full toolbar while keeping the `CanvasEngine` mounted and all existing annotations, selected tool, colors, thickness settings, and Undo/Redo history intact in memory.
  - While paused, the drawing canvas is completely click-through (`pointer-events: none`) for full webpage interaction and natural scrolling, and a compact glassmorphic PageInk icon (`pi-resume-fab`) appears in the bottom-right corner to resume drawing with one click.
  - Pressing `Escape` while already paused does not destroy the paused session. Clicking the Chrome extension toolbar icon toggles the session off completely when finished.
- **Beginner-Friendly Chrome Installation Guide** (`README.md`):
  - Added step-by-step unpacked installation instructions (ZIP or source build, `chrome://extensions`, Developer mode, Load unpacked, and toolbar pinning) and clarified Chrome Web Store status.

### Changed
- **Default Pen Thickness** (`src/types/tools.ts`):
  - Changed initial/default Pen thickness (`DEFAULT_TOOL_SETTINGS.penSize`) from `4px` to `2px` while keeping Highlighter default thickness at `22px`.

---

## [0.7.0] - Final Polish: Extension Icons, Draw-Mode Wheel Scrolling & Whole-Stroke Eraser

### Added
- **PageInk Chrome Extension Icons** (`public/icons/`, `wxt.config.ts`):
  - Added dedicated `16x16`, `32x32`, `48x48`, and `128x128` PNG icon assets (`icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`) featuring the dark charcoal rounded-square background, white page sheet, and electric-blue ink pen stroke.
  - Configured `manifest.icons` and `manifest.action.default_icon` in `wxt.config.ts`.
- **Natural Mouse-Wheel & Trackpad Scrolling in Draw Mode** (`src/engine/WheelScrollHandler.ts`, `src/engine/CanvasEngine.ts`):
  - Implemented non-passive wheel handling on the drawing canvas that temporarily sets `pointer-events: none` during `document.elementFromPoint(clientX, clientY)` to locate the underlying scrollable webpage element (supporting nested SPA scroll containers such as ChatGPT as well as standard document scrolling).
  - Supports vertical and horizontal trackpad scrolling, line/page wheel delta normalization, and preserves `Ctrl + wheel` for native browser zoom.

### Changed
- **Whole-Stroke Eraser** (`src/engine/EraserEngine.ts`, `src/engine/CanvasEngine.ts`):
  - Replaced partial-stroke splitting with whole-stroke erasing (`doesEraserHitStroke`, `eraseStrokesAlongSegment`): touching any part (beginning, middle, or end) of a Pen or Highlighter stroke removes that entire stroke object while leaving separate overlapping strokes untouched.
  - Removed unnecessary segment-densification and fragment-splitting logic, preserving exact original `Stroke` object references in Undo/Redo history.

---

## [0.6.0] - Phase 6: Final Engineering, Browser Integration and Release Readiness

### Added
- **Hold-Space Webpage Interaction (Browse Mode)** (`src/components/OverlayApp.tsx`, `src/engine/CanvasEngine.ts`):
  - Holding `Space` temporarily switches the drawing canvas to click-through (`pi-passthrough`), commits any in-progress stroke cleanly, and lets users scroll, click links/buttons, or select text on the underlying webpage while keeping the toolbar interactive.
  - Added `isEditableEventTarget()` guard (`composedPath()` inspection) so typing `Space` or `Ctrl+Z` inside webpage `<input>`, `<textarea>`, `select`, or `contentEditable` elements is never hijacked.
- **SPA Scroll Container & Browser Zoom / DPR Tracking** (`src/engine/CanvasEngine.ts`):
  - Added capture-phase scroll tracking (`handleDocumentScroll`) so single-page applications that scroll inside a main viewport container (such as ChatGPT) keep annotations aligned alongside standard `window.scrollX`/`scrollY` pages.
  - Added `visualViewport` and `window.matchMedia('(resolution: ...dppx)')` listeners to detect browser zoom and multi-monitor `devicePixelRatio` changes immediately.
  - Added viewport resize clamping to `Toolbar.tsx` so a dragged toolbar never gets stranded offscreen when the browser window shrinks.
- **Session Cleanup & Singleton Guard** (`entrypoints/content.tsx`, `entrypoints/background.ts`):
  - Added `window.__PAGEINK_CONTROLLER__` singleton guard and `ctx.onInvalidated` teardown to guarantee zero duplicate Shadow DOM roots, ghost canvases, or orphaned listeners.
  - Added `docs/TESTING.md` with manual browser verification and XP-Pen Artist/Deco hardware validation checklists.

---

## [0.5.0] - Phase 5: Toolbar Polish and Drawing Controls

### Added
- **Color Palettes** (`src/types/tools.ts`, `src/components/Toolbar.tsx`):
  - Added 8 Pen color swatches (Black, White, Red, Orange, Yellow, Green, Blue, Purple) and 4 Highlighter color swatches (Yellow, Green, Pink, Blue).
  - Updated `CanvasEngine` highlighter compositing pass to group visible highlighter strokes by color on the offscreen buffer so overlapping strokes of the same color maintain uniform `0.36` opacity while different highlighter colors remain distinct.
- **Independent Thickness Controls** (`src/components/Toolbar.tsx`, `src/components/OverlayApp.tsx`, `src/styles/overlay.css`):
  - Added compact contextual customization sub-row for Pen (`1–12px`) and Highlighter (`8–32px`) with a live visual thickness dot preview, compact slider, and pixel readout.
  - Ensured changing colors or thickness updates only in-memory settings for subsequent strokes without mutating existing strokes or triggering unnecessary canvas redraws.

---

## [0.4.0] - Phase 4: Eraser, Undo, Redo and Clear All

### Added
- **Partial Segment Eraser** (`src/engine/EraserEngine.ts`):
  - Implemented two-stage hit testing: fast axis-aligned bounding-box (AABB) rejection (`doesEraserSweepIntersectBbox`) followed by swept capsule segment distance checks (`distToSegmentSquared`).
  - Added automatic segment densification (`densifyStrokePoints`) with linear pressure interpolation so fast strokes with widely spaced sample points split cleanly in their interior.
  - Implemented stroke partitioning (`eraseStrokesAlongSegment`) that splits intersected Pen and Highlighter strokes into surviving contiguous segments while preserving original color, thickness, tool type, z-order, and per-point stylus pressure.
  - Added a dual-ring visual eraser cursor rendered on the overlay canvas (`CanvasEngine.ts`) with native cursor hiding (`pi-eraser-cursor`).
- **Undo, Redo & Clear All History Manager** (`src/engine/HistoryManager.ts`):
  - Implemented `HistoryManager` using structural-sharing immutable stroke-list snapshots (`readonly Stroke[]`) so unchanged strokes share memory and cached `Path2D` instances across history states.
  - Grouped continuous eraser drag movements into a single logical Undo entry committed on `pointerup` (and rolled back if `pointercancel` occurs).
  - Implemented one-click `Clear All` (`clearAll()`) that is fully reversible via `Undo` and repeatable via `Redo`.
  - Connected `Eraser`, `Undo`, `Redo`, and `Clear All` buttons in `Toolbar.tsx` and `OverlayApp.tsx`, including reactive disabled states and `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` keyboard shortcuts.

---

## [0.3.0] - Phase 3: Stylus Pressure and Highlighter

### Added
- **Stylus Pressure & Tablet Input** (`src/engine/PointerInputHandler.ts`, `src/engine/StrokeRenderer.ts`):
  - Implemented hardware pressure detection (`detectHardwarePressure`) supporting both `pointerType === "pen"` and external tablet drivers that report `pointerType === "mouse"` while providing variable `PointerEvent.pressure`.
  - Implemented `normalizeAndSmoothPressure` with a `0.8` gamma curve, exponential moving average (EMA) smoothing (`alpha = 0.45`), and a minimum pressure floor (`0.12`) to prevent sudden width jumps or zero-width strokes.
  - Tuned `perfect-freehand` options separately for hardware-pressure styluses (`thinning: 0.62`, sine easing) versus standard mice (`thinning: 0.18`).
  - Added multi-touch gesture cancellation and palm-rejection handoff when a pen touches down over an active touch contact.
- **Highlighter Tool & Layer Compositing** (`src/engine/CanvasEngine.ts`, `src/types/tools.ts`):
  - Connected the toolbar's **Highlighter** button to `CanvasEngine` with default semi-transparent yellow (`#facc15`, thickness `22px`, opacity `0.36`) and uniform marker width (`thinning: 0`).
  - Added an offscreen viewport highlighter canvas buffer that merges visible highlighter strokes at `1.0` alpha before compositing once at `0.36` opacity underneath Pen strokes—preventing opacity buildup where highlights overlap and keeping pen strokes crisp on top.

---

## [0.2.0] - Phase 2: Canvas Drawing Engine

### Added
- **Stroke Data Model** (`src/types/stroke.ts`): Added `Stroke`, `StrokePoint`, and `BoundingBox` interfaces storing coordinates in document space (`clientX + scrollX`, `clientY + scrollY`).
- **Freehand Stroke Renderer** (`src/engine/StrokeRenderer.ts`):
  - Integrated `perfect-freehand` with quadratic Bézier SVG spline conversion (`Path2D`) and rounded start/end caps.
  - Added single-point tap fallback rendering clean circular dots.
  - Added `Path2D` caching on completed strokes and axis-aligned bounding-box viewport culling (`isBoundingBoxVisible`).
- **Pointer Input Handler** (`src/engine/PointerInputHandler.ts`):
  - Implemented Pointer Events API handling (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `lostpointercapture`).
  - Added `setPointerCapture` / `releasePointerCapture` and high-frequency sample extraction via `PointerEvent.getCoalescedEvents()`.
  - Added viewport coordinate clamping and automatic clearing of accidental webpage text selection during drawing.
- **Imperative Canvas Engine** (`src/engine/CanvasEngine.ts`):
  - Implemented `devicePixelRatio`-aware viewport canvas sizing that preserves and synchronously redraws strokes on window resize.
  - Decoupled drawing loop from React state using on-demand `requestAnimationFrame` scheduling.
  - Connected `OverlayApp` and `Toolbar` Pen tool state to `CanvasEngine` with full listener and memory cleanup on close.

---

## [0.1.0] - Phase 1: Extension Foundation & Shadow DOM Toolbar

### Added
- Initialized **WXT** + **React 18** + **TypeScript** project targeting Chrome **Manifest V3**.
- Configured minimal permissions (`activeTab`, `scripting`) with zero permanent host permissions.
- Implemented background service worker (`entrypoints/background.ts`) to inject content script on demand and toggle annotation mode via extension icon click.
- Implemented isolated Shadow DOM overlay (`<pageink-overlay>`) in `entrypoints/content.tsx` with inline scoped styles (`src/styles/overlay.css`).
- Built compact, draggable Excalidraw-inspired dark charcoal toolbar (`src/components/Toolbar.tsx`) with Lucide icons, active tool indicator, and `Escape` / Close button dismissal.
