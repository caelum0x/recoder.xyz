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
  cooldownMs: number;
}

class AutoRestoreManager {
  private errorCounts = new Map<string, number>();
  private lastRestore = new Map<string, number>();
  private config: AutoRestoreConfig = {
    enabled: true,
    maxRetries: 3,
    cooldownMs: 60000, // 1 minute cooldown
  };

  /**
   * Analyze logs for critical errors
   */
  detectErrors(logs: string): { hasError: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const { pattern, severity, description } of ERROR_PATTERNS) {
      if (severity === 'critical' && pattern.test(logs)) {
        errors.push(description);
      }
    }
    
    return {
      hasError: errors.length > 0,
      errors,
    };
  }

  /**
   * Check if auto-restore should trigger
   */
  shouldRestore(projectId: string): boolean {
    if (!this.config.enabled) return false;
    
    const errorCount = this.errorCounts.get(projectId) || 0;
    if (errorCount >= this.config.maxRetries) {
      console.log(`[AutoRestore] Max retries reached for ${projectId}`);
      return false;
    }
    
    const lastRestore = this.lastRestore.get(projectId) || 0;
    const now = Date.now();
    if (now - lastRestore < this.config.cooldownMs) {
      console.log(`[AutoRestore] Cooldown active for ${projectId}`);
      return false;
    }
    
    return true;
  }

  /**
   * Attempt auto-restore
   */
  async attemptRestore(
    containerId: string,
    projectId: string
  ): Promise<{ success: boolean; restoredTo?: string; error?: string }> {
    try {
      if (!this.shouldRestore(projectId)) {
        return { success: false, error: 'Restore not allowed (cooldown or max retries)' };
      }

      // Get snapshots
      const snapshots = await snapshotManager.listSnapshots(containerId, 10);
      
      // Find last snapshot before AI changes (marked as 'user' or 'auto')
      const lastWorking = snapshots.find(s => s.author === 'user' || s.author === 'auto');
      
      if (!lastWorking) {
        return { success: false, error: 'No working snapshot found' };
      }

      console.log(`[AutoRestore] Restoring ${projectId} to ${lastWorking.id}`);
      
      // Restore
      await snapshotManager.restoreSnapshot(containerId, projectId, lastWorking.id);
      
      // Update tracking
      const errorCount = (this.errorCounts.get(projectId) || 0) + 1;
      this.errorCounts.set(projectId, errorCount);
      this.lastRestore.set(projectId, Date.now());
      
      return { success: true, restoredTo: lastWorking.id };
    } catch (error: any) {
      console.error(`[AutoRestore] Failed for ${projectId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset error count (call when build succeeds)
   */
  resetErrors(projectId: string): void {
    this.errorCounts.delete(projectId);
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
  // Remove /workspace prefix for cleaner display, but keep it for matching
  return filePath.startsWith('/workspace/') ? filePath : `/workspace/${filePath.replace(/^\.\//, '')}`;
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

  // Vite error with stack trace
  const vitePattern = /\[vite\]\s*(?:Internal server error|Error):\s*(.+?)(?:\n\s+at\s+(?:\S+\s+)?\(?([^\s():]+):(\d+):(\d+)\)?)?/gi;
  let match;

  while ((match = vitePattern.exec(logs)) !== null) {
    const [rawError, message, file, line, col] = match;
    errors.push({
      id: generateErrorId(),
      type: message.toLowerCase().includes('syntax') ? 'syntax' : 'build',
      severity: 'error',
      message: message.trim(),
      shortMessage: truncateMessage(message.trim()),
      filePath: file ? normalizeFilePath(file) : undefined,
      line: line ? parseInt(line, 10) : undefined,
      column: col ? parseInt(col, 10) : undefined,
      source: 'vite',
      rawError,
      timestamp,
    });
  }

  // esbuild style errors: X [ERROR] message
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
    /X\s*\[ERROR\]/i,
  ];

  return blockingPatterns.some(pattern => pattern.test(logs));
}
