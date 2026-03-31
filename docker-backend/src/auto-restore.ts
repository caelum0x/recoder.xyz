/**
 * Auto-Restore on Build Errors
 * Monitors dev server for errors and auto-restores to last working snapshot
 */

import { snapshotManager } from './snapshot-manager.js';

// ============================================
// Parsed Build Error Interface (for frontend)
// ============================================

export interface ParsedBuildError {
  id: string;
  type: 'syntax' | 'type' | 'reference' | 'module' | 'build' | 'npm' | 'runtime' | 'unknown';
  severity: 'error' | 'warning';
  message: string;
  shortMessage: string;
  filePath?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  source: 'typescript' | 'vite' | 'eslint' | 'npm' | 'runtime' | 'unknown';
  rawError: string;
  timestamp: number;
}

interface ErrorPattern {
  pattern: RegExp;
  severity: 'critical' | 'warning';
  description: string;
}

// Common build error patterns
const ERROR_PATTERNS: ErrorPattern[] = [
  // TypeScript/JavaScript errors
  { pattern: /SyntaxError:/i, severity: 'critical', description: 'Syntax error' },
  { pattern: /TypeError:/i, severity: 'critical', description: 'Type error' },
  { pattern: /ReferenceError:/i, severity: 'critical', description: 'Reference error' },
  { pattern: /Module not found/i, severity: 'critical', description: 'Missing module' },
  { pattern: /Cannot find module/i, severity: 'critical', description: 'Missing module' },
  
  // Build tool errors
  { pattern: /Build failed/i, severity: 'critical', description: 'Build failed' },
  { pattern: /Compilation failed/i, severity: 'critical', description: 'Compilation failed' },
  { pattern: /error TS\d+:/i, severity: 'critical', description: 'TypeScript error' },
  
  // Runtime errors
  { pattern: /EADDRINUSE/i, severity: 'warning', description: 'Port in use' },
  { pattern: /ECONNREFUSED/i, severity: 'warning', description: 'Connection refused' },
  
  // Package errors
  { pattern: /npm ERR!/i, severity: 'critical', description: 'npm error' },
  { pattern: /ERESOLVE/i, severity: 'critical', description: 'Dependency conflict' },
];

interface AutoRestoreConfig {
  enabled: boolean;
  maxRetries: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
}

interface RetryState {
  errorCount: number;
  lastRestoreTime: number;
  lastErrorMessages: string[];
  isBlocked: boolean;
}

class AutoRestoreManager {
  private retryStates = new Map<string, RetryState>();
  private config: AutoRestoreConfig = {
    enabled: true,
    maxRetries: 5,
    baseCooldownMs: 2000, // Start with 2 seconds
    maxCooldownMs: 60000, // Max 60 seconds
  };

  private getRetryState(projectId: string): RetryState {
    let state = this.retryStates.get(projectId);
    if (!state) {
      state = {
        errorCount: 0,
        lastRestoreTime: 0,
        lastErrorMessages: [],
        isBlocked: false,
      };
      this.retryStates.set(projectId, state);
    }
    return state;
  }

  /**
   * Get exponential backoff delay based on error count
   */
  private getBackoffDelay(errorCount: number): number {
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, capped at maxCooldownMs
    const delay = this.config.baseCooldownMs * Math.pow(2, errorCount);
    return Math.min(delay, this.config.maxCooldownMs);
  }

  /**
   * Analyze logs for critical errors
   * Returns both generic descriptions and actual error context
   */
  detectErrors(logs: string): { hasError: boolean; errors: string[]; details: string[] } {
    const errors: string[] = [];
    const details: string[] = [];

    for (const { pattern, severity, description } of ERROR_PATTERNS) {
      if (severity === 'critical' && pattern.test(logs)) {
        errors.push(description);

        // Extract actual error context (line containing the error + some context)
        const lines = logs.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            // Get this line and up to 2 lines of context
            const context = lines.slice(Math.max(0, i - 1), i + 3).join('\n').trim();
            if (context && !details.includes(context)) {
              details.push(context);
            }
          }
        }
      }
    }

    return {
      hasError: errors.length > 0,
      errors,
      details: details.slice(0, 5), // Limit to 5 error details
    };
  }

  /**
   * Check if auto-restore should trigger
   */
  shouldRestore(projectId: string): { allowed: boolean; reason?: string; nextRetryIn?: number } {
    if (!this.config.enabled) {
      return { allowed: false, reason: 'Auto-restore disabled' };
    }

    const state = this.getRetryState(projectId);

    if (state.isBlocked) {
      return { allowed: false, reason: 'Manual reset required' };
    }

    if (state.errorCount >= this.config.maxRetries) {
      console.log(`[AutoRestore] Max retries (${this.config.maxRetries}) reached for ${projectId}`);
      return {
        allowed: false,
        reason: `Max retries (${this.config.maxRetries}) reached. Make a file change or click retry to reset.`,
      };
    }

    const now = Date.now();
    const cooldown = this.getBackoffDelay(state.errorCount);
    const timeSinceLastRestore = now - state.lastRestoreTime;

    if (timeSinceLastRestore < cooldown) {
      const remaining = cooldown - timeSinceLastRestore;
      console.log(`[AutoRestore] Cooldown active for ${projectId}, ${remaining}ms remaining`);
      return {
        allowed: false,
        reason: 'Cooldown active',
        nextRetryIn: remaining,
      };
    }

    return { allowed: true };
  }

  /**
   * Attempt auto-restore
   */
  async attemptRestore(
    containerId: string,
    projectId: string,
    force = false
  ): Promise<{
    success: boolean;
    restoredTo?: string;
    error?: string;
    retryCount?: number;
    nextRetryIn?: number;
  }> {
    try {
      const state = this.getRetryState(projectId);

      // If forcing, reset the blocked state
      if (force) {
        state.isBlocked = false;
        state.errorCount = Math.max(0, state.errorCount - 1); // Give one more chance
        console.log(`[AutoRestore] Force retry requested for ${projectId}, errorCount now: ${state.errorCount}`);
      }

      const check = this.shouldRestore(projectId);
      if (!check.allowed) {
        return {
          success: false,
          error: check.reason || 'Restore not allowed',
          retryCount: state.errorCount,
          nextRetryIn: check.nextRetryIn,
        };
      }

      // Get snapshots
      const snapshots = await snapshotManager.listSnapshots(containerId, 10);

      // Find last snapshot before AI changes (marked as 'user' or 'auto')
      const lastWorking = snapshots.find(s => s.author === 'user' || s.author === 'auto');

      if (!lastWorking) {
        return { success: false, error: 'No working snapshot found', retryCount: state.errorCount };
      }

      console.log(`[AutoRestore] Restoring ${projectId} to ${lastWorking.id} (attempt ${state.errorCount + 1}/${this.config.maxRetries})`);

      // Restore
      await snapshotManager.restoreSnapshot(containerId, projectId, lastWorking.id);

      // Update tracking
      state.errorCount++;
      state.lastRestoreTime = Date.now();

      const nextDelay = this.getBackoffDelay(state.errorCount);
      console.log(`[AutoRestore] Success. Next retry in ${nextDelay}ms if needed.`);

      return {
        success: true,
        restoredTo: lastWorking.id,
        retryCount: state.errorCount,
        nextRetryIn: nextDelay,
      };
    } catch (error: any) {
      console.error(`[AutoRestore] Failed for ${projectId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset error count (call when build succeeds)
   */
  resetErrors(projectId: string): void {
    const state = this.retryStates.get(projectId);
    if (state) {
      state.errorCount = 0;
      state.lastErrorMessages = [];
      state.isBlocked = false;
      console.log(`[AutoRestore] Errors reset for ${projectId} (build succeeded)`);
    }
  }

  /**
   * Reset on file change - gives more retry attempts
   * Called when user makes a new file change, indicating they're trying to fix the issue
   */
  resetOnFileChange(projectId: string): void {
    const state = this.retryStates.get(projectId);
    if (state && state.errorCount > 0) {
      // Don't fully reset, but give a few more retries
      state.errorCount = Math.max(0, state.errorCount - 2);
      state.isBlocked = false;
      console.log(`[AutoRestore] Partial reset for ${projectId} on file change, errorCount now: ${state.errorCount}`);
    }
  }

  /**
   * Force reset all retry state (manual user action)
   */
  forceReset(projectId: string): void {
    this.retryStates.delete(projectId);
    console.log(`[AutoRestore] Force reset for ${projectId}`);
  }

  /**
   * Get current retry state for a project
   */
  getState(projectId: string): {
    errorCount: number;
    maxRetries: number;
    lastErrors: string[];
    canRetry: boolean;
    nextRetryIn?: number;
  } {
    const state = this.getRetryState(projectId);
    const check = this.shouldRestore(projectId);

    return {
      errorCount: state.errorCount,
      maxRetries: this.config.maxRetries,
      lastErrors: state.lastErrorMessages,
      canRetry: check.allowed,
      nextRetryIn: check.nextRetryIn,
    };
  }

  /**
   * Store error messages for later retrieval
   */
  setLastErrors(projectId: string, errors: string[]): void {
    const state = this.getRetryState(projectId);
    state.lastErrorMessages = errors.slice(0, 5);
  }

  /**
   * Configure auto-restore
   */
  configure(config: Partial<AutoRestoreConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const autoRestoreManager = new AutoRestoreManager();

// ============================================
// Detailed Error Parsing Functions
// ============================================

let errorIdCounter = 0;

function generateErrorId(): string {
  return `err_${Date.now()}_${++errorIdCounter}`;
}

function truncateMessage(message: string, maxLength: number = 100): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 3) + '...';
}

function normalizeFilePath(filePath: string): string {
  if (filePath.startsWith('/home/daytona/')) {
    return `/workspace/${filePath.slice('/home/daytona/'.length)}`;
  }
  // Remove /workspace prefix for cleaner display, but keep it for matching
  if (filePath.startsWith('/workspace/')) {
    return filePath;
  }
  if (filePath.startsWith('/')) {
    return filePath;
  }
  return `/workspace/${filePath.replace(/^\.\//, '')}`;
}

/**
 * Parse TypeScript errors
 * Format: src/App.tsx(15,3): error TS2345: Argument of type...
 * Also: src/App.tsx:15:3 - error TS2345: Argument of type...
 */
function parseTypeScriptErrors(logs: string): ParsedBuildError[] {
  const errors: ParsedBuildError[] = [];
  const timestamp = Date.now();

  // Pattern 1: file(line,col): error TSxxxx: message
  const pattern1 = /([^\s(]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+?)(?=\n|$)/g;
  let match;

  while ((match = pattern1.exec(logs)) !== null) {
    const [rawError, file, line, col, code, message] = match;
    errors.push({
      id: generateErrorId(),
      type: 'type',
      severity: 'error',
      message: `${code}: ${message}`,
      shortMessage: truncateMessage(message),
      filePath: normalizeFilePath(file),
      line: parseInt(line, 10),
      column: parseInt(col, 10),
      source: 'typescript',
      rawError,
      timestamp,
    });
  }

  // Pattern 2: file:line:col - error TSxxxx: message
  const pattern2 = /([^\s:]+):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+?)(?=\n|$)/g;

  while ((match = pattern2.exec(logs)) !== null) {
    const [rawError, file, line, col, code, message] = match;
    // Avoid duplicates
    if (!errors.some(e => e.filePath === normalizeFilePath(file) && e.line === parseInt(line, 10))) {
      errors.push({
        id: generateErrorId(),
        type: 'type',
        severity: 'error',
        message: `${code}: ${message}`,
        shortMessage: truncateMessage(message),
        filePath: normalizeFilePath(file),
        line: parseInt(line, 10),
        column: parseInt(col, 10),
        source: 'typescript',
        rawError,
        timestamp,
      });
    }
  }

  return errors;
}

/**
 * Parse Vite/esbuild errors
 * Format: [vite] Error: message
 *   at /path/file.ts:15:3
 * Also: X [ERROR] message
 *   file:line:col:
 */
function parseViteErrors(logs: string): ParsedBuildError[] {
  const errors: ParsedBuildError[] = [];
  const timestamp = Date.now();
  const lines = logs.split('\n');

  const matchViteHeader = (line: string): RegExpMatchArray | null =>
    line.match(/\[vite\](?:\s*\([^)]*\))?\s*(?:Internal server error|Pre-transform error|Error):\s*(.+)\s*$/i)
    || line.match(/^\[?plugin:vite:[^\]]+\]?\s*(.+)\s*$/i);

  const isViteHeaderLine = (line: string): boolean =>
    /\[vite\](?:\s*\([^)]*\))?\s*(?:Internal server error|Pre-transform error|Error):/i.test(line)
    || /^\[?plugin:vite:[^\]]+\]?/i.test(line);

  // Vite error blocks start with a header line and may include Plugin/File/stack context.
  for (let i = 0; i < lines.length; i++) {
    const headerMatch = matchViteHeader(lines[i]);
    if (!headerMatch) continue;

    const detailLines = [lines[i]];
    let filePath: string | undefined;
    let lineNumber: number | undefined;
    let columnNumber: number | undefined;

    for (let j = i + 1; j < lines.length; j++) {
      const detailLine = lines[j];
      const trimmed = detailLine.trim();
      const normalizedTrimmed = trimmed.replace(/^\[[^\]]+\]\s*/, '').trimStart();

      if (!trimmed) break;
      if (isViteHeaderLine(detailLine)) break;
      if (/^X\s*\[ERROR\]/.test(detailLine)) break;
      if (/^\S/.test(detailLine) && !/^(Plugin:|File:|at\b|\d+\s*\||\^|\/|[A-Za-z0-9_./-]+\.(?:[jt]sx?|css|scss|sass|less|html):)/.test(normalizedTrimmed)) {
        break;
      }

      detailLines.push(detailLine);

      const fileMatch = normalizedTrimmed.match(/^File:\s*(.+?):(\d+|undefined):(\d+|null|NaN)$/);
      if (fileMatch) {
        filePath = normalizeFilePath(fileMatch[1]);
        lineNumber = /^\d+$/.test(fileMatch[2]) ? parseInt(fileMatch[2], 10) : undefined;
        columnNumber = /^\d+$/.test(fileMatch[3]) ? parseInt(fileMatch[3], 10) : undefined;
        continue;
      }

      const rawPathMatch = normalizedTrimmed.match(/^(.+\.(?:[jt]sx?|css|scss|sass|less|html)):(\d+|undefined):(\d+|null|NaN)$/);
      if (rawPathMatch) {
        filePath = normalizeFilePath(rawPathMatch[1]);
        lineNumber = /^\d+$/.test(rawPathMatch[2]) ? parseInt(rawPathMatch[2], 10) : undefined;
        columnNumber = /^\d+$/.test(rawPathMatch[3]) ? parseInt(rawPathMatch[3], 10) : undefined;
        continue;
      }

      if (!filePath) {
        const stackMatch = normalizedTrimmed.match(/\(?([^\s():]+\.(?:[jt]sx?|css|scss|sass|less|html)):(\d+):(\d+)\)?/);
        if (stackMatch) {
          filePath = normalizeFilePath(stackMatch[1]);
          lineNumber = parseInt(stackMatch[2], 10);
          columnNumber = parseInt(stackMatch[3], 10);
        }
      }
    }

    const message = headerMatch[1].trim();
    const lowerMessage = message.toLowerCase();
    let type: ParsedBuildError['type'] = 'build';
    if (
      lowerMessage.includes('failed to resolve import')
      || lowerMessage.includes('cannot find module')
      || lowerMessage.includes('module not found')
    ) {
      type = 'module';
    } else if (lowerMessage.includes('syntax') || lowerMessage.includes('unexpected token')) {
      type = 'syntax';
    } else if (lowerMessage.includes('referenceerror')) {
      type = 'reference';
    } else if (lowerMessage.includes('typeerror')) {
      type = 'type';
    }

    errors.push({
      id: generateErrorId(),
      type,
      severity: 'error',
      message,
      shortMessage: truncateMessage(message),
      filePath,
      line: lineNumber,
      column: columnNumber,
      source: 'vite',
      rawError: detailLines.join('\n'),
      timestamp,
    });

    i += detailLines.length - 1;
  }

  // esbuild style errors: X [ERROR] message
  let match;
  const esbuildPattern = /X\s*\[ERROR\]\s*(.+?)\n\s*([^\s:]+):(\d+):(\d+):/g;

  while ((match = esbuildPattern.exec(logs)) !== null) {
    const [rawError, message, file, line, col] = match;
    errors.push({
      id: generateErrorId(),
      type: 'build',
      severity: 'error',
      message: message.trim(),
      shortMessage: truncateMessage(message.trim()),
      filePath: normalizeFilePath(file),
      line: parseInt(line, 10),
      column: parseInt(col, 10),
      source: 'vite',
      rawError,
      timestamp,
    });
  }

  return errors;
}

/**
 * Parse ESLint errors
 * Format: /path/to/file.tsx
 *   15:3  error  Description here  rule-name
 */
function parseESLintErrors(logs: string): ParsedBuildError[] {
  const errors: ParsedBuildError[] = [];
  const timestamp = Date.now();

  // Find file headers followed by error lines
  const lines = logs.split('\n');
  let currentFile: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line is a file path
    if (/^\/[\w\-./]+\.(tsx?|jsx?|vue|svelte)$/.test(line.trim())) {
      currentFile = line.trim();
      continue;
    }

    // Check for ESLint error line: "  15:3  error  message  rule-name"
    const eslintMatch = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+)\s*$/);
    if (eslintMatch && currentFile) {
      const [, lineNum, col, severity, message, rule] = eslintMatch;
      errors.push({
        id: generateErrorId(),
        type: 'syntax',
        severity: severity === 'error' ? 'error' : 'warning',
        message: `${message} (${rule})`,
        shortMessage: truncateMessage(message),
        filePath: normalizeFilePath(currentFile),
        line: parseInt(lineNum, 10),
        column: parseInt(col, 10),
        source: 'eslint',
        rawError: line,
        timestamp,
      });
    }
  }

  return errors;
}

/**
 * Parse npm errors
 * Format: npm ERR! message
 */
function parseNpmErrors(logs: string): ParsedBuildError[] {
  const errors: ParsedBuildError[] = [];
  const timestamp = Date.now();

  // npm error lines
  const npmPattern = /npm ERR!\s*(.+?)(?=\n|$)/g;
  let match;
  const npmMessages: string[] = [];

  while ((match = npmPattern.exec(logs)) !== null) {
    const message = match[1].trim();
    if (message && !message.startsWith('A complete log')) {
      npmMessages.push(message);
    }
  }

  if (npmMessages.length > 0) {
    // Combine related npm errors into one
    const combinedMessage = npmMessages.slice(0, 5).join('; ');
    errors.push({
      id: generateErrorId(),
      type: 'npm',
      severity: 'error',
      message: combinedMessage,
      shortMessage: truncateMessage(npmMessages[0]),
      source: 'npm',
      rawError: npmMessages.join('\n'),
      timestamp,
    });
  }

  // ERESOLVE dependency errors
  if (/ERESOLVE/.test(logs)) {
    const eresolveMatch = logs.match(/ERESOLVE\s+(.+?)(?=\n|$)/);
    if (eresolveMatch) {
      errors.push({
        id: generateErrorId(),
        type: 'npm',
        severity: 'error',
        message: `Dependency conflict: ${eresolveMatch[1]}`,
        shortMessage: 'Dependency conflict',
        source: 'npm',
        rawError: eresolveMatch[0],
        timestamp,
      });
    }
  }

  return errors;
}

/**
 * Parse runtime/generic JavaScript errors
 * Format: Error: message
 *   at Object.<anonymous> (/path/file.ts:42:15)
 */
function parseRuntimeErrors(logs: string): ParsedBuildError[] {
  const errors: ParsedBuildError[] = [];
  const timestamp = Date.now();

  // SyntaxError, TypeError, ReferenceError with stack
  const errorTypes = ['SyntaxError', 'TypeError', 'ReferenceError', 'Error'];

  for (const errorType of errorTypes) {
    const pattern = new RegExp(`${errorType}:\\s*(.+?)(?:\\n\\s+at\\s+(?:\\S+\\s+)?\\(?([^\\s():]+):(\\d+):(\\d+)\\)?)?`, 'gi');
    let match;

    while ((match = pattern.exec(logs)) !== null) {
      const [rawError, message, file, line, col] = match;
      const contextStart = Math.max(0, match.index - 80);
      const contextEnd = Math.min(logs.length, match.index + rawError.length + 80);
      const context = logs.slice(contextStart, contextEnd);

      // Let the Vite parser own Vite/client overlay errors.
      if (/\[vite\]|\[?plugin:vite:/i.test(context)) {
        continue;
      }

      // Determine type from error name
      let type: ParsedBuildError['type'] = 'runtime';
      if (errorType === 'SyntaxError') type = 'syntax';
      else if (errorType === 'TypeError') type = 'type';
      else if (errorType === 'ReferenceError') type = 'reference';

      errors.push({
        id: generateErrorId(),
        type,
        severity: 'error',
        message: message.trim(),
        shortMessage: truncateMessage(message.trim()),
        filePath: file ? normalizeFilePath(file) : undefined,
        line: line ? parseInt(line, 10) : undefined,
        column: col ? parseInt(col, 10) : undefined,
        source: 'runtime',
        rawError,
        timestamp,
      });
    }
  }

  // Module not found errors
  const modulePattern = /(?:Cannot find module|Module not found)[:\s]*['"]?([^'">\s]+)['"]?/gi;
  let match;

  while ((match = modulePattern.exec(logs)) !== null) {
    const [rawError, moduleName] = match;
    // Try to extract file path from context
    const contextMatch = logs.substring(Math.max(0, match.index - 200), match.index + 200)
      .match(/(?:in|at)\s+([^\s:]+\.(tsx?|jsx?)):(\d+)/i);

    errors.push({
      id: generateErrorId(),
      type: 'module',
      severity: 'error',
      message: `Cannot find module '${moduleName}'`,
      shortMessage: `Missing: ${moduleName}`,
      filePath: contextMatch ? normalizeFilePath(contextMatch[1]) : undefined,
      line: contextMatch ? parseInt(contextMatch[3], 10) : undefined,
      source: 'runtime',
      rawError,
      timestamp,
    });
  }

  return errors;
}

/**
 * Parse all error types from logs
 * Returns deduplicated, structured errors for the frontend
 */
export function parseAllErrors(logs: string): ParsedBuildError[] {
  const allErrors: ParsedBuildError[] = [
    ...parseTypeScriptErrors(logs),
    ...parseViteErrors(logs),
    ...parseESLintErrors(logs),
    ...parseNpmErrors(logs),
    ...parseRuntimeErrors(logs),
  ];

  // Deduplicate by file:line:message hash
  const seen = new Set<string>();
  const deduplicated: ParsedBuildError[] = [];

  for (const error of allErrors) {
    const key = `${error.filePath || ''}:${error.line || ''}:${error.shortMessage}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(error);
    }
  }

  // Sort by severity (errors first) then by file path
  deduplicated.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1;
    }
    return (a.filePath || '').localeCompare(b.filePath || '');
  });

  return deduplicated;
}

/**
 * Check if logs contain blocking errors (errors that prevent dev server from running)
 */
export function hasBlockingErrors(logs: string): boolean {
  const blockingPatterns = [
    /SyntaxError:/i,
    /TypeError:/i,
    /ReferenceError:/i,
    /Module not found/i,
    /Cannot find module/i,
    /Build failed/i,
    /Compilation failed/i,
    /error TS\d+:/i,
    /npm ERR!/i,
    /ERESOLVE/i,
    /\[vite\].*Error/i,
    /^\[?plugin:vite:/im,
    /Failed to resolve import/i,
    /X\s*\[ERROR\]/i,
  ];

  return blockingPatterns.some(pattern => pattern.test(logs));
}
