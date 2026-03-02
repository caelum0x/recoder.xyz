/**
 * CodeMirror Error Highlighting Extension
 * Adds line highlighting, gutter icons, and hover tooltips for build errors
 */

import {
  Decoration,
  EditorView,
  ViewPlugin,
  gutter,
  GutterMarker,
  hoverTooltip,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder, RangeSet, Facet, EditorState, type Extension } from '@codemirror/state';
import type { BuildError } from '~/lib/stores/errors';

// ============================================
// Types
// ============================================

export interface ErrorHighlightConfig {
  /** Callback when clicking a gutter icon */
  onErrorClick?: (error: BuildError) => void;
  /** Callback to navigate to error in Problems panel */
  onNavigateToError?: (error: BuildError) => void;
}

// ============================================
// State Effects for updating errors
// ============================================

export const setErrorsEffect = StateEffect.define<{
  errors: BuildError[];
  filePath: string;
}>();

// ============================================
// Error state field - stores current errors for the file
// ============================================

interface ErrorState {
  errors: BuildError[];
  filePath: string;
}

const errorStateField = StateField.define<ErrorState>({
  create() {
    return { errors: [], filePath: '' };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorsEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// ============================================
// Configuration facet
// ============================================

const configFacet = Facet.define<ErrorHighlightConfig, ErrorHighlightConfig>({
  combine(configs) {
    return configs[configs.length - 1] || {};
  },
});

// ============================================
// Line Decorations (background highlighting)
// ============================================

const errorLineDecoration = Decoration.line({
  class: 'cm-error-line',
});

const warningLineDecoration = Decoration.line({
  class: 'cm-warning-line',
});

function createLineDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { errors, filePath } = state.field(errorStateField);

  if (!errors.length || !filePath) {
    return Decoration.none;
  }

  // Group errors by line and get the most severe per line
  const lineDecorations = new Map<number, 'error' | 'warning'>();

  for (const error of errors) {
    if (!error.line || error.line < 1 || error.line > state.doc.lines) continue;

    // Normalize paths for comparison
    const normalizedFilePath = filePath.replace(/^\/workspace/, '').replace(/^\//, '');
    const errorFilePath = error.filePath?.replace(/^\/workspace/, '').replace(/^\//, '');

    if (errorFilePath && errorFilePath !== normalizedFilePath) continue;

    const existing = lineDecorations.get(error.line);
    // Error takes precedence over warning
    if (!existing || (existing === 'warning' && error.severity === 'error')) {
      lineDecorations.set(error.line, error.severity);
    }
  }

  // Sort by line number and add decorations
  const sortedLines = Array.from(lineDecorations.entries()).sort((a, b) => a[0] - b[0]);

  for (const [lineNumber, severity] of sortedLines) {
    try {
      const line = state.doc.line(lineNumber);
      const decoration = severity === 'error' ? errorLineDecoration : warningLineDecoration;
      builder.add(line.from, line.from, decoration);
    } catch {
      // Line may not exist if document changed
    }
  }

  return builder.finish();
}

const lineDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createLineDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(setErrorsEffect)))
      ) {
        this.decorations = createLineDecorations(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// ============================================
// Gutter Markers
// ============================================

class ErrorGutterMarker extends GutterMarker {
  severity: 'error' | 'warning';
  errors: BuildError[];
  config: ErrorHighlightConfig;

  constructor(severity: 'error' | 'warning', errors: BuildError[], config: ErrorHighlightConfig) {
    super();
    this.severity = severity;
    this.errors = errors;
    this.config = config;
  }

  eq(other: ErrorGutterMarker) {
    return this.severity === other.severity && this.errors.length === other.errors.length;
  }

  toDOM() {
    const icon = document.createElement('div');
    icon.className = `cm-error-gutter-icon cm-error-gutter-${this.severity}`;

    // Add click handler
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      // Show first error for this line
      if (this.errors.length > 0 && this.config.onErrorClick) {
        this.config.onErrorClick(this.errors[0]);
      }
    });

    // Add title for basic tooltip
    icon.title = this.errors.map((e) => e.shortMessage || e.message).join('\n');

    return icon;
  }
}

function createErrorGutter(config: ErrorHighlightConfig): Extension {
  return gutter({
    class: 'cm-error-gutter',
    markers: (view): RangeSet<GutterMarker> => {
      const { errors, filePath } = view.state.field(errorStateField);
      const builder = new RangeSetBuilder<GutterMarker>();

      if (!errors.length || !filePath) {
        return RangeSet.empty;
      }

      // Group errors by line
      const errorsByLine = new Map<number, BuildError[]>();

      for (const error of errors) {
        if (!error.line || error.line < 1 || error.line > view.state.doc.lines) continue;

        // Normalize paths for comparison
        const normalizedFilePath = filePath.replace(/^\/workspace/, '').replace(/^\//, '');
        const errorFilePath = error.filePath?.replace(/^\/workspace/, '').replace(/^\//, '');

        if (errorFilePath && errorFilePath !== normalizedFilePath) continue;

        const existing = errorsByLine.get(error.line) || [];
        existing.push(error);
        errorsByLine.set(error.line, existing);
      }

      // Sort by line number and build the range set
      const sortedLines = Array.from(errorsByLine.entries()).sort((a, b) => a[0] - b[0]);

      for (const [lineNumber, lineErrors] of sortedLines) {
        try {
          const line = view.state.doc.line(lineNumber);
          const hasError = lineErrors.some((e) => e.severity === 'error');
          const severity = hasError ? 'error' : 'warning';
          builder.add(line.from, line.from, new ErrorGutterMarker(severity, lineErrors, config));
        } catch {
          // Line may not exist
        }
      }

      return builder.finish();
    },
  });
}

// ============================================
// Hover Tooltip
// ============================================

function createErrorHoverTooltip(): Extension {
  return hoverTooltip(
    (view, pos, side) => {
      const { errors, filePath } = view.state.field(errorStateField);

      if (!errors.length || !filePath) {
        return null;
      }

      // Get the line at the hover position
      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number;

      // Find errors for this line
      const lineErrors = errors.filter((error) => {
        if (!error.line) return false;

        // Normalize paths for comparison
        const normalizedFilePath = filePath.replace(/^\/workspace/, '').replace(/^\//, '');
        const errorFilePath = error.filePath?.replace(/^\/workspace/, '').replace(/^\//, '');

        if (errorFilePath && errorFilePath !== normalizedFilePath) return false;

        return error.line === lineNumber;
      });

      if (lineErrors.length === 0) {
        return null;
      }

      return {
        pos: line.from,
        end: line.to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-error-tooltip';

          for (const error of lineErrors) {
            const errorDiv = document.createElement('div');
            errorDiv.className = `cm-error-tooltip-item cm-error-tooltip-${error.severity}`;

            // Icon
            const icon = document.createElement('span');
            icon.className = `cm-error-tooltip-icon cm-error-tooltip-icon-${error.severity}`;
            errorDiv.appendChild(icon);

            // Message
            const message = document.createElement('span');
            message.className = 'cm-error-tooltip-message';
            message.textContent = error.shortMessage || error.message;
            errorDiv.appendChild(message);

            // Source badge
            if (error.source) {
              const source = document.createElement('span');
              source.className = 'cm-error-tooltip-source';
              source.textContent = error.source;
              errorDiv.appendChild(source);
            }

            dom.appendChild(errorDiv);
          }

          return { dom };
        },
      };
    },
    {
      hideOnChange: true,
      hoverTime: 300,
    }
  );
}

// ============================================
// Theme (CSS styles)
// ============================================

const errorHighlightTheme = EditorView.baseTheme({
  // Line highlighting
  '.cm-error-line': {
    backgroundColor: 'rgba(244, 63, 94, 0.12)', // red-500 with opacity
  },
  '.cm-warning-line': {
    backgroundColor: 'rgba(234, 179, 8, 0.12)', // yellow-500 with opacity
  },

  // Gutter styles
  '.cm-error-gutter': {
    width: '16px',
    paddingLeft: '2px',
    paddingRight: '2px',
  },
  '.cm-error-gutter-spacer': {
    width: '12px',
    height: '12px',
  },
  '.cm-error-gutter-icon': {
    width: '12px',
    height: '12px',
    cursor: 'pointer',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '4px',
    transition: 'transform 0.1s ease',
    '&:hover': {
      transform: 'scale(1.2)',
    },
  },
  '.cm-error-gutter-error': {
    backgroundColor: 'rgb(239, 68, 68)', // red-500
    boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
    '&::after': {
      content: '""',
      width: '4px',
      height: '4px',
      backgroundColor: 'white',
      borderRadius: '50%',
    },
  },
  '.cm-error-gutter-warning': {
    backgroundColor: 'rgb(234, 179, 8)', // yellow-500
    boxShadow: '0 0 4px rgba(234, 179, 8, 0.5)',
    '&::after': {
      content: '""',
      width: '0',
      height: '0',
      borderLeft: '3px solid transparent',
      borderRight: '3px solid transparent',
      borderBottom: '4px solid white',
      marginBottom: '1px',
    },
  },

  // Tooltip styles
  '.cm-error-tooltip': {
    backgroundColor: 'var(--recoder-elements-bg-depth-2, #1e1e1e)',
    border: '1px solid var(--recoder-elements-borderColor, #333)',
    borderRadius: '6px',
    padding: '8px',
    maxWidth: '500px',
    fontSize: '12px',
    lineHeight: '1.4',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  '.cm-error-tooltip-item': {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '4px 0',
    '&:not(:last-child)': {
      borderBottom: '1px solid var(--recoder-elements-borderColor, #333)',
      paddingBottom: '8px',
      marginBottom: '4px',
    },
  },
  '.cm-error-tooltip-icon': {
    width: '14px',
    height: '14px',
    flexShrink: '0',
    marginTop: '2px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '.cm-error-tooltip-icon-error': {
    backgroundColor: 'rgb(239, 68, 68)',
    '&::after': {
      content: '"×"',
      color: 'white',
      fontSize: '10px',
      fontWeight: 'bold',
    },
  },
  '.cm-error-tooltip-icon-warning': {
    backgroundColor: 'rgb(234, 179, 8)',
    '&::after': {
      content: '"!"',
      color: 'white',
      fontSize: '10px',
      fontWeight: 'bold',
    },
  },
  '.cm-error-tooltip-message': {
    flex: '1',
    color: 'var(--recoder-elements-textPrimary, #e5e5e5)',
    wordBreak: 'break-word',
  },
  '.cm-error-tooltip-source': {
    flexShrink: '0',
    padding: '2px 6px',
    backgroundColor: 'var(--recoder-elements-bg-depth-3, #2a2a2a)',
    borderRadius: '4px',
    fontSize: '10px',
    color: 'var(--recoder-elements-textSecondary, #999)',
    textTransform: 'lowercase',
  },
});

// ============================================
// Main Extension Factory
// ============================================

/**
 * Create the error highlighting extension with all features
 */
export function errorHighlighting(config: ErrorHighlightConfig = {}): Extension {
  return [
    configFacet.of(config),
    errorStateField,
    lineDecorationPlugin,
    createErrorGutter(config),
    createErrorHoverTooltip(),
    errorHighlightTheme,
  ];
}

/**
 * Update errors for the current file
 * Call this when errors change to update the highlights
 */
export function updateErrors(view: EditorView, errors: BuildError[], filePath: string) {
  view.dispatch({
    effects: setErrorsEffect.of({ errors, filePath }),
  });
}

/**
 * Get the errors currently stored in the editor state
 */
export function getErrors(state: EditorState): BuildError[] {
  return state.field(errorStateField).errors;
}
