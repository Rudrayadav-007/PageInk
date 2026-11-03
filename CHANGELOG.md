# Changelog

All notable changes to the **PageInk** Chrome extension are documented in this file.

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
