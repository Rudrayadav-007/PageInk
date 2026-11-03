# PageInk

**PageInk** is a lightweight, Excalidraw-inspired Chrome extension that places a transparent floating ink layer directly over any webpage.

Designed for studying technical documentation, ChatGPT responses, code blocks, and tutorials, PageInk feels like drawing on a clear acetate sheet over the browser viewport—without modifying the underlying webpage DOM or requiring accounts, cloud sync, or heavy dashboards.

---

## Current Implemented Features (Phase 2)

- **On-Demand Activation**: Click the PageInk toolbar icon to inject and toggle the drawing overlay on the active tab (`activeTab` + `scripting` permissions only).
- **Shadow DOM Isolation**: Renders the floating toolbar and viewport canvas inside an isolated Shadow DOM root (`<pageink-overlay>`) so host webpage styles and DOM remain untouched.
- **Compact Draggable Toolbar**: Excalidraw-inspired dark charcoal floating toolbar (`344px` wide) with Lucide icons, active tool state, drag handle, and `Escape` / Close button dismissal.
- **Smooth Freehand Pen Engine**:
  - Powered by `perfect-freehand` and quadratic Bézier `Path2D` splines with rounded caps.
  - High-DPI (`window.devicePixelRatio`) viewport canvas that preserves strokes across window resizes.
  - Pointer Events API with pointer capture (`setPointerCapture`), coalesced sample extraction (`getCoalescedEvents()`), sub-pixel filtering, and webpage text-selection prevention.
  - Document-coordinate stroke storage (`clientX + scrollX`, `clientY + scrollY`) with bounding-box viewport culling and on-demand `requestAnimationFrame` rendering.
  - Zero React state updates during pointer movement for minimal input latency.
- **Ephemeral In-Memory Session**: Closing the overlay completely removes listeners and discards session strokes from memory.

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
│   │   ├── CanvasEngine.ts      # Imperative 2D canvas manager, DPR scaling & rAF loop
│   │   ├── PointerInputHandler.ts # Pointer capture, coalesced events & viewport clamping
│   │   └── StrokeRenderer.ts    # perfect-freehand outline to Path2D conversion & culling
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

- **Phase 3 (Next)**: Pressure-sensitive stylus input tuning (`PointerEvent.pressure`), external drawing tablet support (XP-Pen Artist/Deco, Wacom, Windows Ink), multi-touch rejection, and translucent **Highlighter** tool.
- **Phase 4**: True vector/segment **Eraser**, **Undo**, **Redo**, and **Clear All** history manager.
- **Phase 5**: Interactive color palette and adjustable Pen / Highlighter thickness controls in the floating toolbar.
- **Phase 6**: Hold `Space` for temporary webpage passthrough/scrolling, session cleanup hardening, and scroll performance optimizations.
- **Phase 7**: Cross-site verification on dynamic web apps (ChatGPT, YouTube, technical documentation) and final production polish.
