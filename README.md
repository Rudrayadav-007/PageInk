# PageInk

**PageInk** is a lightweight, Excalidraw-inspired Chrome extension that places a transparent floating ink layer directly over any webpage.

Designed for studying technical documentation, ChatGPT responses, code blocks, and tutorials, PageInk feels like drawing on a clear acetate sheet over the browser viewport—without modifying the underlying webpage DOM or requiring accounts, cloud sync, or heavy dashboards.

---

## Current Implemented Features (Phase 6 — Release Candidate)

- **On-Demand Activation**: Click the PageInk toolbar icon to inject and toggle the drawing overlay on the active tab (`activeTab` + `scripting` permissions only).
- **Shadow DOM Isolation**: Renders the floating toolbar and viewport canvas inside an isolated Shadow DOM root (`<pageink-overlay>`) so host webpage styles and DOM remain untouched, with singleton guard protection against duplicate roots.
- **Compact Draggable Toolbar & Customization Controls**:
  - Excalidraw-inspired dark charcoal floating toolbar (`348px` wide) with Lucide icons, active tool state (`Pen`, `Highlighter`, `Eraser`), live `Undo` / `Redo` / `Clear All` action buttons, drag handle, and `Escape` / Close button dismissal.
  - Dedicated **Pen Color Palette** (8 colors: Black, White, Red, Orange, Yellow, Green, Blue, Purple) and **Highlighter Color Palette** (4 colors: Yellow, Green, Pink, Blue).
  - Independent **Thickness Controls** for Pen (`1–12px`) and Highlighter (`8–32px`) with live visual dot size/color preview and compact range slider.
- **Pressure-Sensitive Stylus & Smooth Freehand Pen Engine**:
  - Powered by `perfect-freehand` and quadratic Bézier `Path2D` splines with rounded caps.
  - Captures real hardware stylus pressure (`PointerEvent.pressure`) with a gentle gamma response curve, exponential moving average (EMA) pressure smoothing, and a safe minimum pressure floor (`0.12`) to prevent zero-width strokes.
  - Hardware-agnostic pressure detection supporting standard Windows Ink / Wintab styluses (`pointerType === "pen"`) as well as external drawing tablets (XP-Pen Artist/Deco, Wacom) even when a driver emulates mouse pointer events while exposing variable pressure.
  - Consistent fallback stroke thickness for standard mice and non-pressure touchpads.
  - Multi-touch and palm-rejection safeguards so two-finger scroll/pinch gestures or stray palm contact do not leave unintended ink.
  - High-DPI (`window.devicePixelRatio`) viewport canvas that monitors window resize, `visualViewport`, and `matchMedia` resolution changes (browser zoom) without losing existing strokes.
  - Document-coordinate stroke storage (`clientX + scrollX`, `clientY + scrollY`) supporting both standard window scrolling and primary SPA scroll containers (such as ChatGPT conversations), with bounding-box viewport culling and on-demand `requestAnimationFrame` rendering.
- **Hold-Space Webpage Interaction (Browse Mode)**:
  - Hold `Space` at any time to temporarily make the drawing canvas click-through (`pointer-events: none`), allowing normal webpage scrolling, clicking buttons/links, and selecting text.
  - Releasing `Space` immediately restores drawing mode.
  - Automatically ignores `Space` and keyboard shortcuts when typing inside webpage `<input>`, `<textarea>`, or `contenteditable` fields.
- **Translucent Highlighter Tool**:
  - Smooth, uniform-width (`thinning: 0`) freehand marker strokes with rounded caps and configurable marker colors (Yellow, Green, Pink, Blue at `0.36` opacity).
  - Per-color offscreen layer compositing strategy: visible highlighter strokes of each color render at `1.0` alpha onto a dedicated offscreen viewport buffer and composite at `0.36` opacity underneath Pen strokes—preventing overlapping highlights of the same color from darkening excessively while keeping distinct highlighter colors crisp and underneath pen ink.
- **Partial Segment Eraser**:
  - Swept capsule hit-testing with fast axis-aligned bounding-box (AABB) rejection (`EraserEngine.ts`).
  - Subdivides long stroke segments and splits intersected Pen or Highlighter strokes into surviving contiguous segments rather than deleting whole strokes, preserving original color, thickness, tool type, and per-point stylus pressure.
  - High-contrast dual-ring visual eraser cursor rendered on the overlay canvas.
- **Undo, Redo & Clear All History Manager**:
  - Structural-sharing immutable snapshot history (`HistoryManager.ts`) supporting Pen strokes, Highlighter strokes, partial segment erasing, and one-click `Clear All`.
  - Groups continuous eraser drag gestures into a single logical Undo operation on pointer release.
  - Supports toolbar buttons as well as `Ctrl+Z` / `Cmd+Z` (Undo) and `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` (Redo).
- **Ephemeral In-Memory Session**: Closing the overlay completely removes all listeners, cancels pending animation frames, and discards session strokes and history from memory.

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
│   ├── ARCHITECTURE.md          # Drawing engine & component architecture
│   └── TESTING.md               # Browser test plan & XP-Pen hardware checklist
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

## Known Design Boundaries & Limitations

- **Document-Coordinate Annotations**: Annotations are stored in document/scroll coordinates (`scrollX`, `scrollY`), not bound to individual DOM nodes. If an accordion or dynamic element expands and shifts page layout vertically, annotations remain at their document coordinates.
- **Ephemeral Session by Design**: PageInk intentionally stores zero data in `chrome.storage` or external servers. Closing the overlay (`Escape` or `X`) or reloading the tab clears the session.
- **Browser-Restricted Pages**: Chromium extensions cannot inject scripts into internal pages (`chrome://`, `edge://`, `about:`) or the Chrome Web Store.
- **Hardware Validation**: See [`docs/TESTING.md`](docs/TESTING.md) for the manual browser verification checklist and XP-Pen Artist/Deco hardware test procedures.
