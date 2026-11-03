import React, { useState, useRef } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  X,
  GripVertical,
} from 'lucide-react';
import { ToolSettings, ToolType } from '../types/tools';

interface ToolbarProps {
  settings: ToolSettings;
  onSelectTool: (tool: ToolType) => void;
  onClose: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  settings,
  onSelectTool,
  onClose,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handlePointerDownDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!toolbarRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = toolbarRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextX = Math.max(
        8,
        Math.min(window.innerWidth - rect.width - 8, moveEvent.clientX - dragOffset.current.x)
      );
      const nextY = Math.max(
        8,
        Math.min(window.innerHeight - rect.height - 8, moveEvent.clientY - dragOffset.current.y)
      );
      setPosition({ x: nextX, y: nextY });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (target.hasPointerCapture(upEvent.pointerId)) {
        target.releasePointerCapture(upEvent.pointerId);
      }
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
  };

  const style: React.CSSProperties | undefined = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'none',
      }
    : undefined;

  return (
    <div
      ref={toolbarRef}
      className="pi-toolbar"
      style={style}
      aria-label="PageInk Toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pi-toolbar-row">
        <div
          className="pi-drag-handle"
          title="Drag PageInk toolbar"
          onPointerDown={handlePointerDownDrag}
        >
          <GripVertical size={15} />
        </div>

        <div className="pi-tool-group">
          <button
            type="button"
            className={`pi-btn ${settings.activeTool === 'pen' ? 'pi-active' : ''}`}
            onClick={() => onSelectTool('pen')}
            title="Pen"
            aria-label="Pen"
          >
            <Pen size={16} />
          </button>
          <button
            type="button"
            className={`pi-btn ${settings.activeTool === 'highlighter' ? 'pi-active' : ''}`}
            onClick={() => onSelectTool('highlighter')}
            title="Highlighter"
            aria-label="Highlighter"
          >
            <Highlighter size={16} />
          </button>
          <button
            type="button"
            className={`pi-btn ${settings.activeTool === 'eraser' ? 'pi-active' : ''}`}
            onClick={() => onSelectTool('eraser')}
            title="Eraser"
            aria-label="Eraser"
          >
            <Eraser size={16} />
          </button>
        </div>

        <div className="pi-divider" />

        <div className="pi-tool-group">
          <button
            type="button"
            className="pi-btn"
            disabled
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="pi-btn"
            disabled
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="pi-btn pi-danger"
            disabled
            title="Clear All"
            aria-label="Clear All"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="pi-divider" />

        <button
          type="button"
          className="pi-btn"
          onClick={onClose}
          title="Close PageInk (Esc)"
          aria-label="Close PageInk"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
