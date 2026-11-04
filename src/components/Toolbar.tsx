import React, { useState, useRef } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Minus,
  GripVertical,
} from 'lucide-react';
import { HistoryStateSnapshot } from '../engine/HistoryManager';
import {
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_SIZE_MAX,
  HIGHLIGHTER_SIZE_MIN,
  PEN_COLORS,
  PEN_SIZE_MAX,
  PEN_SIZE_MIN,
  ToolSettings,
  ToolType,
} from '../types/tools';

interface ToolbarProps {
  settings: ToolSettings;
  historyState: HistoryStateSnapshot;
  isPassthrough?: boolean;
  onSelectTool: (tool: ToolType) => void;
  onSelectColor: (color: string) => void;
  onChangeSize: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
  onPause: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  settings,
  historyState,
  isPassthrough = false,
  onSelectTool,
  onSelectColor,
  onChangeSize,
  onUndo,
  onRedo,
  onClearAll,
  onPause,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Keep dragged toolbar within viewport bounds when browser window resizes
  React.useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev || !toolbarRef.current) return prev;
        const rect = toolbarRef.current.getBoundingClientRect();
        const clampedX = Math.max(
          8,
          Math.min(window.innerWidth - rect.width - 8, prev.x)
        );
        const clampedY = Math.max(
          8,
          Math.min(window.innerHeight - rect.height - 8, prev.y)
        );
        if (clampedX === prev.x && clampedY === prev.y) return prev;
        return { x: clampedX, y: clampedY };
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      const currentRect = toolbarRef.current?.getBoundingClientRect() ?? rect;
      const nextX = Math.max(
        8,
        Math.min(
          window.innerWidth - currentRect.width - 8,
          moveEvent.clientX - dragOffset.current.x
        )
      );
      const nextY = Math.max(
        8,
        Math.min(
          window.innerHeight - currentRect.height - 8,
          moveEvent.clientY - dragOffset.current.y
        )
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

  const isPen = settings.activeTool === 'pen';
  const isHighlighter = settings.activeTool === 'highlighter';
  const showCustomizationRow = isPen || isHighlighter;

  const activeColors = isPen ? PEN_COLORS : HIGHLIGHTER_COLORS;
  const activeColorValue = isPen ? settings.color : settings.highlighterColor;
  const activeSize = isPen ? settings.penSize : settings.highlighterSize;
  const minSize = isPen ? PEN_SIZE_MIN : HIGHLIGHTER_SIZE_MIN;
  const maxSize = isPen ? PEN_SIZE_MAX : HIGHLIGHTER_SIZE_MAX;

  // Visual preview dot diameter scaled to fit cleanly inside the 20x20 preview box
  const previewDiameter = isPen
    ? Math.max(3, Math.min(14, activeSize))
    : Math.max(6, Math.min(18, Math.round(activeSize * 0.55)));

  return (
    <div
      ref={toolbarRef}
      className={`pi-toolbar ${isPassthrough ? 'pi-toolbar-passthrough' : ''}`}
      style={style}
      aria-label="PageInk Toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pi-toolbar-row">
        <div
          className="pi-drag-handle"
          title="Drag PageInk toolbar (Hold Space to interact with webpage)"
          onPointerDown={handlePointerDownDrag}
        >
          <GripVertical size={15} />
        </div>

        <div className="pi-tool-group">
          <button
            type="button"
            className={`pi-btn ${isPen ? 'pi-active' : ''}`}
            onClick={() => onSelectTool('pen')}
            title="Pen"
            aria-label="Pen"
          >
            <Pen size={16} />
          </button>
          <button
            type="button"
            className={`pi-btn ${isHighlighter ? 'pi-active' : ''}`}
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
            disabled={!historyState.canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="pi-btn"
            disabled={!historyState.canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="pi-btn pi-danger"
            disabled={!historyState.hasStrokes}
            onClick={onClearAll}
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
          onClick={onPause}
          title="Pause drawing & minimize toolbar (Esc)"
          aria-label="Pause PageInk"
        >
          <Minus size={16} />
        </button>
      </div>

      {showCustomizationRow && (
        <div className="pi-toolbar-subrow">
          <div
            className="pi-swatches"
            role="radiogroup"
            aria-label={isPen ? 'Pen color' : 'Highlighter color'}
          >
            {activeColors.map((swatch) => {
              const isSelected = activeColorValue === swatch.value;
              return (
                <button
                  key={swatch.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${swatch.label} ${isPen ? 'pen' : 'highlighter'}`}
                  title={swatch.label}
                  className={`pi-swatch ${isSelected ? 'pi-swatch-active' : ''}`}
                  style={{
                    backgroundColor: swatch.value,
                    opacity: isHighlighter ? 0.85 : 1,
                  }}
                  onClick={() => onSelectColor(swatch.value)}
                />
              );
            })}
          </div>

          <div
            className="pi-thickness-control"
            title={`${isPen ? 'Pen' : 'Highlighter'} thickness: ${activeSize}px`}
          >
            <div className="pi-thickness-preview-box" aria-hidden="true">
              <span
                className="pi-thickness-dot"
                style={{
                  width: `${previewDiameter}px`,
                  height: `${previewDiameter}px`,
                  backgroundColor: activeColorValue,
                  opacity: isHighlighter ? HIGHLIGHTER_OPACITY + 0.35 : 1,
                }}
              />
            </div>
            <input
              type="range"
              className="pi-thickness-slider"
              min={minSize}
              max={maxSize}
              step={1}
              value={activeSize}
              aria-label={`${isPen ? 'Pen' : 'Highlighter'} thickness`}
              onChange={(e) => onChangeSize(Number(e.target.value))}
            />
            <span className="pi-thickness-value">{activeSize}px</span>
          </div>
        </div>
      )}
    </div>
  );
};
