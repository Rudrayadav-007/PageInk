# PageInk

**PageInk** is a lightweight, Excalidraw-inspired Chrome extension that places a transparent floating ink layer directly over any webpage.

Designed for studying technical documentation, ChatGPT responses, code blocks, and tutorials, PageInk feels like drawing on a clear acetate sheet over the browser viewport—without modifying the underlying webpage DOM or requiring accounts, cloud sync, or heavy dashboards.

---

## Current Implemented Features (Phase 6 — Release Candidate)

- **On-Demand Activation**: Click the PageInk toolbar icon to inject and toggle the drawing overlay on the active tab (`activeTab` + `scripting` permissions only).
- **Shadow DOM Isolation**: Renders the floating toolbar and viewport canvas inside an isolated Shadow DOM root (`<pageink-overlay>`) so host webpage styles and DOM remain untouched, with singleton guard protection against duplicate roots.
- **Compact Draggable Toolbar & Customization Controls**:
  - Excalidraw-inspired dark charcoal floating toolbar (`348px` wide) with Lucide icons, active tool state (`Pen`, `Highlighter`, `Eraser`), live `Undo` / `Redo` / `Clear All` action buttons, drag handle, and `Pause` (`-` button or `Escape`) to minimize into a floating resume icon.
  - Dedicated **Pen Color Palette** (8 colors: Black, White, Red, Orange, Yellow, Green, Blue, Purple) and **Highlighter Color Palette** (4 colors: Yellow, Green, Pink, Blue).
  - Independent **Thickness Controls** for Pen (`1–12px`, default `2px`) and Highlighter (`8–32px`, default `22px`) with live visual dot size/color preview and compact range slider.
- **Pause & Resume Mode**:
  - Click the **Pause (`-`)** button on the toolbar (or press `Escape`) to hide the full toolbar while keeping all existing annotations visible on the page.
  - In Pause mode, the drawing canvas becomes completely click-through (`pointer-events: none`) so you can click links, select text, type in inputs, and scroll naturally while a compact glassmorphic PageInk icon floats near the bottom-right corner.
  - Click the floating PageInk icon at any time to restore the full toolbar, active tool, color/thickness settings, and Undo/Redo history. Clicking the Chrome extension toolbar icon fully exits and clears the session.
- **Pressure-Sensitive Stylus & Smooth Freehand Pen Engine**:
  - Powered by `perfect-freehand` and quadratic Bézier `Path2D` splines with rounded caps.
  - Captures real hardware stylus pressure (`PointerEvent.pressure`) with a gentle gamma response curve, exponential moving average (EMA) pressure smoothing, and a safe minimum pressure floor (`0.12`) to prevent zero-width strokes.
  - Hardware-agnostic pressure detection supporting standard Windows Ink / Wintab styluses (`pointerType === "pen"`) as well as external drawing tablets (XP-Pen Artist/Deco, Wacom) even when a driver emulates mouse pointer events while exposing variable pressure.
  - Consistent fallback stroke thickness for standard mice and non-pressure touchpads.
  - Multi-touch and palm-rejection safeguards so two-finger scroll/pinch gestures or stray palm contact do not leave unintended ink.
  - High-DPI (`window.devicePixelRatio`) viewport canvas that monitors window resize, `visualViewport`, and `matchMedia` resolution changes (browser zoom) without losing existing strokes.
  - Document-coordinate stroke storage (`clientX + scrollX`, `clientY + scrollY`) supporting both standard window scrolling and primary SPA scroll containers (such as ChatGPT conversations), with bounding-box viewport culling and on-demand `requestAnimationFrame` rendering.
- **Natural Mouse-Wheel & Trackpad Scrolling in Draw Mode**:
  - Scroll directly with the mouse wheel or two-finger trackpad (vertical and horizontal) while in Draw mode without hiding annotations or switching modes.
  - Uses hit-test pass-through (`document.elementFromPoint()`) to detect and scroll nested scrollable containers (such as ChatGPT's conversation scroll area) or fall back to the document scrolling element, while preserving `Ctrl + wheel` browser zoom.
- **Hold-Space Webpage Interaction (Browse Mode)**:
  - Hold `Space` at any time to temporarily make the drawing canvas click-through (`pointer-events: none`), allowing clicking buttons/links and selecting text on the underlying webpage.
  - Releasing `Space` immediately restores drawing mode.
  - Automatically ignores `Space` and keyboard shortcuts when typing inside webpage `<input>`, `<textarea>`, or `contenteditable` fields.
- **Translucent Highlighter Tool**:
  - Smooth, uniform-width (`thinning: 0`) freehand marker strokes with rounded caps and configurable marker colors (Yellow, Green, Pink, Blue at `0.36` opacity).
  - Per-color offscreen layer compositing strategy: visible highlighter strokes of each color render at `1.0` alpha onto a dedicated offscreen viewport buffer and composite at `0.36` opacity underneath Pen strokes—preventing overlapping highlights of the same color from darkening excessively while keeping distinct highlighter colors crisp and underneath pen ink.
- **Whole-Stroke Eraser**:
  - Swept capsule segment-to-segment hit-testing with fast axis-aligned bounding-box (AABB) rejection (`EraserEngine.ts`).
  - Touching any portion (beginning, middle, or end) of a continuous Pen or Highlighter stroke removes that entire stroke cleanly without affecting independent overlapping strokes.
  - High-contrast dual-ring visual eraser cursor rendered on the overlay canvas.
- **Undo, Redo & Clear All History Manager**:
  - Structural-sharing immutable snapshot history (`HistoryManager.ts`) supporting Pen strokes, Highlighter strokes, whole-stroke erasing, and one-click `Clear All`.
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
├── public/
│   └── icons/                   # Extension PNG icons (16x16, 32x32, 48x48, 128x128)
├── src/
│   ├── components/
│   │   ├── OverlayApp.tsx       # Root overlay component bridging CanvasEngine & Toolbar
│   │   └── Toolbar.tsx          # Compact draggable floating toolbar
│   ├── config/
│   │   └── brand.ts             # Centralized PageInk branding & message constants
│   ├── engine/
│   │   ├── CanvasEngine.ts        # Imperative 2D canvas manager, DPR scaling & rAF loop
│   │   ├── EraserEngine.ts        # AABB culling & whole-stroke capsule hit testing
│   │   ├── HistoryManager.ts      # Structural-sharing Undo/Redo & Clear All state manager
│   │   ├── PointerInputHandler.ts # Pointer capture, pressure smoothing & coalesced events
│   │   ├── StrokeRenderer.ts      # perfect-freehand outline to Path2D conversion & culling
│   │   └── WheelScrollHandler.ts  # Underlying scroll container detection & wheel forwarding
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

## Installation in Chrome

> **Availability Note**: PageInk is currently installed as an unpacked Chrome extension (for local use and development). Once published to the Chrome Web Store, a one-click store installation link will be provided here.

### Quick Install (Unpacked Extension)
1. **Download PageInk**: Download the latest PageInk release ZIP from GitHub (or clone this repository with `git clone https://github.com/Rudrayadav-007/PageInk.git`).
2. **Extract (if using a ZIP)**: Extract the downloaded ZIP archive to a folder on your computer. *(If you cloned the source repository instead of downloading a prebuilt release ZIP, run `npm install && npm run build` first—see below.)*
3. **Open Chrome Extensions**: Open Google Chrome and navigate to `chrome://extensions` in the address bar.
4. **Enable Developer Mode**: Toggle on **Developer mode** in the top-right corner.
5. **Load Unpacked**: Click **Load unpacked** in the top-left corner.
6. **Select the Build Folder**: Select the extracted production build folder containing `manifest.json` (located at `.output/chrome-mv3` when built from source).
7. **Pin & Start Drawing**: Click the puzzle-piece **Extensions** icon in Chrome's toolbar, pin **PageInk**, and click the PageInk icon on any webpage to start drawing.

---

## Local Development & Building from Source

### Prerequisites
- Node.js `>= 18` and `npm`
- Google Chrome or any Chromium-based browser

### Build Steps
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
   The unpacked production extension (containing `manifest.json`) is generated in `.output/chrome-mv3`.

---

## Known Design Boundaries & Limitations

- **Document-Coordinate Annotations**: Annotations are stored in document/scroll coordinates (`scrollX`, `scrollY`), not bound to individual DOM nodes. If an accordion or dynamic element expands and shifts page layout vertically, annotations remain at their document coordinates.
- **Ephemeral Session by Design**: PageInk intentionally stores zero data in `chrome.storage` or external servers. Pausing the toolbar (`-` or `Escape`) keeps your annotations and history alive in memory while you browse; clicking the Chrome extension icon again or reloading the tab ends the session.
- **Browser-Restricted Pages**: Chromium extensions cannot inject scripts into internal pages (`chrome://`, `edge://`, `about:`) or the Chrome Web Store.
- **Hardware Validation**: See [`docs/TESTING.md`](docs/TESTING.md) for the manual browser verification checklist and XP-Pen Artist/Deco hardware test procedures.
