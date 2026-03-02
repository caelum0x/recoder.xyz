/**
 * LSP Diagnostics Extension for CodeMirror
 * Provides inline error markers, diagnostic gutters, and underlines
 */

import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { StateField, StateEffect, type Extension, RangeSet } from '@codemirror/state';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { gutter, GutterMarker } from '@codemirror/view';
import type { LSPDiagnostic } from './types';
import { DiagnosticSeverity } from './types';
import { getEnhancedLSPClient } from './enhanced-lsp-client';

// ============================================
// State Effects
// ============================================

const setDiagnosticsEffect = StateEffect.define<LSPDiagnostic[]>();

export function setDiagnostics(diagnostics: LSPDiagnostic[]) {
  return setDiagnosticsEffect.of(diagnostics);
}

// ============================================
// Diagnostic State Field
// ============================================

const diagnosticsState = StateField.define<LSPDiagnostic[]>({
  create() {
    return [];
  },
  update(diagnostics, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiagnosticsEffect)) {
        return effect.value;
      }
    }
    return diagnostics;
  },
});

// ============================================
// Gutter Marker
// ============================================

class DiagnosticGutterMarker extends GutterMarker {
  constructor(
    private severity: DiagnosticSeverity,
    private count: number
  ) {
    super();
  }

  toDOM() {
    const marker = document.createElement('div');
    marker.className = `cm-diagnostic-gutter cm-diagnostic-${this.getSeverityClass()}`;
    marker.style.cssText = `
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
    `;

    const icon = this.getIcon();
    marker.textContent = this.count > 1 ? String(this.count) : icon;
    marker.title = this.getTitle();

    return marker;
  }

  private getSeverityClass(): string {
    switch (this.severity) {
      case DiagnosticSeverity.Error:
        return 'error';
      case DiagnosticSeverity.Warning:
        return 'warning';
      case DiagnosticSeverity.Information:
        return 'info';
      case DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'error';
    }
  }

  private getIcon(): string {
    switch (this.severity) {
      case DiagnosticSeverity.Error:
        return '✖';
      case DiagnosticSeverity.Warning:
        return '⚠';
      case DiagnosticSeverity.Information:
        return 'ℹ';
      case DiagnosticSeverity.Hint:
        return '💡';
      default:
        return '✖';
    }
  }

  private getTitle(): string {
    const severityName = this.getSeverityClass();
    return this.count > 1
      ? `${this.count} ${severityName}s on this line`
      : `${severityName} on this line`;
  }
}

// ============================================
// Diagnostic Gutter
// ============================================

function diagnosticGutter() {
  return gutter({
    class: 'cm-diagnostic-gutter-column',
    markers: (view) => {
      const diagnostics = view.state.field(diagnosticsState, false) || [];
      const markers: Array<{ from: number; to: number; value: GutterMarker }> = [];
      const lineMap = new Map<number, { severity: DiagnosticSeverity; count: number }>();

      // Group diagnostics by line and find most severe
      for (const diagnostic of diagnostics) {
        const line = diagnostic.range.start.line;
        const existing = lineMap.get(line);

        if (!existing || diagnostic.severity! < existing.severity) {
          lineMap.set(line, {
            severity: diagnostic.severity || DiagnosticSeverity.Error,
            count: (existing?.count || 0) + 1,
          });
        } else {
          existing.count++;
        }
      }

      // Create markers for each line
      for (const [line, { severity, count }] of lineMap) {
        try {
          const lineObj = view.state.doc.line(line + 1); // LSP uses 0-based lines
          markers.push({
            from: lineObj.from,
            to: lineObj.from,
            value: new DiagnosticGutterMarker(severity, count),
          });
        } catch {
          // Line might be out of range
        }
      }

      return RangeSet.of(markers);
    },
    initialSpacer: () => new DiagnosticGutterMarker(DiagnosticSeverity.Error, 1),
  });
}

// ============================================
// Diagnostic Underlines
// ============================================

function diagnosticUnderlines() {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(underlines, tr) {
      underlines = underlines.map(tr.changes);

      for (const effect of tr.effects) {
        if (effect.is(setDiagnosticsEffect)) {
          const decorations: Array<{ from: number; to: number; value: Decoration }> = [];

          for (const diagnostic of effect.value) {
            try {
              const from = tr.state.doc.line(diagnostic.range.start.line + 1).from + diagnostic.range.start.character;
              const to = tr.state.doc.line(diagnostic.range.end.line + 1).from + diagnostic.range.end.character;

              if (from < to && from >= 0 && to <= tr.state.doc.length) {
                const severity = diagnostic.severity || DiagnosticSeverity.Error;
                const className = `cm-diagnostic-underline cm-diagnostic-${getSeverityClassName(severity)}`;

                decorations.push({
                  from,
                  to,
                  value: Decoration.mark({
                    class: className,
                    attributes: {
                      title: diagnostic.message,
                    },
                  }),
                });
              }
            } catch {
              // Range might be invalid
            }
          }

          return RangeSet.of(decorations, true);
        }
      }

      return underlines;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

function getSeverityClassName(severity: DiagnosticSeverity): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return 'error';
    case DiagnosticSeverity.Warning:
      return 'warning';
    case DiagnosticSeverity.Information:
      return 'info';
    case DiagnosticSeverity.Hint:
      return 'hint';
    default:
      return 'error';
  }
}

// ============================================
// Diagnostic Hover Tooltip
// ============================================

function diagnosticHoverTooltip() {
  return hoverTooltip((view, pos) => {
    const diagnostics = view.state.field(diagnosticsState, false) || [];
    const line = view.state.doc.lineAt(pos);
    const lineNumber = line.number - 1; // LSP uses 0-based lines
    const character = pos - line.from;

    // Find diagnostics at this position
    const relevantDiagnostics = diagnostics.filter((d) => {
      const onCorrectLine = d.range.start.line === lineNumber || d.range.end.line === lineNumber;
      const inRange =
        character >= d.range.start.character && character <= d.range.end.character;
      return onCorrectLine && inRange;
    });

    if (relevantDiagnostics.length === 0) {
      return null;
    }

    return {
      pos,
      above: true,
      create(): { dom: HTMLElement } {
        const dom = document.createElement('div');
        dom.className = 'cm-diagnostic-tooltip';
        dom.style.cssText = `
          max-width: 500px;
          font-size: 13px;
          padding: 8px 12px;
          background: var(--recoder-elements-background-depth-3, #1e1e1e);
          border: 1px solid var(--recoder-elements-borderColor, #333);
          border-radius: 6px;
          color: var(--recoder-elements-textPrimary, #e1e1e1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        for (const diagnostic of relevantDiagnostics) {
          const item = document.createElement('div');
          item.className = `cm-diagnostic-item cm-diagnostic-${getSeverityClassName(
            diagnostic.severity || DiagnosticSeverity.Error
          )}`;
          item.style.cssText = `
            margin: 4px 0;
            padding: 4px 8px;
            border-left: 3px solid ${getSeverityColor(diagnostic.severity || DiagnosticSeverity.Error)};
          `;

          const header = document.createElement('div');
          header.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
          header.textContent = `${getSeverityLabel(diagnostic.severity || DiagnosticSeverity.Error)}${
            diagnostic.source ? ` (${diagnostic.source})` : ''
          }`;

          const message = document.createElement('div');
          message.style.cssText = 'white-space: pre-wrap;';
          message.textContent = diagnostic.message;

          if (diagnostic.code) {
            const code = document.createElement('div');
            code.style.cssText = 'font-size: 11px; opacity: 0.7; margin-top: 4px;';
            code.textContent = `Code: ${diagnostic.code}`;
            item.appendChild(code);
          }

          item.appendChild(header);
          item.appendChild(message);
          dom.appendChild(item);
        }

        return { dom };
      },
    } as Tooltip;
  });
}

function getSeverityColor(severity: DiagnosticSeverity): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return '#f48771';
    case DiagnosticSeverity.Warning:
      return '#cca700';
    case DiagnosticSeverity.Information:
      return '#75beff';
    case DiagnosticSeverity.Hint:
      return '#eeeeeeb3';
    default:
      return '#f48771';
  }
}

function getSeverityLabel(severity: DiagnosticSeverity): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return 'Error';
    case DiagnosticSeverity.Warning:
      return 'Warning';
    case DiagnosticSeverity.Information:
      return 'Info';
    case DiagnosticSeverity.Hint:
      return 'Hint';
    default:
      return 'Error';
  }
}

// ============================================
// Auto-sync Diagnostics Plugin
// ============================================

function autoSyncDiagnostics(projectId: string, filePath: string) {
  return ViewPlugin.fromClass(
    class {
      private unsubscribe: (() => void) | null = null;

      constructor(private view: EditorView) {
        const client = getEnhancedLSPClient(projectId);

        // Listen for diagnostic updates
        this.unsubscribe = client.onDiagnostics((uri, diagnostics) => {
          // Check if diagnostics are for this file
          const normalizedUri = uri.replace('file://', '').replace(/^\/workspace\//, '');
          const normalizedPath = filePath.replace(/^\/+/, '').replace(/^workspace\//, '');

          if (normalizedUri === normalizedPath || uri.endsWith(normalizedPath)) {
            this.view.dispatch({
              effects: setDiagnosticsEffect.of(diagnostics),
            });
          }
        });

        // Get initial diagnostics
        const initialDiagnostics = client.getDiagnostics(filePath);
        if (initialDiagnostics.length > 0) {
          this.view.dispatch({
            effects: setDiagnosticsEffect.of(initialDiagnostics),
          });
        }
      }

      destroy() {
        if (this.unsubscribe) {
          this.unsubscribe();
        }
      }
    }
  );
}

// ============================================
// Combined Diagnostics Extension
// ============================================

export function lspDiagnostics(projectId: string, filePath: string): Extension {
  return [
    diagnosticsState,
    diagnosticGutter(),
    diagnosticUnderlines(),
    diagnosticHoverTooltip(),
    autoSyncDiagnostics(projectId, filePath),
    // Add CSS styles
    EditorView.theme({
      '.cm-diagnostic-gutter-error': {
        color: '#f48771',
      },
      '.cm-diagnostic-gutter-warning': {
        color: '#cca700',
      },
      '.cm-diagnostic-gutter-info': {
        color: '#75beff',
      },
      '.cm-diagnostic-gutter-hint': {
        color: '#eeeeeeb3',
      },
      '.cm-diagnostic-underline-error': {
        textDecoration: 'wavy underline #f48771',
        textDecorationSkipInk: 'none',
      },
      '.cm-diagnostic-underline-warning': {
        textDecoration: 'wavy underline #cca700',
        textDecorationSkipInk: 'none',
      },
      '.cm-diagnostic-underline-info': {
        textDecoration: 'wavy underline #75beff',
        textDecorationSkipInk: 'none',
      },
      '.cm-diagnostic-underline-hint': {
        textDecoration: 'dotted underline #eeeeeeb3',
        textDecorationSkipInk: 'none',
      },
    }),
  ];
}

export default lspDiagnostics;
