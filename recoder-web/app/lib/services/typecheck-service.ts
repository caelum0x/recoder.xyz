/**
 * TypeScript Type Checking Service
 * 
 * Runs TypeScript type checking inside the Docker container and returns
 * structured errors. This provides more reliable error detection than
 * parsing dev server logs, inspired by dyad's tsc worker approach.
 * 
 * Usage:
 *   const result = await runTypeCheck(projectId);
 *   if (!result.success) {
 *     // Handle errors
 *   }
 */

import { dockerPost } from './docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TypeCheck');

export interface TypeCheckError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface TypeCheckResult {
  success: boolean;
  errors: TypeCheckError[];
  errorCount: number;
  warningCount: number;
  duration: number;
  message?: string;
  error?: string;
}

/**
 * Run TypeScript type checking in the container
 * Returns structured errors that can be used for auto-fix
 */
export async function runTypeCheck(projectId: string): Promise<TypeCheckResult> {
  try {
    logger.info(`Running type check for ${projectId}`);
    
    const result = await dockerPost<TypeCheckResult>(
      `/api/typecheck/${projectId}`,
      {},
      { timeout: 30000, skipRetry: true }
    );
    
    if (result.errorCount > 0) {
      logger.warn(`Type check found ${result.errorCount} errors, ${result.warningCount} warnings`);
    } else {
      logger.info(`Type check passed in ${result.duration}ms`);
    }
    
    return result;
  } catch (err: any) {
    logger.error('Type check failed:', err);
    return {
      success: false,
      errors: [],
      errorCount: 0,
      warningCount: 0,
      duration: 0,
      error: err.message || 'Type check failed',
    };
  }
}

/**
 * Format type check errors for display or AI context
 */
export function formatTypeCheckErrors(errors: TypeCheckError[]): string {
  if (errors.length === 0) return 'No type errors found.';
  
  return errors
    .map((e) => `${e.file}:${e.line}:${e.column} - ${e.severity} ${e.code}: ${e.message}`)
    .join('\n');
}

/**
 * Group errors by file for targeted fixing
 */
export function groupErrorsByFile(errors: TypeCheckError[]): Map<string, TypeCheckError[]> {
  const grouped = new Map<string, TypeCheckError[]>();
  
  for (const error of errors) {
    const existing = grouped.get(error.file) || [];
    existing.push(error);
    grouped.set(error.file, existing);
  }
  
  return grouped;
}

/**
 * Get the most critical errors (for prioritized fixing)
 * Prioritizes errors over warnings, and files with multiple errors
 */
export function getPrioritizedErrors(errors: TypeCheckError[], limit = 5): TypeCheckError[] {
  // Sort: errors first, then by file (to group related errors)
  const sorted = [...errors].sort((a, b) => {
    // Errors before warnings
    if (a.severity === 'error' && b.severity !== 'error') return -1;
    if (a.severity !== 'error' && b.severity === 'error') return 1;
    // Then by file
    return a.file.localeCompare(b.file);
  });
  
  return sorted.slice(0, limit);
}

/**
 * Check if errors are blocking (would prevent the app from running)
 */
export function hasBlockingErrors(errors: TypeCheckError[]): boolean {
  return errors.some((e) => e.severity === 'error');
}

/**
 * Generate context for AI auto-fix
 * Returns a prompt-friendly description of the errors
 */
export function generateAutoFixContext(errors: TypeCheckError[]): string {
  if (errors.length === 0) return '';
  
  const grouped = groupErrorsByFile(errors);
  const parts: string[] = ['The following TypeScript errors need to be fixed:\n'];
  
  for (const [file, fileErrors] of grouped) {
    parts.push(`\n## ${file}`);
    for (const error of fileErrors) {
      parts.push(`- Line ${error.line}: ${error.code} - ${error.message}`);
    }
  }
  
  return parts.join('\n');
}
