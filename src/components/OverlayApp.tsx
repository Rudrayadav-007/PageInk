import React, { useState, useEffect, useRef } from 'react';
import { DEFAULT_TOOL_SETTINGS, ToolSettings, ToolType } from '../types/tools';
import { CanvasEngine } from '../engine/CanvasEngine';
import { Toolbar } from './Toolbar';

interface OverlayAppProps {
  onClose: () => void;
}

export const OverlayApp: React.FC<OverlayAppProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  // Initialize the imperative CanvasEngine once on mount and clean up on unmount
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const engine = new CanvasEngine(canvasEl, settings);
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Push tool settings updates to the engine without recreating the canvas
  useEffect(() => {
    engineRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [onClose]);

  const handleSelectTool = (activeTool: ToolType) => {
    setSettings((prev) => ({ ...prev, activeTool }));
  };

  return (
    <div className="pi-overlay-root">
      <canvas ref={canvasRef} className="pi-canvas" />
      <Toolbar
        settings={settings}
        onSelectTool={handleSelectTool}
        onClose={onClose}
      />
    </div>
  );
};
