import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DEFAULT_TOOL_SETTINGS,
  HIGHLIGHTER_SIZE_MAX,
  HIGHLIGHTER_SIZE_MIN,
  PEN_SIZE_MAX,
  PEN_SIZE_MIN,
  ToolSettings,
  ToolType,
} from '../types/tools';
import { CanvasEngine } from '../engine/CanvasEngine';
import { HistoryStateSnapshot } from '../engine/HistoryManager';
import { Toolbar } from './Toolbar';

interface OverlayAppProps {
  onClose?: () => void;
}

/**
 * Checks whether a keyboard event originated inside an editable webpage or shadow-DOM
 * element (`<input>`, `<textarea>`, `<select>`, or `contentEditable`) so PageInk
 * never hijacks `Space` or `Ctrl+Z` while the user is typing.
 */
export function isEditableEventTarget(e: KeyboardEvent): boolean {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    if (!(node instanceof HTMLElement)) continue;
    const tag = node.tagName;
    if (tag === 'INPUT') {
      // Allow range slider in our own toolbar to not block Space, but text inputs block Space
      const inputType = (node as HTMLInputElement).type?.toLowerCase();
      if (inputType !== 'range' && inputType !== 'button') {
        return true;
      }
    }
    if (tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable) {
      return true;
    }
    if (node.getAttribute?.('role') === 'textbox') {
      return true;
    }
  }
  return false;
}

/**
 * Branded PageInk SVG emblem used in the floating Resume button when Pause mode is active.
 * Matches the extension icon: white rounded page sheet with a folded corner and an
 * electric-blue (#2878FF) ink stroke and pen tip.
 */
const PageInkBadgeIcon: React.FC = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* White document page */}
    <path
      d="M7 6.5C7 5.11929 8.11929 4 9.5 4H18.5L24 9.5V25.5C24 26.8807 22.8807 28 21.5 28H9.5C8.11929 28 7 26.8807 7 25.5V6.5Z"
      fill="#F8FAFC"
    />
    {/* Folded corner */}
    <path
      d="M18.5 4L24 9.5H20C19.1716 9.5 18.5 8.82843 18.5 8V4Z"
      fill="#CBD5E1"
    />
    {/* Electric-blue flowing ink stroke */}
    <path
      d="M10.2 21.5C11.8 18.4 14.3 16.5 15.2 17.2C16.1 17.9 14.4 20.6 15.6 21C16.8 21.4 19.2 19.6 21.2 18.3"
      stroke="#2878FF"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Stylized angled pen */}
    <path
      d="M25.6 9.2C26.4 8.4 27.7 8.4 28.5 9.2C29.3 10 29.3 11.3 28.5 12.1L23.2 17.4L20.4 18.2L21.2 15.4L25.6 9.2Z"
      fill="#2878FF"
      stroke="#18181B"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

export const OverlayApp: React.FC<OverlayAppProps> = () => {
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryStateSnapshot>({
    canUndo: false,
    canRedo: false,
    hasStrokes: false,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  // Canvas is click-through whenever Pause mode is active OR Space is held
  const isCanvasPassthrough = isPaused || isSpaceHeld;

  const handleHistoryChange = useCallback((snapshot: HistoryStateSnapshot) => {
    setHistoryState((prev) => {
      if (
        prev.canUndo === snapshot.canUndo &&
        prev.canRedo === snapshot.canRedo &&
        prev.hasStrokes === snapshot.hasStrokes
      ) {
        return prev;
      }
      return snapshot;
    });
  }, []);

  // Initialize the imperative CanvasEngine once on mount and clean up on unmount
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const engine = new CanvasEngine(canvasEl, settings, handleHistoryChange);
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleHistoryChange]);

  // Push tool settings updates to the engine without recreating the canvas
  useEffect(() => {
    engineRef.current?.updateSettings(settings);
  }, [settings]);

  // Push passthrough updates (Paused or Hold-Space) to the engine without destroying strokes
  useEffect(() => {
    engineRef.current?.setPassthrough(isCanvasPassthrough);
  }, [isCanvasPassthrough]);

  const handleUndo = useCallback(() => {
    engineRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    engineRef.current?.redo();
  }, []);

  const handleClearAll = useCallback(() => {
    engineRef.current?.clearAll();
  }, []);

  const handlePause = useCallback(() => {
    setIsSpaceHeld(false);
    setIsPaused(true);
  }, []);

  const handleResume = useCallback(() => {
    setIsPaused(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // In active drawing mode, Escape pauses/minimizes the toolbar without destroying the session.
        // When already paused, Escape is ignored so webpage modals/dialogs work naturally and the paused session is never lost.
        if (!isPaused) {
          e.preventDefault();
          handlePause();
        }
        return;
      }

      // When paused, do not intercept Space or Undo/Redo shortcuts so normal webpage interaction is completely unhindered
      if (isPaused) {
        return;
      }

      // Do not hijack Space or Undo/Redo shortcuts when the user is typing in an input, textarea, or contenteditable
      if (isEditableEventTarget(e)) {
        return;
      }

      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Prevent Space from scrolling the page while held for temporary webpage interaction mode
        e.preventDefault();
        if (!e.repeat) {
          setIsSpaceHeld(true);
        }
        return;
      }

      // Support Ctrl+Z / Cmd+Z for Undo and Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z for Redo
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
      }
    };

    const handleWindowBlur = () => {
      setIsSpaceHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isPaused, handlePause, handleUndo, handleRedo]);

  const handleSelectTool = useCallback((activeTool: ToolType) => {
    setSettings((prev) => ({ ...prev, activeTool }));
  }, []);

  const handleSelectColor = useCallback((newColor: string) => {
    setSettings((prev) => {
      if (prev.activeTool === 'highlighter') {
        return { ...prev, highlighterColor: newColor };
      }
      return { ...prev, color: newColor };
    });
  }, []);

  const handleChangeSize = useCallback((newSize: number) => {
    setSettings((prev) => {
      if (prev.activeTool === 'highlighter') {
        const clamped = Math.max(
          HIGHLIGHTER_SIZE_MIN,
          Math.min(HIGHLIGHTER_SIZE_MAX, Math.round(newSize))
        );
        return { ...prev, highlighterSize: clamped };
      }
      const clamped = Math.max(
        PEN_SIZE_MIN,
        Math.min(PEN_SIZE_MAX, Math.round(newSize))
      );
      return { ...prev, penSize: clamped };
    });
  }, []);

  const canvasClasses = [
    'pi-canvas',
    isCanvasPassthrough
      ? 'pi-passthrough'
      : settings.activeTool === 'eraser'
        ? 'pi-eraser-cursor'
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pi-overlay-root">
      <canvas ref={canvasRef} className={canvasClasses} />
      {isPaused ? (
        <button
          type="button"
          className="pi-resume-fab"
          onClick={handleResume}
          onPointerDown={(e) => e.stopPropagation()}
          title="Resume PageInk drawing"
          aria-label="Resume PageInk drawing"
        >
          <PageInkBadgeIcon />
          <span
            className="pi-resume-fab-dot"
            style={{
              backgroundColor:
                settings.activeTool === 'highlighter'
                  ? settings.highlighterColor
                  : settings.color,
            }}
          />
        </button>
      ) : (
        <Toolbar
          settings={settings}
          historyState={historyState}
          isPassthrough={isSpaceHeld}
          onSelectTool={handleSelectTool}
          onSelectColor={handleSelectColor}
          onChangeSize={handleChangeSize}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearAll={handleClearAll}
          onPause={handlePause}
        />
      )}
    </div>
  );
};
