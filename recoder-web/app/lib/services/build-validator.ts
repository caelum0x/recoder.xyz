/**
 * Build Validator with Smart Error Recovery
 *
 * Inspired by open-lovable's build-validator.ts
 *
 * Features:
 * - Error classification for targeted recovery
 * - Smart retry delays based on error type
 * - Package detection from import statements
 * - Automatic recovery actions (install packages, restart dev server)
 * - Integration with Preview panel for error display
 */

import { dockerPost } from './docker-api';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('BuildValidator');

// ============================================
// Types
// ============================================

export interface BuildValidation {
  success: boolean;
  errors: string[];
  isRendering: boolean;
  warnings?: string[];
  errorType?: ErrorType;
  recoveryAction?: RecoveryAction;
}

export type ErrorType =
  | 'missing-package'
  | 'syntax-error'
  | 'vite-error'
  | 'not-rendered'
  | 'sandbox-timeout'
  | 'network-error'
  | 'unknown';

export interface RecoveryAction {
  type: 'install-package' | 'restart-server' | 'wait' | 'fix-code' | 'increase-timeout' | 'none';
  packages?: string[];
  waitTime?: number;
  description: string;
  autoApply?: boolean;
}

export interface BuildError {
  type: ErrorType;
  message: string;
  packages?: string[];
  filePath?: string;
  line?: number;
  column?: number;
  recoveryAction?: RecoveryAction;
}

// ============================================
// Error Detection Patterns
// ============================================

const ERROR_PATTERNS = {
  // Missing package patterns
  missingPackage: [
    /Failed to resolve import ["']([^"']+)["']/,
    /Cannot find module ["']([^"']+)["']/,
    /Module not found: Error: Can't resolve ["']([^"']+)["']/,
    /Package ["']([^"']+)["'] not found/,
    /error: Could not resolve ["']([^"']+)["']/,
    /Cannot resolve module ["']([^"']+)["']/,
    /Module build failed.*Cannot find package ["']([^"']+)["']/,
  ],

  // Syntax error patterns
  syntaxError: [
    /SyntaxError: (.+)/,
    /Unexpected token (.+)/,
    /Parsing error: (.+)/,
    /error: Expected (.+)/,
    /Parse error on line (\d+)/,
    /Unterminated (.+)/,
    /Missing semicolon/,
    /Invalid or unexpected token/,
  ],

  // Vite-specific error patterns
  viteError: [
    /\[vite\] (.+)/,
    /Vite error: (.+)/,
    /Pre-transform error: (.+)/,
    /Transform failed (.+)/,
    /vite-error-overlay/,
    /HMR error: (.+)/,
  ],

  // Timeout patterns
  timeout: [
    /timeout/i,
    /not responding/i,
    /timed out/i,
    /ETIMEDOUT/,
    /ESOCKETTIMEDOUT/,
  ],

  // Network error patterns
  networkError: [
    /ECONNREFUSED/,
    /ENOTFOUND/,
    /network error/i,
    /connection refused/i,
    /fetch failed/i,
  ],
};

// ============================================
// Error Classification
// ============================================

/**
 * Classifies an error message to determine the appropriate recovery strategy
 */
export function classifyError(error: string | Error | unknown): ErrorType {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Check for missing package errors
  for (const pattern of ERROR_PATTERNS.missingPackage) {
    if (pattern.test(message)) {
      return 'missing-package';
    }
  }

  // Check for syntax errors
  for (const pattern of ERROR_PATTERNS.syntaxError) {
    if (pattern.test(message)) {
      return 'syntax-error';
    }
  }

  // Check for Vite errors
  for (const pattern of ERROR_PATTERNS.viteError) {
    if (pattern.test(message)) {
      return 'vite-error';
    }
  }

  // Check for timeout errors
  for (const pattern of ERROR_PATTERNS.timeout) {
    if (pattern.test(message)) {
      return 'sandbox-timeout';
    }
  }

  // Check for network errors
  for (const pattern of ERROR_PATTERNS.networkError) {
    if (pattern.test(message)) {
      return 'network-error';
    }
  }

  // Check for not-rendered state
  if (message.includes('not rendered') ||
      message.includes('sandbox ready') ||
      message.includes('default page') ||
      message.includes('vite + react') ||
      message.includes('start building')) {
    return 'not-rendered';
  }

  return 'unknown';
}

// ============================================
// Package Extraction
// ============================================

/**
 * Extracts missing package names from error messages
 */
export function extractMissingPackages(error: string | Error | unknown): string[] {
  const message = error instanceof Error ? error.message : String(error);
  const packages = new Set<string>();

  for (const pattern of ERROR_PATTERNS.missingPackage) {
    const regex = new RegExp(pattern, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(message)) !== null) {
      const packagePath = match[1];
      if (packagePath) {
        // Extract the actual package name
        const packageName = normalizePackageName(packagePath);
        if (packageName && !packageName.startsWith('.') && !packageName.startsWith('/')) {
          packages.add(packageName);
        }
      }
    }
  }

  return Array.from(packages);
}

/**
 * Normalizes a package path to extract the actual package name
 * Handles scoped packages (@org/package) and subpath imports
 */
function normalizePackageName(importPath: string): string {
  // Handle scoped packages (@org/package)
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }

  // Handle regular packages (may have subpaths like 'package/dist/file')
  const parts = importPath.split('/');
  return parts[0];
}

/**
 * Extracts packages from import statements in code
 */
export function extractImportsFromCode(code: string): string[] {
  const packages = new Set<string>();

  // Match ES6 imports
  const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      packages.add(normalizePackageName(importPath));
    }
  }

  // Match require statements
  const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = requireRegex.exec(code)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      packages.add(normalizePackageName(importPath));
    }
  }

  return Array.from(packages);
}

// ============================================
// Retry Delay Calculation
// ============================================

/**
 * Calculates the appropriate retry delay based on error type and attempt number
 */
export function calculateRetryDelay(attempt: number, errorType: ErrorType): number {
  const baseDelay = 2000; // 2 seconds

  switch (errorType) {
    case 'missing-package':
      // Packages need time to install (npm install can take a while)
      return baseDelay * 3 * attempt; // 6s, 12s, 18s

    case 'not-rendered':
      // Vite needs time to compile and HMR to update
      return baseDelay * 2 * attempt; // 4s, 8s, 12s

    case 'vite-error':
      // Vite restart or recompilation needed
      return baseDelay * 2 * attempt; // 4s, 8s, 12s

    case 'syntax-error':
      // Code fix needed - shorter delay since fix should be quick
      return baseDelay * attempt; // 2s, 4s, 6s

    case 'sandbox-timeout':
      // Sandbox might be slow - longer delays
      return baseDelay * 4 * attempt; // 8s, 16s, 24s

    case 'network-error':
      // Network issues - moderate delays with some randomness
      return baseDelay * 2 * attempt + Math.random() * 1000;

    default:
      // Standard exponential backoff
      return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
  }
}

// ============================================
// Recovery Actions
// ============================================

/**
 * Determines the appropriate recovery action for an error
 */
export function getRecoveryAction(errorType: ErrorType, context?: { packages?: string[] }): RecoveryAction {
  switch (errorType) {
    case 'missing-package':
      return {
        type: 'install-package',
        packages: context?.packages || [],
        description: context?.packages?.length
          ? `Install missing package${context.packages.length > 1 ? 's' : ''}: ${context.packages.join(', ')}`
          : 'Install missing packages',
        autoApply: true,
      };

    case 'syntax-error':
      return {
        type: 'fix-code',
        description: 'Code fix needed - syntax error detected',
        autoApply: false,
      };

    case 'vite-error':
      return {
        type: 'restart-server',
        description: 'Restart the development server',
        autoApply: true,
      };

    case 'not-rendered':
      return {
        type: 'wait',
        waitTime: 5000,
        description: 'Waiting for compilation to complete',
        autoApply: true,
      };

    case 'sandbox-timeout':
      return {
        type: 'increase-timeout',
        waitTime: 10000,
        description: 'Increase timeout and retry',
        autoApply: true,
      };

    case 'network-error':
      return {
        type: 'wait',
        waitTime: 3000,
        description: 'Network issue detected - retrying connection',
        autoApply: true,
      };

    default:
      return {
        type: 'none',
        description: 'Unknown error - manual investigation needed',
        autoApply: false,
      };
  }
}

// ============================================
// Build Validation
// ============================================

/**
 * Validates the build by checking the preview URL
 */
export async function validateBuild(
  previewUrl: string,
  options: {
    timeout?: number;
    waitBeforeCheck?: number;
  } = {}
): Promise<BuildValidation> {
  const { timeout = 10000, waitBeforeCheck = 2000 } = options;

  try {
    // Wait for Vite to process files
    if (waitBeforeCheck > 0) {
      await new Promise(resolve => setTimeout(resolve, waitBeforeCheck));
    }

    // Fetch the preview page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(previewUrl, {
        headers: {
          'User-Agent': 'Recoder-BuildValidator',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorType = response.status === 503 ? 'not-rendered' : 'unknown';
      return {
        success: false,
        errors: [`Preview returned ${response.status}: ${response.statusText}`],
        isRendering: false,
        errorType,
        recoveryAction: getRecoveryAction(errorType),
      };
    }

    const html = await response.text();

    // Check for default/placeholder page
    const isDefaultPage =
      html.includes('Vercel Sandbox Ready') ||
      html.includes('Start building your React app with Vite') ||
      html.includes('Vite + React') ||
      (!html.includes('id="root"') && !html.includes('id="app"'));

    if (isDefaultPage) {
      return {
        success: false,
        errors: ['Preview showing default page, app not rendered yet'],
        isRendering: false,
        errorType: 'not-rendered',
        recoveryAction: getRecoveryAction('not-rendered'),
      };
    }

    // Check for Vite error overlay
    if (html.includes('vite-error-overlay')) {
      // Try to extract the error message
      const importMatch = html.match(/Failed to resolve import ["']([^"']+)["']/);
      const errorMatch = html.match(/"message":"([^"]+)"/);

      if (importMatch) {
        const packages = [normalizePackageName(importMatch[1])];
        return {
          success: false,
          errors: [`Missing package: ${packages[0]}`],
          isRendering: false,
          errorType: 'missing-package',
          recoveryAction: getRecoveryAction('missing-package', { packages }),
        };
      }

      if (errorMatch) {
        const errorType = classifyError(errorMatch[1]);
        return {
          success: false,
          errors: [errorMatch[1]],
          isRendering: false,
          errorType,
          recoveryAction: getRecoveryAction(errorType),
        };
      }

      return {
        success: false,
        errors: ['Vite compilation error detected'],
        isRendering: false,
        errorType: 'vite-error',
        recoveryAction: getRecoveryAction('vite-error'),
      };
    }

    // Check for runtime errors in the HTML
    const runtimeErrorMatch = html.match(/Error:\s*([^\n<]+)/);
    if (runtimeErrorMatch) {
      const errorType = classifyError(runtimeErrorMatch[1]);
      const packages = errorType === 'missing-package'
        ? extractMissingPackages(runtimeErrorMatch[1])
        : undefined;

      return {
        success: false,
        errors: [runtimeErrorMatch[1]],
        isRendering: true, // App is rendering but has errors
        errorType,
        recoveryAction: getRecoveryAction(errorType, { packages }),
      };
    }

    // Success - app is rendering
    return {
      success: true,
      errors: [],
      isRendering: true,
    };

  } catch (error) {
    // Handle fetch errors
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        success: false,
        errors: ['Build validation timed out'],
        isRendering: false,
        errorType: 'sandbox-timeout',
        recoveryAction: getRecoveryAction('sandbox-timeout'),
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = classifyError(errorMessage);

    return {
      success: false,
      errors: [errorMessage],
      isRendering: false,
      errorType,
      recoveryAction: getRecoveryAction(errorType),
    };
  }
}

// ============================================
// Auto-Fix Functions
// ============================================

/**
 * Attempts to automatically install missing packages
 */
export async function autoInstallPackages(
  projectId: string,
  packages: string[]
): Promise<{ success: boolean; error?: string }> {
  if (packages.length === 0) {
    return { success: true };
  }

  try {
    const packageList = packages.join(' ');
    logger.info(`[BuildValidator] Auto-installing packages: ${packageList}`);

    // Execute npm/bun install in the container
    const response = await dockerPost<{ success: boolean; output?: string; error?: string }>(
      `/api/shell/${projectId}`,
      {
        command: `bun add ${packageList} || npm install ${packageList}`,
        timeout: 60000, // 60 second timeout for installation
      }
    );

    if (response.success) {
      logger.info(`[BuildValidator] Successfully installed packages: ${packageList}`);
      return { success: true };
    }

    return {
      success: false,
      error: response.error || 'Package installation failed',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[BuildValidator] Failed to install packages:`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Attempts to restart the dev server
 */
export async function restartDevServer(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info(`[BuildValidator] Restarting dev server for project: ${projectId}`);

    // First, kill any existing dev process
    await dockerPost(`/api/shell/${projectId}`, {
      command: 'pkill -f "vite" || pkill -f "next" || true',
      timeout: 5000,
    }).catch(() => {}); // Ignore errors if no process to kill

    // Wait a moment for the process to terminate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restart the dev server (run in background)
    const response = await dockerPost<{ success: boolean; error?: string }>(
      `/api/shell/${projectId}`,
      {
        command: 'npm run dev &',
        timeout: 10000,
        background: true,
      }
    );

    if (response.success) {
      logger.info(`[BuildValidator] Dev server restart initiated`);
      return { success: true };
    }

    return {
      success: false,
      error: response.error || 'Failed to restart dev server',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[BuildValidator] Failed to restart dev server:`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Applies the recommended recovery action
 */
export async function applyRecoveryAction(
  projectId: string,
  action: RecoveryAction
): Promise<{ success: boolean; error?: string }> {
  logger.info(`[BuildValidator] Applying recovery action: ${action.type}`);

  switch (action.type) {
    case 'install-package':
      if (action.packages && action.packages.length > 0) {
        return autoInstallPackages(projectId, action.packages);
      }
      return { success: false, error: 'No packages specified' };

    case 'restart-server':
      return restartDevServer(projectId);

    case 'wait':
      await new Promise(resolve => setTimeout(resolve, action.waitTime || 5000));
      return { success: true };

    case 'increase-timeout':
      // This is handled by the caller increasing their timeout
      return { success: true };

    case 'fix-code':
    case 'none':
      return { success: false, error: 'Manual intervention required' };

    default:
      return { success: false, error: 'Unknown recovery action' };
  }
}

// ============================================
// Build Validation with Auto-Recovery
// ============================================

export interface ValidationWithRecoveryOptions {
  maxRetries?: number;
  autoFix?: boolean;
  onRetry?: (attempt: number, errorType: ErrorType, action: RecoveryAction) => void;
  onError?: (error: BuildValidation) => void;
  onSuccess?: () => void;
}

/**
 * Validates the build with automatic recovery attempts
 */
export async function validateBuildWithRecovery(
  previewUrl: string,
  projectId: string,
  options: ValidationWithRecoveryOptions = {}
): Promise<BuildValidation> {
  const {
    maxRetries = 3,
    autoFix = true,
    onRetry,
    onError,
    onSuccess,
  } = options;

  let lastValidation: BuildValidation | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    // Validate the build
    const validation = await validateBuild(previewUrl, {
      waitBeforeCheck: attempt === 1 ? 3000 : 1000,
    });

    lastValidation = validation;

    if (validation.success) {
      onSuccess?.();
      return validation;
    }

    // If we've exhausted retries, return the error
    if (attempt > maxRetries) {
      onError?.(validation);
      return validation;
    }

    // Get recovery action
    const action = validation.recoveryAction || getRecoveryAction(validation.errorType || 'unknown');

    // Notify about retry
    onRetry?.(attempt, validation.errorType || 'unknown', action);

    // Apply auto-fix if enabled and action can be auto-applied
    if (autoFix && action.autoApply) {
      const result = await applyRecoveryAction(projectId, action);
      if (!result.success) {
        logger.warn(`[BuildValidator] Recovery action failed:`, result.error);
      }
    }

    // Wait before next attempt
    const delay = calculateRetryDelay(attempt, validation.errorType || 'unknown');
    logger.info(`[BuildValidator] Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries + 1}`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // This should never be reached, but TypeScript needs it
  return lastValidation || {
    success: false,
    errors: ['Validation failed'],
    isRendering: false,
    errorType: 'unknown',
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parses build output for errors
 */
export function parseBuildOutput(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Check for missing package errors
    for (const pattern of ERROR_PATTERNS.missingPackage) {
      const match = line.match(pattern);
      if (match) {
        const packages = [normalizePackageName(match[1])];
        errors.push({
          type: 'missing-package',
          message: line,
          packages,
          recoveryAction: getRecoveryAction('missing-package', { packages }),
        });
        break;
      }
    }

    // Check for syntax errors
    for (const pattern of ERROR_PATTERNS.syntaxError) {
      if (pattern.test(line)) {
        // Try to extract file path and line number
        const fileMatch = line.match(/([^\s]+\.[tj]sx?):(\d+)(?::(\d+))?/);
        errors.push({
          type: 'syntax-error',
          message: line,
          filePath: fileMatch?.[1],
          line: fileMatch?.[2] ? parseInt(fileMatch[2], 10) : undefined,
          column: fileMatch?.[3] ? parseInt(fileMatch[3], 10) : undefined,
          recoveryAction: getRecoveryAction('syntax-error'),
        });
        break;
      }
    }

    // Check for Vite errors
    for (const pattern of ERROR_PATTERNS.viteError) {
      if (pattern.test(line)) {
        errors.push({
          type: 'vite-error',
          message: line,
          recoveryAction: getRecoveryAction('vite-error'),
        });
        break;
      }
    }
  }

  return errors;
}

/**
 * Formats a build error for display
 */
export function formatBuildError(error: BuildError): string {
  let message = error.message;

  if (error.filePath) {
    message = `${error.filePath}`;
    if (error.line) {
      message += `:${error.line}`;
      if (error.column) {
        message += `:${error.column}`;
      }
    }
    message += ` - ${error.message}`;
  }

  if (error.recoveryAction) {
    message += `\n  Suggested fix: ${error.recoveryAction.description}`;
  }

  return message;
}

/**
 * Gets a user-friendly description of an error type
 */
export function getErrorTypeDescription(errorType: ErrorType): string {
  switch (errorType) {
    case 'missing-package':
      return 'Missing npm package';
    case 'syntax-error':
      return 'Code syntax error';
    case 'vite-error':
      return 'Vite build error';
    case 'not-rendered':
      return 'App not rendered yet';
    case 'sandbox-timeout':
      return 'Server timeout';
    case 'network-error':
      return 'Network connection error';
    default:
      return 'Unknown error';
  }
}
