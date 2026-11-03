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
  onClose: () => void;
}

export const OverlayApp: React.FC<OverlayAppProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [historyState, setHistoryState] = useState<HistoryStateSnapshot>({
    canUndo: false,
    canRedo: false,
    hasStrokes: false,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

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

  const handleUndo = useCallback(() => {
    engineRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    engineRef.current?.redo();
  }, []);

  const handleClearAll = useCallback(() => {
    engineRef.current?.clearAll();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [onClose, handleUndo, handleRedo]);

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

  return (
    <div className="pi-overlay-root">
      <canvas
        ref={canvasRef}
        className={`pi-canvas ${
          settings.activeTool === 'eraser' ? 'pi-eraser-cursor' : ''
        }`}
      />
      <Toolbar
        settings={settings}
        historyState={historyState}
        onSelectTool={handleSelectTool}
        onSelectColor={handleSelectColor}
        onChangeSize={handleChangeSize}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearAll={handleClearAll}
        onClose={onClose}
      />
    </div>
  );
};
