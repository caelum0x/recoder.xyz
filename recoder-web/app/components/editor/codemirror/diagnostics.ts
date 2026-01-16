/**
 * CodeMirror Diagnostics Extension
 * Adds red underlines for build errors in the editor
 */

import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension, Text } from '@codemirror/state';
import type { BuildError } from '~/lib/stores/errors';

/**
 * Convert line:column to document position
 */
function lineColToPos(doc: Text, line: number, col: number = 1): number {
  // Line numbers are 1-indexed
  if (line < 1 || line > doc.lines) {
    return 0;
  }

  const lineInfo = doc.line(line);
  const column = Math.min(col - 1, lineInfo.length); // col is 1-indexed

  return lineInfo.from + Math.max(0, column);
}

/**
 * Convert BuildErrors to CodeMirror Diagnostics
 */
export function errorsToDiagnostics(errors: BuildError[], doc: Text, filePath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const error of errors) {
    // Skip errors without line info or for other files
    if (!error.line) continue;

    // Normalize paths for comparison
    const normalizedFilePath = filePath.replace(/^\/workspace/, '').replace(/^\//, '');
    const errorFilePath = error.filePath?.replace(/^\/workspace/, '').replace(/^\//, '');

    if (errorFilePath && errorFilePath !== normalizedFilePath) continue;

    const from = lineColToPos(doc, error.line, error.column || 1);

    // Calculate end position - use end line/col if available, otherwise highlight the line
    let to: number;
    if (error.endLine && error.endColumn) {
      to = lineColToPos(doc, error.endLine, error.endColumn);
    } else if (error.column) {
      // Highlight from column to end of line (or next few chars)
      const lineInfo = doc.line(error.line);
      const lineText = lineInfo.text;
      // Find the end of the current "word" or use a fixed length
      const remaining = lineText.slice(error.column - 1);
      const wordMatch = remaining.match(/^\w+/);
      const highlightLength = wordMatch ? wordMatch[0].length : Math.min(10, remaining.length);
      to = from + Math.max(1, highlightLength);
    } else {
      // Highlight the whole line
      const lineInfo = doc.line(error.line);
      to = lineInfo.to;
    }

    // Ensure valid range
    to = Math.max(from + 1, Math.min(to, doc.length));

    diagnostics.push({
      from,
      to,
      severity: error.severity === 'warning' ? 'warning' : 'error',
      message: error.message,
      source: error.source,
    });
  }

  return diagnostics;
}

/**
 * Create a linter extension from BuildErrors
 * This is a static linter that shows pre-computed errors (from build output)
 */
export function createDiagnosticsLinter(
  getErrors: () => BuildError[],
  getFilePath: () => string
): Extension {
  return linter((view) => {
    const errors = getErrors();
    const filePath = getFilePath();

    if (!errors.length || !filePath) {
      return [];
    }

    return errorsToDiagnostics(errors, view.state.doc, filePath);
  }, {
    // Don't auto-run on document changes - we'll manually update when errors change
    delay: 100,
  });
}

/**
 * Create a simple static diagnostics array for use with setDiagnostics
 */
export function createStaticDiagnostics(
  errors: BuildError[],
  doc: Text,
  filePath: string
): Diagnostic[] {
  return errorsToDiagnostics(errors, doc, filePath);
}
