/**
 * Auto-fix service for AI-assisted error resolution
 * Formats build errors and sends them to the AI chat for automatic fixing
 */

import type { BuildError } from '~/lib/stores/errors';

/**
 * Format a single error for AI consumption
 */
function formatError(error: BuildError): string {
  const location = error.filePath
    ? `${error.filePath.replace('/workspace/', '')}${error.line ? `:${error.line}` : ''}${error.column ? `:${error.column}` : ''}`
    : 'Unknown location';

  return `- [${error.severity.toUpperCase()}] ${location}\n  ${error.message}`;
}

/**
 * Group errors by file for better organization
 */
function groupErrorsByFile(errors: BuildError[]): Map<string, BuildError[]> {
  const grouped = new Map<string, BuildError[]>();

  for (const error of errors) {
    const file = error.filePath || '__no_file__';

    if (!grouped.has(file)) {
      grouped.set(file, []);
    }

    grouped.get(file)!.push(error);
  }

  return grouped;
}

/**
 * Format all errors into a prompt for AI
 */
export function formatErrorsForAI(errors: BuildError[]): string {
  if (errors.length === 0) {
    return '';
  }

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  let prompt = `🔧 FIX THESE BUILD ERRORS (use agentic workflow):\n\n`;
  prompt += `Summary: ${errorCount} error${errorCount !== 1 ? 's' : ''}`;

  if (warningCount > 0) {
    prompt += `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
  }

  prompt += `\n\n`;

  // Group by file for cleaner output
  const grouped = groupErrorsByFile(errors);

  for (const [file, fileErrors] of grouped) {
    const displayFile = file === '__no_file__' ? 'General' : file.replace('/workspace/', '');
    prompt += `### ${displayFile}\n`;

    for (const error of fileErrors) {
      prompt += formatError(error) + '\n';
    }

    prompt += '\n';
  }

  prompt += `IMPORTANT: Follow the agentic workflow:
1. FIRST use readFile to read the files with errors and package.json
2. ANALYZE what's actually wrong (missing import? missing package? syntax error?)
3. Make MINIMAL targeted fixes - don't regenerate entire files
4. If a package is missing from package.json, add it and run npm install
5. Run npm run dev to verify the fix

DO NOT regenerate files from scratch. Read them first, understand the issue, then fix only what's broken.`;

  return prompt;
}

/**
 * Format a single file's errors for AI
 */
export function formatFileErrorsForAI(errors: BuildError[], filePath: string): string {
  const fileErrors = errors.filter((e) => {
    const normalized = e.filePath?.replace('/workspace/', '');
    const targetNormalized = filePath.replace('/workspace/', '');

    return normalized === targetNormalized;
  });

  if (fileErrors.length === 0) {
    return '';
  }

  const displayPath = filePath.replace('/workspace/', '');
  let prompt = `🔧 Fix errors in ${displayPath}:\n\n`;

  for (const error of fileErrors) {
    const location = error.line ? `Line ${error.line}${error.column ? `, Column ${error.column}` : ''}` : '';
    prompt += `- [${error.severity.toUpperCase()}] ${location}\n  ${error.message}\n`;
  }

  prompt += `\nIMPORTANT: 
1. FIRST use readFile to read ${displayPath} and see the current code
2. If it's a missing import error, also readFile package.json to check dependencies
3. Fix ONLY the specific lines with errors - don't regenerate the whole file
4. If a package is missing, add it to package.json and run npm install`;

  return prompt;
}

/**
 * Request AI to fix all errors
 * This sends a formatted message to the chat
 */
export function requestAIFix(
  errors: BuildError[],
  sendMessage: (message: string) => void
): void {
  const prompt = formatErrorsForAI(errors);

  if (prompt) {
    sendMessage(prompt);
  }
}

/**
 * Request AI to fix errors in a specific file
 */
export function requestFileAIFix(
  errors: BuildError[],
  filePath: string,
  sendMessage: (message: string) => void
): void {
  const prompt = formatFileErrorsForAI(errors, filePath);

  if (prompt) {
    sendMessage(prompt);
  }
}
