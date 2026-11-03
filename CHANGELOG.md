# Changelog

All notable changes to the **PageInk** Chrome extension are documented in this file.

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
