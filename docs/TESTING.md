# PageInk — Testing & Hardware Validation Guide

This document covers automated verification, manual browser integration testing, and the external drawing tablet (XP-Pen / Windows Ink) validation checklist for **PageInk**.

---

## 1. Automated Verification Summary

The following test suites were executed in Node (`node --experimental-strip-types`) against the drawing engine modules:

1. **Stroke & Spline Rendering (`StrokeRenderer.ts`)**:
   - Single-point tap circular dots (`arc` fallback).
   - 120-point continuous sine curves (`perfect-freehand` quadratic Bézier SVG spline generation).
   - Fast circular strokes (`0` `NaN` or jagged artifacts).
   - Diagonal bounding-box expansion and viewport visibility culling (`isBoundingBoxVisible`).
2. **Stylus Pressure & Highlighter (`PointerInputHandler.ts`, `StrokeRenderer.ts`)**:
   - Mouse fallback pressure (`0.5` with `thinning: 0.18`).
   - Hardware stylus detection (`pointerType: 'pen'` and mouse-emulated tablet drivers reporting `pointerType: 'mouse'` with variable `pressure !== 0.5`).
   - Zero-width stroke protection (`MIN_STYLUS_PRESSURE = 0.12` floor).
   - Exponential moving average (EMA) pressure smoothing (`alpha = 0.45`) and `0.8` gamma curve.
   - Uniform Highlighter thickness (`thinning: 0`) regardless of stylus pressure fluctuations.
3. **Whole-Stroke Eraser & Undo/Redo History (`EraserEngine.ts`, `HistoryManager.ts`)**:
   - Erasing the beginning, middle, or end of a Pen or Highlighter stroke removes that entire `Stroke` object.
   - Separate overlapping strokes remain untouched unless the eraser path directly intersects their geometry.
   - Structural-sharing Undo/Redo restores entire deleted strokes with their exact original object references and cached `Path2D` instances.
   - Continuous multi-step eraser drags are grouped into a single logical Undo entry on `pointerup`.
4. **Draw-Mode Wheel & Trackpad Scrolling (`WheelScrollHandler.ts`)**:
   - Underlying scroll container hit-testing (`document.elementFromPoint` with temporary `pointer-events: none` on the canvas) scrolls nested SPA containers (e.g., ChatGPT conversations) vertically and horizontally while in Draw mode.
   - Preserves `Ctrl + wheel` for native browser zoom and avoids double-scrolling when Hold-Space Browse Mode is active.
5. **Icon Assets & Manifest Verification (`public/icons/`, `wxt.config.ts`)**:
   - Verified `icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` exist in both `public/icons/` and `.output/chrome-mv3/icons/` and are referenced in `manifest.icons` and `manifest.action.default_icon`.
6. **Toolbar Colors & Independent Thickness (`tools.ts`)**:
   - All 8 Pen colors (Black, White, Red, Orange, Yellow, Green, Blue, Purple) and 4 Highlighter colors (Yellow, Green, Pink, Blue).
   - Independent Pen (`1–12px`) and Highlighter (`8–32px`) thickness bounds and existing stroke preservation.

---

## 2. Manual Browser Integration Test Checklist

### Setup
1. Build the production bundle:
   ```bash
   npm.cmd run build
   ```
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.

### A. Webpage Interaction & Hold-Space Browse Mode
- [ ] **Toggle Overlay**: Click the PageInk extension icon on any `https://` page -> toolbar and transparent canvas appear immediately.
- [ ] **Hold Space (Passthrough / Browse Mode)**:
  - Hold `Space` -> toolbar border subtly highlights blue, cursor reverts to normal webpage cursor, and you can click links, select text, click buttons (e.g., "Copy code" on ChatGPT), or scroll the page.
  - Release `Space` -> drawing mode resumes immediately with the active tool (`Pen`, `Highlighter`, or `Eraser`).
- [ ] **Typing Safety**: While holding `Space` or pressing `Space` inside a focused `<input>`, `<textarea>`, or `contenteditable` prompt box (e.g., ChatGPT prompt input or YouTube search bar), verify PageInk does **not** block typing spaces.
- [ ] **Toolbar Interactivity**: Verify the toolbar remains draggable and clickable at all times, and dragging the toolbar never creates a stray stroke on the canvas.
- [ ] **Escape Dismissal**: Press `Escape` (or click `X`) -> overlay closes and completely discards all session annotations from memory. Reopen via the extension icon -> starts a fresh, empty session.

### B. Coordinate, Scroll & Zoom Reliability
- [ ] **Normal Document Scrolling**: Draw annotations over paragraphs on MDN or Wikipedia, scroll down and back up -> annotations remain locked to their document coordinates (`scrollX`, `scrollY`).
- [ ] **SPA Container Scrolling (ChatGPT)**: Open a long ChatGPT conversation, draw over a code block or paragraph, and scroll the conversation container -> capture-phase scroll tracking keeps annotations aligned with the conversation scroll offset.
- [ ] **Window Resize & Browser Zoom**: Draw several strokes, resize the browser window or zoom in/out (`Ctrl +` / `Ctrl -`) -> `updateCanvasDimensions()` and the `matchMedia` DPR observer resize the backing store and synchronously redraw strokes without losing ink or blurring.

### C. Cross-Site Compatibility
- [ ] **ChatGPT (`chatgpt.com`)**: Draw over responses and code blocks; hold `Space` to click "Copy code" or type a follow-up prompt.
- [ ] **YouTube (`youtube.com`)**: Draw over video player or page notes; hold `Space` to pause/play or scrub the timeline.
- [ ] **Technical Documentation (MDN / React Docs / GitHub)**: Verify zero CSS leakage into or out of the host webpage thanks to Shadow DOM isolation (`<pageink-overlay>`).
- [ ] **Restricted Pages (`chrome://extensions`, Chrome Web Store)**: Click the extension icon -> gracefully no-ops without throwing unhandled runtime errors.

---

## 3. External Drawing Tablet (XP-Pen) Hardware Validation Checklist

> **Important Hardware Status Note**: Pressure normalization, `getCoalescedEvents()` extraction, multi-touch rejection, and mouse-emulated tablet fallbacks have been verified via **simulated PointerEvent tests**. Physical hardware verification on XP-Pen tablets must be executed by the owner using the checklist below before claiming physical hardware certification.

### Devices to Validate
- **XP-Pen Artist Series** (Display Tablet)
- **XP-Pen Deco Series** (Graphics Tablet)
- **Standard Mouse & Laptop Touchpad** (Fallback baseline)

### Hardware Test Steps
1. **Windows Ink Enabled (`pointerType === "pen"`)**:
   - [ ] Enable **Windows Ink** in the XP-Pen Pentablet driver settings.
   - [ ] Draw light feather strokes -> verify thin, continuous lines (no dropouts or zero-width gaps).
   - [ ] Gradually increase stylus pressure -> verify smooth width transition up to full stroke thickness.
   - [ ] Write fast cursive / mathematical notation -> verify `getCoalescedEvents()` produces smooth curves without polygonal corners.
2. **Windows Ink Disabled / Mouse Emulation Mode (`pointerType === "mouse"`)**:
   - [ ] Disable Windows Ink in the XP-Pen driver so the tablet acts as a mouse pointer.
   - [ ] Draw across the canvas -> verify PageInk falls back cleanly to consistent stroke thickness without rejecting events or crashing.
3. **Highlighter with Stylus**:
   - [ ] Select **Highlighter** and draw with varying stylus pressure -> verify stroke width remains uniform (`thinning: 0`) and overlapping strokes of the same color do not darken excessively.
4. **Eraser with Stylus / Mouse**:
   - [ ] Select **Eraser** and touch the beginning, middle, or end of a drawn stroke -> verify the entire stroke is removed while separate overlapping strokes remain untouched, and `Undo` (`Ctrl+Z`) restores the complete stroke in one step.

---

## 4. Known Design Boundaries & Limitations

- **Document-Coordinate Anchoring (Not DOM-Element Anchoring)**: Annotations are anchored to document/scroll coordinates (`scrollX`, `scrollY`), not bound to individual DOM nodes. If a webpage dynamically expands or collapses an accordion above an annotation (causing a layout shift), the annotation remains at its document coordinate rather than reflowing with the shifted DOM element.
- **Ephemeral By Design**: Annotations exist strictly in memory for the active overlay session. Closing the overlay (`Escape` or `X`) or reloading the tab permanently discards the session.
- **Browser-Restricted Pages**: Chromium security policies prohibit extensions from injecting scripts into `chrome://`, `edge://`, `about:`, and the Chrome Web Store.

