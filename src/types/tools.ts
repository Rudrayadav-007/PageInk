export type ToolType = 'pen' | 'highlighter' | 'eraser';

export interface ToolSettings {
  activeTool: ToolType;
  color: string;
  penSize: number;
  highlighterSize: number;
  eraserSize: number;
}

export const DEFAULT_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#facc15', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
  '#ffffff', // White
  '#1e1e1e', // Dark
] as const;

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  activeTool: 'pen',
  color: '#ef4444',
  penSize: 4,
  highlighterSize: 20,
  eraserSize: 18,
};

