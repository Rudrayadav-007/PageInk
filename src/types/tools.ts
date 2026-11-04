export type ToolType = 'pen' | 'highlighter' | 'eraser';

export interface ColorOption {
  label: string;
  value: string;
}

export interface ToolSettings {
  activeTool: ToolType;
  color: string;
  highlighterColor: string;
  penSize: number;
  highlighterSize: number;
  eraserSize: number;
}

export const PEN_COLORS: readonly ColorOption[] = [
  { label: 'Black', value: '#18181b' },
  { label: 'White', value: '#ffffff' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#a855f7' },
] as const;

export const HIGHLIGHTER_COLORS: readonly ColorOption[] = [
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green', value: '#4ade80' },
  { label: 'Pink', value: '#f472b6' },
  { label: 'Blue', value: '#38bdf8' },
] as const;

export const PEN_SIZE_MIN = 1;
export const PEN_SIZE_MAX = 12;

export const HIGHLIGHTER_SIZE_MIN = 8;
export const HIGHLIGHTER_SIZE_MAX = 32;

export const HIGHLIGHTER_OPACITY = 0.36;

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  activeTool: 'pen',
  color: '#ef4444',
  highlighterColor: '#facc15',
  penSize: 2,
  highlighterSize: 22,
  eraserSize: 18,
};
