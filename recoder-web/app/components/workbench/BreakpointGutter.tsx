/**
 * BreakpointGutter - CodeMirror gutter extension for breakpoint markers
 * Provides click to toggle breakpoint, right-click for conditional breakpoint dialog
 * Displays red dots for regular breakpoints, yellow dots for conditional breakpoints
 */

import { memo, useCallback, useEffect, useMemo, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorView,
  GutterMarker,
  gutter,
  type Panel,
  showPanel,
  ViewPlugin,
  type ViewUpdate,
  Decoration,
  type DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { StateField, StateEffect, type Extension, RangeSetBuilder, RangeSet } from '@codemirror/state';
import { debugStore, type Breakpoint, type BreakpointType } from '~/lib/stores/debug';

// ============================================
// Types
// ============================================

export interface BreakpointGutterOptions {
  filePath: string;
  onToggleBreakpoint?: (line: number) => void;
  onEditBreakpoint?: (line: number, condition?: string, hitCount?: string, logMessage?: string) => void;
  onBreakpointRightClick?: (line: number, event: MouseEvent) => void;
}

interface BreakpointMarkerInfo {
  line: number;
  type: BreakpointType;
  enabled: boolean;
  verified: boolean;
  condition?: string;
  hitCountCondition?: string;
  logMessage?: string;
}

// ============================================
// State Effects for Breakpoints
// ============================================

const setBreakpointsEffect = StateEffect.define<BreakpointMarkerInfo[]>();
const toggleBreakpointEffect = StateEffect.define<number>();
const setCurrentLineEffect = StateEffect.define<number | null>();

// ============================================
// Breakpoints State Field
// ============================================

const breakpointsField = StateField.define<Map<number, BreakpointMarkerInfo>>({
  create() {
    return new Map();
  },
  update(breakpoints, tr) {
    let newBreakpoints = breakpoints;

    for (const effect of tr.effects) {
      if (effect.is(setBreakpointsEffect)) {
        newBreakpoints = new Map();
        for (const bp of effect.value) {
          newBreakpoints.set(bp.line, bp);
        }
      }
    }

    return newBreakpoints;
  },
});

// ============================================
// Current Execution Line State Field
// ============================================

const currentLineField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(currentLine, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCurrentLineEffect)) {
        return effect.value;
      }
    }
    return currentLine;
  },
});

// ============================================
// Breakpoint Gutter Marker
// ============================================

class BreakpointMarker extends GutterMarker {
  constructor(
    readonly info: BreakpointMarkerInfo | null,
    readonly isCurrentLine: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-breakpoint-marker';
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      position: relative;
    `;

    // Current execution line indicator (yellow arrow)
    if (this.isCurrentLine) {
      const arrow = document.createElement('span');
      arrow.className = 'cm-current-line-arrow';
      arrow.style.cssText = `
        position: absolute;
        left: 2px;
        color: #fbbf24;
        font-size: 10px;
        z-index: 2;
      `;
      arrow.innerHTML = '&#9654;'; // Right-pointing triangle
      wrapper.appendChild(arrow);
    }

    // Breakpoint dot
    if (this.info) {
      const dot = document.createElement('span');
      dot.className = 'cm-breakpoint-dot';

      let bgColor = '#ef4444'; // Red for regular breakpoints
      let opacity = this.info.enabled ? '1' : '0.4';

      if (!this.info.verified) {
        // Hollow circle for unverified breakpoints
        dot.style.cssText = `
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid ${bgColor};
          background: transparent;
          opacity: ${opacity};
        `;
      } else if (this.info.type === 'logpoint') {
        // Diamond shape for logpoints
        bgColor = '#3b82f6'; // Blue
        dot.style.cssText = `
          width: 8px;
          height: 8px;
          transform: rotate(45deg);
          background: ${bgColor};
          opacity: ${opacity};
        `;
      } else if (this.info.type === 'conditional') {
        // Yellow/orange for conditional breakpoints
        bgColor = '#f59e0b';
        dot.style.cssText = `
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${bgColor};
          opacity: ${opacity};
        `;
      } else {
        // Regular red breakpoint
        dot.style.cssText = `
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${bgColor};
          opacity: ${opacity};
        `;
      }

      wrapper.appendChild(dot);
    }

    return wrapper;
  }

  eq(other: BreakpointMarker): boolean {
    if (!(other instanceof BreakpointMarker)) return false;
    if (this.isCurrentLine !== other.isCurrentLine) return false;
    if (!this.info && !other.info) return true;
    if (!this.info || !other.info) return false;
    return (
      this.info.line === other.info.line &&
      this.info.type === other.info.type &&
      this.info.enabled === other.info.enabled &&
      this.info.verified === other.info.verified
    );
  }
}

// Empty marker for hover state
class EmptyBreakpointMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-breakpoint-empty';
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    `;

    // Faded red dot on hover
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ef4444;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;
    dot.className = 'cm-breakpoint-hover-dot';
    wrapper.appendChild(dot);

    return wrapper;
  }
}

const emptyMarker = new EmptyBreakpointMarker();

// ============================================
// Breakpoint Gutter Extension
// ============================================

function createBreakpointGutter(options: BreakpointGutterOptions): Extension {
  const { filePath, onToggleBreakpoint, onBreakpointRightClick } = options;

  return [
    breakpointsField,
    currentLineField,
    gutter({
      class: 'cm-breakpoint-gutter',
      markers: (view) => {
        const breakpoints = view.state.field(breakpointsField);
        const currentLine = view.state.field(currentLineField);
        const builder = new RangeSetBuilder<GutterMarker>();

        // Add markers for each line (must be added in order by position)
        for (let i = 1; i <= view.state.doc.lines; i++) {
          const lineStart = view.state.doc.line(i).from;
          const bp = breakpoints.get(i);
          const isCurrentLine = currentLine === i;

          if (bp || isCurrentLine) {
            builder.add(lineStart, lineStart, new BreakpointMarker(bp || null, isCurrentLine));
          } else {
            builder.add(lineStart, lineStart, emptyMarker);
          }
        }

        return builder.finish();
      },
      initialSpacer: () => emptyMarker,
      domEventHandlers: {
        click(view, line, event) {
          const lineNumber = view.state.doc.lineAt(line.from).number;
          onToggleBreakpoint?.(lineNumber);
          return true;
        },
        contextmenu(view, line, event) {
          event.preventDefault();
          const lineNumber = view.state.doc.lineAt(line.from).number;
          onBreakpointRightClick?.(lineNumber, event as MouseEvent);
          return true;
        },
        mouseenter(view, line, event) {
          const target = event.target as HTMLElement;
          const hoverDot = target.querySelector('.cm-breakpoint-hover-dot') as HTMLElement;
          if (hoverDot) {
            hoverDot.style.opacity = '0.4';
          }
          return false;
        },
        mouseleave(view, line, event) {
          const target = event.target as HTMLElement;
          const hoverDot = target.querySelector('.cm-breakpoint-hover-dot') as HTMLElement;
          if (hoverDot) {
            hoverDot.style.opacity = '0';
          }
          return false;
        },
      },
    }),
    EditorView.baseTheme({
      '.cm-breakpoint-gutter': {
        width: '20px',
        backgroundColor: 'var(--bolt-elements-background-depth-2)',
        borderRight: '1px solid var(--bolt-elements-borderColor)',
      },
      '.cm-breakpoint-gutter .cm-gutterElement': {
        padding: '0',
        cursor: 'pointer',
      },
    }),
  ];
}

// ============================================
// Current Line Highlight Extension
// ============================================

class CurrentLineWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    return span;
  }
}

function createCurrentLineHighlight(): Extension {
  return [
    currentLineField,
    EditorView.decorations.compute([currentLineField], (state) => {
      const currentLine = state.field(currentLineField);
      if (currentLine === null) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();

      try {
        const line = state.doc.line(currentLine);
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: 'cm-current-execution-line',
          })
        );
      } catch {
        // Line doesn't exist
      }

      return builder.finish();
    }),
    EditorView.baseTheme({
      '.cm-current-execution-line': {
        backgroundColor: 'rgba(251, 191, 36, 0.15)',
        borderLeft: '2px solid #fbbf24',
      },
    }),
  ];
}

// ============================================
// Sync Plugin - Syncs breakpoints from store to editor
// ============================================

function createBreakpointSyncPlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private unsubscribe: (() => void) | null = null;

      constructor(view: EditorView) {
        this.syncBreakpoints(view);

        // Subscribe to breakpoint changes
        this.unsubscribe = debugStore.breakpoints.subscribe((breakpoints) => {
          this.syncBreakpoints(view, breakpoints);
        });
      }

      update(update: ViewUpdate) {
        // Resync on document changes
        if (update.docChanged) {
          this.syncBreakpoints(update.view);
        }
      }

      destroy() {
        if (this.unsubscribe) {
          this.unsubscribe();
        }
      }

      private syncBreakpoints(view: EditorView, breakpoints?: Map<string, Breakpoint[]>) {
        const bps = breakpoints || debugStore.breakpoints.get();
        const fileBreakpoints = bps.get(filePath) || [];

        const markerInfos: BreakpointMarkerInfo[] = fileBreakpoints.map((bp) => ({
          line: bp.line,
          type: bp.type,
          enabled: bp.enabled,
          verified: bp.verified,
          condition: bp.condition,
          hitCountCondition: bp.hitCountCondition,
          logMessage: bp.logMessage,
        }));

        view.dispatch({
          effects: setBreakpointsEffect.of(markerInfos),
        });
      }
    }
  );
}

// ============================================
// Current Line Sync Plugin - Syncs current execution line from debug session
// ============================================

function createCurrentLineSyncPlugin(filePath: string): Extension {
  return ViewPlugin.fromClass(
    class {
      private unsubscribe: (() => void) | null = null;

      constructor(view: EditorView) {
        this.syncCurrentLine(view);

        // Subscribe to call stack changes
        this.unsubscribe = debugStore.callStack.subscribe((callStack) => {
          this.syncCurrentLine(view, callStack as typeof debugStore.callStack extends { get: () => infer T } ? T : never);
        });
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.syncCurrentLine(update.view);
        }
      }

      destroy() {
        if (this.unsubscribe) {
          this.unsubscribe();
        }
      }

      private syncCurrentLine(view: EditorView, callStack?: typeof debugStore.callStack extends { get: () => infer T } ? T : never) {
        const stack = callStack || debugStore.callStack.get();
        const selectedIndex = debugStore.selectedFrameIndex.get();
        const currentFrame = stack[selectedIndex];

        let currentLine: number | null = null;

        if (currentFrame && currentFrame.filePath === filePath) {
          currentLine = currentFrame.line;
        } else if (currentFrame) {
          // Check if any frame matches this file
          const matchingFrame = stack.find(f => f.filePath === filePath);
          if (matchingFrame) {
            currentLine = matchingFrame.line;
          }
        }

        view.dispatch({
          effects: setCurrentLineEffect.of(currentLine),
        });
      }
    }
  );
}

// ============================================
// Combined Extension Factory
// ============================================

export function breakpointGutterExtension(options: BreakpointGutterOptions): Extension {
  return [
    createBreakpointGutter(options),
    createCurrentLineHighlight(),
    createBreakpointSyncPlugin(options.filePath),
    createCurrentLineSyncPlugin(options.filePath),
  ];
}

// ============================================
// Conditional Breakpoint Dialog Component
// ============================================

interface ConditionalBreakpointDialogProps {
  line: number;
  filePath: string;
  position: { x: number; y: number };
  existingBreakpoint?: Breakpoint;
  onClose: () => void;
  onSave: (condition?: string, hitCount?: string, logMessage?: string) => void;
}

export const ConditionalBreakpointDialog = memo(({
  line,
  filePath,
  position,
  existingBreakpoint,
  onClose,
  onSave,
}: ConditionalBreakpointDialogProps) => {
  const [activeTab, setActiveTab] = useState<'condition' | 'hitCount' | 'logMessage'>('condition');
  const [condition, setCondition] = useState(existingBreakpoint?.condition || '');
  const [hitCount, setHitCount] = useState(existingBreakpoint?.hitCountCondition || '');
  const [logMessage, setLogMessage] = useState(existingBreakpoint?.logMessage || '');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleSave = useCallback(() => {
    onSave(
      condition.trim() || undefined,
      hitCount.trim() || undefined,
      logMessage.trim() || undefined
    );
    onClose();
  }, [condition, hitCount, logMessage, onSave, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  // Calculate position to keep dialog in viewport
  const dialogStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 320),
    top: Math.min(position.y, window.innerHeight - 250),
    zIndex: 9999,
  };

  return createPortal(
    <div
      ref={dialogRef}
      style={dialogStyle}
      className="w-80 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor">
        <div className="text-xs text-bolt-elements-textSecondary">
          {existingBreakpoint ? 'Edit' : 'Add'} breakpoint at line {line}
        </div>
        <button
          onClick={onClose}
          className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
        >
          <span className="i-ph:x text-sm" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-bolt-elements-borderColor">
        <button
          onClick={() => setActiveTab('condition')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'condition'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
          }`}
        >
          Expression
        </button>
        <button
          onClick={() => setActiveTab('hitCount')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'hitCount'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
          }`}
        >
          Hit Count
        </button>
        <button
          onClick={() => setActiveTab('logMessage')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'logMessage'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
          }`}
        >
          Log Message
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {activeTab === 'condition' && (
          <div>
            <label className="block text-xs text-bolt-elements-textSecondary mb-1">
              Break when expression is truthy
            </label>
            <input
              type="text"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., x > 10 && y !== undefined"
              autoFocus
              className="w-full px-2 py-1.5 text-xs font-mono bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {activeTab === 'hitCount' && (
          <div>
            <label className="block text-xs text-bolt-elements-textSecondary mb-1">
              Break when hit count condition is met
            </label>
            <input
              type="text"
              value={hitCount}
              onChange={(e) => setHitCount(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., >= 5, == 10, % 3"
              autoFocus
              className="w-full px-2 py-1.5 text-xs font-mono bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-bolt-elements-textTertiary mt-1">
              Operators: {'>'}, {'<'}, {'>='}. {'<='}, ==, !=, %
            </p>
          </div>
        )}

        {activeTab === 'logMessage' && (
          <div>
            <label className="block text-xs text-bolt-elements-textSecondary mb-1">
              Log message (does not break)
            </label>
            <input
              type="text"
              value={logMessage}
              onChange={(e) => setLogMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Value: {x}, Status: {status}"
              autoFocus
              className="w-full px-2 py-1.5 text-xs font-mono bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-bolt-elements-textTertiary mt-1">
              Use {'{expression}'} to evaluate and log values
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-3 py-2 border-t border-bolt-elements-borderColor">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          {existingBreakpoint ? 'Save' : 'Add Breakpoint'}
        </button>
      </div>
    </div>,
    document.body
  );
});

ConditionalBreakpointDialog.displayName = 'ConditionalBreakpointDialog';

// ============================================
// React Hook for Breakpoint Gutter
// ============================================

export interface UseBreakpointGutterOptions {
  filePath: string;
}

export interface UseBreakpointGutterReturn {
  extension: Extension;
  dialogProps: {
    isOpen: boolean;
    line: number;
    position: { x: number; y: number };
    existingBreakpoint?: Breakpoint;
    onClose: () => void;
    onSave: (condition?: string, hitCount?: string, logMessage?: string) => void;
  } | null;
}

export function useBreakpointGutter(options: UseBreakpointGutterOptions): UseBreakpointGutterReturn {
  const { filePath } = options;
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    line: number;
    position: { x: number; y: number };
    existingBreakpoint?: Breakpoint;
  } | null>(null);

  const handleToggleBreakpoint = useCallback((line: number) => {
    debugStore.toggleBreakpoint(filePath, line);
  }, [filePath]);

  const handleBreakpointRightClick = useCallback((line: number, event: MouseEvent) => {
    const breakpoints = debugStore.breakpoints.get();
    const fileBreakpoints = breakpoints.get(filePath) || [];
    const existingBreakpoint = fileBreakpoints.find(bp => bp.line === line);

    setDialogState({
      isOpen: true,
      line,
      position: { x: event.clientX, y: event.clientY },
      existingBreakpoint,
    });
  }, [filePath]);

  const handleDialogClose = useCallback(() => {
    setDialogState(null);
  }, []);

  const handleDialogSave = useCallback((condition?: string, hitCount?: string, logMessage?: string) => {
    if (!dialogState) return;

    const breakpoints = debugStore.breakpoints.get();
    const fileBreakpoints = breakpoints.get(filePath) || [];
    const existingBreakpoint = fileBreakpoints.find(bp => bp.line === dialogState.line);

    if (existingBreakpoint) {
      // Update existing breakpoint
      debugStore.updateBreakpointCondition(filePath, dialogState.line, condition, hitCount, logMessage);
    } else {
      // Add new conditional breakpoint
      debugStore.addBreakpoint(filePath, dialogState.line, {
        condition,
        hitCountCondition: hitCount,
        logMessage,
      });
    }

    setDialogState(null);
  }, [filePath, dialogState]);

  const extension = useMemo(() => {
    return breakpointGutterExtension({
      filePath,
      onToggleBreakpoint: handleToggleBreakpoint,
      onBreakpointRightClick: handleBreakpointRightClick,
    });
  }, [filePath, handleToggleBreakpoint, handleBreakpointRightClick]);

  const dialogProps = dialogState
    ? {
        isOpen: dialogState.isOpen,
        line: dialogState.line,
        position: dialogState.position,
        existingBreakpoint: dialogState.existingBreakpoint,
        onClose: handleDialogClose,
        onSave: handleDialogSave,
      }
    : null;

  return {
    extension,
    dialogProps,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Update breakpoints in the editor from external source
 */
export function updateEditorBreakpoints(view: EditorView, breakpoints: BreakpointMarkerInfo[]): void {
  view.dispatch({
    effects: setBreakpointsEffect.of(breakpoints),
  });
}

/**
 * Update current execution line in the editor
 */
export function updateCurrentExecutionLine(view: EditorView, line: number | null): void {
  view.dispatch({
    effects: setCurrentLineEffect.of(line),
  });
}

/**
 * Scroll to a specific line in the editor
 */
export function scrollToLine(view: EditorView, line: number): void {
  try {
    const lineInfo = view.state.doc.line(line);
    view.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    });
  } catch {
    // Line doesn't exist
  }
}

export default useBreakpointGutter;
