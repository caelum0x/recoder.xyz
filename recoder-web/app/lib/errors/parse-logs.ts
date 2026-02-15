/**
 * Parse build errors from dev server logs
 * No polling - parses errors from existing log stream
 */

import type { BuildError } from '~/lib/stores/errors';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ParseLogs');

// Error patterns for different tools
const ERROR_PATTERNS = [
  // TypeScript: src/App.tsx(15,3): error TS2345: message
  {
    regex: /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/gm,
    parse: (match: RegExpMatchArray): BuildError => ({
      id: `ts-${match[5]}-${Date.now()}`,
      type: 'type',
      severity: match[4] as 'error' | 'warning',
      message: match[6],
      shortMessage: match[6].split('\n')[0],
      filePath: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      source: 'typescript',
      rawError: match[0],
      timestamp: Date.now(),
    }),
  },
  
  // Vite: [vite] Error at /path/file.ts:15:3
  {
    regex: /\[vite\]\s+(Error|Warning)\s+at\s+(.+?):(\d+):(\d+)/gm,
    parse: (match: RegExpMatchArray): BuildError => ({
      id: `vite-${Date.now()}`,
      type: 'build',
      severity: match[1].toLowerCase() as 'error' | 'warning',
      message: match[0],
      shortMessage: match[0],
      filePath: match[2],
      line: parseInt(match[3]),
      column: parseInt(match[4]),
      source: 'vite',
      rawError: match[0],
      timestamp: Date.now(),
    }),
  },
  
  // ESLint: 15:3  error  message  rule-name
  {
    regex: /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([a-z-]+)$/gm,
    parse: (match: RegExpMatchArray): BuildError => ({
      id: `eslint-${match[5]}-${Date.now()}`,
      type: 'syntax',
      severity: match[3] as 'error' | 'warning',
      message: match[4],
      shortMessage: match[4],
      line: parseInt(match[1]),
      column: parseInt(match[2]),
      source: 'eslint',
      rawError: match[0],
      timestamp: Date.now(),
    }),
  },
  
  // Generic SyntaxError
  {
    regex: /SyntaxError:\s+(.+)/gm,
    parse: (match: RegExpMatchArray): BuildError => ({
      id: `syntax-${Date.now()}`,
      type: 'syntax',
      severity: 'error',
      message: match[1],
      shortMessage: match[1],
      source: 'runtime',
      rawError: match[0],
      timestamp: Date.now(),
    }),
  },
];

/**
 * Parse errors from dev server logs
 */
export function parseErrorsFromLogs(logs: string): BuildError[] {
  const errors: BuildError[] = [];
  
  for (const pattern of ERROR_PATTERNS) {
    const matches = logs.matchAll(pattern.regex);
    for (const match of matches) {
      try {
        errors.push(pattern.parse(match));
      } catch (e) {
        logger.warn('Failed to parse error:', match[0]);
      }
    }
  }
  
  return errors;
}
