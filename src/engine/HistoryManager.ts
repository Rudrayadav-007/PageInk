import type { Stroke } from '../types/stroke';

export interface HistoryStateSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  hasStrokes: boolean;
}

/**
 * Manages immutable stroke-list snapshots for Undo, Redo, and Clear All.
 *
 * Architecture:
 * - Because individual `Stroke` objects (and their cached `Path2D` and `points` arrays)
 *   are treated as immutable once committed, a snapshot is simply a shallow `readonly Stroke[]`
 *   array reference.
 * - Unchanged strokes share the exact same object references across history entries,
 *   avoiding deep-cloning overhead or memory duplication while guaranteeing 100%
 *   exact restoration of stroke order, split fragments, and clear-all operations.
 */
export class HistoryManager {
  private undoStack: Array<readonly Stroke[]> = [];
  private redoStack: Array<readonly Stroke[]> = [];
  private maxHistoryDepth: number;

  constructor(maxHistoryDepth = 100) {
    this.maxHistoryDepth = maxHistoryDepth;
  }

  /**
   * Records the state `beforeStrokes` prior to a committed mutation (draw stroke,
   * completed continuous erase gesture, or clear-all) and clears the redo stack.
   */
  public recordBeforeMutation(beforeStrokes: readonly Stroke[]): void {
    this.undoStack.push([...beforeStrokes]);
    if (this.undoStack.length > this.maxHistoryDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Restores and returns the previous stroke array if available, pushing
   * `currentStrokes` onto the redo stack.
   */
  public undo(currentStrokes: readonly Stroke[]): Stroke[] | null {
    if (this.undoStack.length === 0) {
      return null;
    }
    const previous = this.undoStack.pop()!;
    this.redoStack.push([...currentStrokes]);
    return [...previous];
  }

  /**
   * Re-applies and returns the next undone stroke array if available, pushing
   * `currentStrokes` back onto the undo stack.
   */
  public redo(currentStrokes: readonly Stroke[]): Stroke[] | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    const next = this.redoStack.pop()!;
    this.undoStack.push([...currentStrokes]);
    return [...next];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getSnapshot(currentStrokes: readonly Stroke[]): HistoryStateSnapshot {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      hasStrokes: currentStrokes.length > 0,
    };
  }
}
