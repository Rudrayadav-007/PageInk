# PageInk

**PageInk** is a lightweight, Excalidraw-inspired Chrome extension that places a transparent floating ink layer directly over any webpage.

Designed for studying technical documentation, ChatGPT responses, code blocks, and tutorials, PageInk feels like drawing on a clear acetate sheet over the browser viewport—without modifying the underlying webpage DOM or requiring accounts, cloud sync, or heavy dashboards.

---

## Current Implemented Features (Phase 4)

- **On-Demand Activation**: Click the PageInk toolbar icon to inject and toggle the drawing overlay on the active tab (`activeTab` + `scripting` permissions only).
- **Shadow DOM Isolation**: Renders the floating toolbar and viewport canvas inside an isolated Shadow DOM root (`<pageink-overlay>`) so host webpage styles and DOM remain untouched.
- **Compact Draggable Toolbar**: Excalidraw-inspired dark charcoal floating toolbar (`344px` wide) with Lucide icons, active tool state (`Pen`, `Highlighter`, `Eraser`), live `Undo` / `Redo` / `Clear All` action buttons, drag handle, and `Escape` / Close button dismissal.
- **Pressure-Sensitive Stylus & Smooth Freehand Pen Engine**:
  - Powered by `perfect-freehand` and quadratic Bézier `Path2D` splines with rounded caps.
  - Captures real hardware stylus pressure (`PointerEvent.pressure`) with a gentle gamma response curve, exponential moving average (EMA) pressure smoothing, and a safe minimum pressure floor (`0.12`) to prevent zero-width strokes.
  - Hardware-agnostic pressure detection supporting standard Windows Ink / Wintab styluses (`pointerType === "pen"`) as well as external drawing tablets (XP-Pen Artist/Deco, Wacom) even when a driver emulates mouse pointer events while exposing variable pressure.
  - Consistent fallback stroke thickness for standard mice and non-pressure touchpads.
  - Multi-touch and palm-rejection safeguards so two-finger scroll/pinch gestures or stray palm contact do not leave unintended ink.
  - High-DPI (`window.devicePixelRatio`) viewport canvas that preserves strokes across window resizes.
  - Document-coordinate stroke storage (`clientX + scrollX`, `clientY + scrollY`) with bounding-box viewport culling and on-demand `requestAnimationFrame` rendering.
- **Translucent Highlighter Tool**:
  - Smooth, uniform-width (`thinning: 0`) freehand marker strokes with rounded caps and semi-transparent yellow (`#facc15` at `0.36` opacity) default.
  - Offscreen layer compositing strategy: all visible highlighter strokes render at `1.0` alpha onto a dedicated offscreen viewport buffer and composite once at `0.36` opacity underneath Pen strokes—preventing overlapping highlights from darkening excessively or washing out pen ink.
- **Partial Segment Eraser**:
  - Swept capsule hit-testing with fast axis-aligned bounding-box (AABB) rejection (`EraserEngine.ts`).
  - Subdivides long stroke segments and splits intersected Pen or Highlighter strokes into surviving contiguous segments rather than deleting whole strokes, preserving original color, thickness, tool type, and per-point stylus pressure.
  - High-contrast dual-ring visual eraser cursor rendered on the overlay canvas.
- **Undo, Redo & Clear All History Manager**:
  - Structural-sharing immutable snapshot history (`HistoryManager.ts`) supporting Pen strokes, Highlighter strokes, partial segment erasing, and one-click `Clear All`.
  - Groups continuous eraser drag gestures into a single logical Undo operation on pointer release.
  - Supports toolbar buttons as well as `Ctrl+Z` / `Cmd+Z` (Undo) and `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` (Redo).
- **Ephemeral In-Memory Session**: Closing the overlay completely removes listeners and discards session strokes and history from memory.

---

## Technology Stack

- **Extension Framework**: [WXT](https://wxt.dev/) (Manifest V3)
- **UI Layer**: React 18 + TypeScript
- **Drawing & Geometry**: HTML5 Canvas 2D API + [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand)
- **Icons**: [`lucide-react`](https://lucide.dev/)
- **Styling**: Scoped Shadow DOM CSS

---

## Project Structure

```text
PageInk/
├── docs/
│   └── ARCHITECTURE.md          # Drawing engine & component architecture
├── entrypoints/
│   ├── background.ts            # MV3 service worker (action click & on-demand script injection)
│   └── content.tsx              # Content script mounting isolated Shadow DOM UI
├── src/
│   ├── components/
│   │   ├── OverlayApp.tsx       # Root overlay component bridging CanvasEngine & Toolbar
│   │   └── Toolbar.tsx          # Compact draggable floating toolbar
│   ├── config/
│   │   └── brand.ts             # Centralized PageInk branding & message constants
│   ├── engine/
│   │   ├── CanvasEngine.ts        # Imperative 2D canvas manager, DPR scaling & rAF loop
│   │   ├── EraserEngine.ts        # AABB culling, segment densification & partial stroke splitting
│   │   ├── HistoryManager.ts      # Structural-sharing Undo/Redo & Clear All state manager
│   │   ├── PointerInputHandler.ts # Pointer capture, pressure smoothing & coalesced events
│   │   └── StrokeRenderer.ts      # perfect-freehand outline to Path2D conversion & culling
│   ├── styles/
│   │   └── overlay.css          # Scoped styles injected into the Shadow DOM
│   └── types/
│       ├── stroke.ts            # Stroke, StrokePoint, and BoundingBox types
│       └── tools.ts             # Tool settings and color palette definitions
├── CHANGELOG.md
├── package.json
├── tsconfig.json
└── wxt.config.ts
```

---

## Local Development Instructions

### Prerequisites
- Node.js `>= 18` and `npm`
- Google Chrome or any Chromium-based browser

### Setup & Build
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run TypeScript type-checking:
   ```bash
   npm run compile
   ```
3. Build the production extension bundle:
   ```bash
   npm run build
   ```
   The unpacked extension is generated in `.output/chrome-mv3`.

### Loading in Chrome
1. Navigate to `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `.output/chrome-mv3` directory.
4. Open any standard webpage (`https://...`) and click the **PageInk** extension icon to toggle annotation mode.

---

## Current Limitations & Upcoming Roadmap

- **Phase 5 (Next)**: Interactive color palette and adjustable Pen / Highlighter thickness controls in the floating toolbar.
- **Phase 6**: Hold `Space` for temporary webpage passthrough/scrolling, session cleanup hardening, and scroll performance optimizations.
- **Phase 7**: Cross-site verification on dynamic web apps (ChatGPT, YouTube, technical documentation) and final production polish.
