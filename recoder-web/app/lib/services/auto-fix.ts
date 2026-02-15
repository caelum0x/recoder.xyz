/**
 * Auto-fix service for AI-assisted error resolution
 * Features:
 * - Automatic error detection from terminal output and diagnostics
 * - File reading before attempting fixes
 * - Dependency check logic
 * - Confirmation before applying fixes
 * - Rollback capability if fix fails
 */

import type { BuildError } from '~/lib/stores/errors';
import { dockerGet, dockerPost } from './docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AutoFix');

// ============================================
// Types
// ============================================

export interface AutoFixOptions {
  /** Whether to require confirmation before applying fixes */
  requireConfirmation?: boolean;
  /** Whether to automatically read files before fixing */
  autoReadFiles?: boolean;
  /** Whether to check package.json for missing dependencies */
  checkDependencies?: boolean;
  /** Maximum number of files to read automatically */
  maxFilesToRead?: number;
}

export interface AutoFixState {
  /** Whether a fix is currently in progress */
  isFixing: boolean;
  /** Number of fix attempts */
  attempts: number;
  /** Last error that was attempted to fix */
  lastError?: BuildError;
  /** Snapshot ID before fix (for rollback) */
  snapshotId?: string;
}

export interface TerminalErrorPattern {
  /** Regex pattern to match error */
  pattern: RegExp;
  /** Error type */
  type: BuildError['type'];
  /** Error severity */
  severity: BuildError['severity'];
  /** Function to extract file path from match */
  extractFilePath?: (match: RegExpMatchArray) => string | undefined;
  /** Function to extract line number from match */
  extractLine?: (match: RegExpMatchArray) => number | undefined;
  /** Function to extract message from match */
  extractMessage?: (match: RegExpMatchArray) => string;
}

// ============================================
// Terminal Error Detection Patterns
// ============================================

const TERMINAL_ERROR_PATTERNS: TerminalErrorPattern[] = [
  // TypeScript errors: "src/file.ts(10,5): error TS2304: Cannot find name 'foo'"
  {
    pattern: /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/,
    type: 'type',
    severity: 'error',
    extractFilePath: (match) => match[1],
    extractLine: (match) => parseInt(match[2], 10),
    extractMessage: (match) => `${match[4]}: ${match[5]}`,
  },
  // Vite/Rollup errors: "✘ [ERROR] Could not resolve 'module-name'"
  {
    pattern: /✘ \[ERROR\] (.+)/,
    type: 'module',
    severity: 'error',
    extractMessage: (match) => match[1],
  },
  // ESLint errors: "src/file.ts:10:5: 'foo' is not defined [no-undef]"
  {
    pattern: /(.+?):(\d+):(\d+): (.+?) \[(.+?)\]/,
    type: 'syntax',
    severity: 'error',
    extractFilePath: (match) => match[1],
    extractLine: (match) => parseInt(match[2], 10),
    extractMessage: (match) => `${match[4]} [${match[5]}]`,
  },
  // npm errors: "npm ERR! Cannot find module 'module-name'"
  {
    pattern: /npm ERR! (.+)/,
    type: 'npm',
    severity: 'error',
    extractMessage: (match) => match[1],
  },
  // Runtime errors: "Error: Cannot find module 'module-name'"
  {
    pattern: /Error: (.+)/,
    type: 'runtime',
    severity: 'error',
    extractMessage: (match) => match[1],
  },
  // Module not found: "Cannot find module 'module-name'"
  {
    pattern: /Cannot find module ['"](.+?)['"]/,
    type: 'module',
    severity: 'error',
    extractMessage: (match) => `Cannot find module '${match[1]}'`,
  },

  // ========================================
  // React Native / Metro bundler errors
  // ========================================

  // Metro bundler error format: "error: /path/to/file: Error message"
  {
    pattern: /error: (.+?):\s*(.+)/,
    type: 'build' as const,
    severity: 'error' as const,
    extractFilePath: (match: RegExpMatchArray) => match[1],
    extractMessage: (match: RegExpMatchArray) => match[2],
  },
  // Metro unable to resolve module: "Unable to resolve module 'foo' from '/path/to/file'"
  {
    pattern: /Unable to resolve module ['"]([^'"]+)['"] from ['"]([^'"]+)['"]/,
    type: 'module' as const,
    severity: 'error' as const,
    extractFilePath: (match: RegExpMatchArray) => match[2],
    extractMessage: (match: RegExpMatchArray) => `Unable to resolve module '${match[1]}'`,
  },
  // Expo app.json config error
  {
    pattern: /Error: .* in app\.json/,
    type: 'build' as const,
    severity: 'error' as const,
    extractMessage: (match: RegExpMatchArray) => match[0],
  },
  // Metro/Watchman file watcher errors
  {
    pattern: /Watchman.*error|EMFILE.*too many open files/i,
    type: 'build' as const,
    severity: 'error' as const,
    extractMessage: (match: RegExpMatchArray) => match[0],
  },
];

// ============================================
// Terminal Error Detection
// ============================================

/**
 * Parse terminal output for errors
 */
export function parseTerminalErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');
  let errorId = Date.now();

  for (const line of lines) {
    for (const pattern of TERMINAL_ERROR_PATTERNS) {
      const match = line.match(pattern.pattern);
      if (match) {
        const error: BuildError = {
          id: `terminal-${errorId++}`,
          type: pattern.type,
          severity: pattern.severity,
          message: pattern.extractMessage ? pattern.extractMessage(match) : match[0],
          shortMessage: pattern.extractMessage ? pattern.extractMessage(match).slice(0, 100) : match[0].slice(0, 100),
          filePath: pattern.extractFilePath ? pattern.extractFilePath(match) : undefined,
          line: pattern.extractLine ? pattern.extractLine(match) : undefined,
          source: 'runtime',
          rawError: line,
          timestamp: Date.now(),
        };
        errors.push(error);
        break; // Only match first pattern per line
      }
    }
  }

  return errors;
}

/**
 * Extract missing dependencies from errors
 */
export function extractMissingDependencies(errors: BuildError[]): string[] {
  const dependencies = new Set<string>();

  for (const error of errors) {
    // Match "Cannot find module 'foo'" or similar patterns
    const moduleMatch = error.message.match(/Cannot find module ['"](.+?)['"]/);
    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      // Filter out relative imports (starting with . or /)
      if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
        // Extract package name (handle scoped packages)
        const pkgName = moduleName.startsWith('@')
          ? moduleName.split('/').slice(0, 2).join('/')
          : moduleName.split('/')[0];
        dependencies.add(pkgName);
      }
    }
  }

  return Array.from(dependencies);
}

/**
 * Check package.json for missing dependencies
 */
export async function checkMissingDependencies(
  projectId: string,
  requiredDeps: string[]
): Promise<string[]> {
  try {
    const pkgJson = await dockerGet<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
      `/api/file/${projectId}/content?path=package.json`
    );

    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };

    return requiredDeps.filter(dep => !allDeps[dep]);
  } catch (error) {
    logger.warn('[AutoFix] Failed to check package.json:', error);
    return requiredDeps; // Assume all are missing if we can't read package.json
  }
}

/**
 * Read file contents for error context
 */
export async function readFileForError(
  projectId: string,
  filePath: string
): Promise<string | null> {
  try {
    const content = await dockerGet<string>(
      `/api/file/${projectId}/content?path=${encodeURIComponent(filePath)}`
    );
    return content;
  } catch (error) {
    logger.warn(`[AutoFix] Failed to read file ${filePath}:`, error);
    return null;
  }
}

/**
 * Create a snapshot before applying fixes
 */
export async function createFixSnapshot(projectId: string): Promise<string | null> {
  try {
    const response = await dockerPost<{ snapshotId: string }>(
      `/api/snapshot/${projectId}`,
      { description: 'Auto-fix: Before applying AI fixes' }
    );
    return response.snapshotId;
  } catch (error) {
    logger.warn('[AutoFix] Failed to create snapshot:', error);
    return null;
  }
}

/**
 * Rollback to a snapshot
 */
export async function rollbackToSnapshot(
  projectId: string,
  snapshotId: string
): Promise<boolean> {
  try {
    await dockerPost(`/api/snapshot/${projectId}/restore`, { snapshotId });
    return true;
  } catch (error) {
    logger.error('[AutoFix] Failed to rollback:', error);
    return false;
  }
}

// ============================================
// Error Formatting (existing functions)
// ============================================

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
 * Format all errors into a prompt for AI with enhanced context
 */
export function formatErrorsForAI(
  errors: BuildError[],
  options: AutoFixOptions = {}
): string {
  if (errors.length === 0) {
    return '';
  }

  const {
    requireConfirmation = true,
    autoReadFiles = true,
    checkDependencies = true,
  } = options;

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

  // Extract files to read
  const filesToRead = new Set<string>();
  filesToRead.add('package.json'); // Always check package.json

  for (const error of errors) {
    if (error.filePath) {
      const normalizedPath = error.filePath.replace('/workspace/', '');
      filesToRead.add(normalizedPath);
    }
  }

  // Extract missing dependencies
  const missingDeps = extractMissingDependencies(errors);

  prompt += `IMPORTANT: Follow the DEBUG WORKFLOW with CONFIRMATION:\n\n`;

  prompt += `## Step 1: EXPLORE (Mandatory)\n`;
  if (autoReadFiles) {
    prompt += `Use readFile to read these files:\n`;
    for (const file of Array.from(filesToRead).slice(0, 10)) {
      prompt += `- ${file}\n`;
    }
    if (filesToRead.size > 10) {
      prompt += `- ... and ${filesToRead.size - 10} more files\n`;
    }
  } else {
    prompt += `Use readFile to read:\n`;
    prompt += `- The files with errors\n`;
    prompt += `- package.json (to check dependencies)\n`;
    prompt += `- Any related/imported files\n`;
  }

  if (checkDependencies && missingDeps.length > 0) {
    prompt += `\nPotentially missing dependencies detected:\n`;
    for (const dep of missingDeps) {
      prompt += `- ${dep}\n`;
    }
  }

  prompt += `\n## Step 2: DIAGNOSE\n`;
  prompt += `After reading, present your diagnosis:\n`;
  prompt += `1. List 3-5 possible causes of the error\n`;
  prompt += `2. Identify the 1-2 most likely causes\n`;
  prompt += `3. Explain your reasoning\n`;

  if (requireConfirmation) {
    prompt += `\n## Step 3: 🛑 WAIT FOR CONFIRMATION\n`;
    prompt += `After presenting your diagnosis, ASK:\n`;
    prompt += `"Does this diagnosis look correct? Should I proceed with the fix?"\n`;
    prompt += `\n⚠️ DO NOT apply any fixes until the user confirms!\n`;
    prompt += `\n## Step 4: FIX (After Confirmation)\n`;
  } else {
    prompt += `\n## Step 3: FIX\n`;
  }

  prompt += `Only after ${requireConfirmation ? 'user confirmation' : 'diagnosis'}, apply fixes:\n`;
  prompt += `- Make MINIMAL targeted fixes using strReplace\n`;
  prompt += `- Don't regenerate entire files unless absolutely necessary\n`;
  prompt += `- If a package is missing, add to package.json and run npm install\n`;
  prompt += `- Create a snapshot before applying fixes (for rollback)\n`;

  if (requireConfirmation) {
    prompt += `\n## Step 5: VERIFY\n`;
  } else {
    prompt += `\n## Step 4: VERIFY\n`;
  }
  prompt += `Run npm run dev (or relevant command) to verify the fix worked.\n`;
  prompt += `If the fix fails, you can rollback to the snapshot.\n`;

  if (requireConfirmation) {
    prompt += `\nREMEMBER: NEVER fix without confirmation. Present diagnosis first, wait for approval.`;
  }

  // If React Native errors detected, add RN-specific instructions
  const hasRNErrors = errors.some(e =>
    /Text strings must be rendered|Unknown component|className.*not.*valid|onClick.*not.*valid|Invariant Violation|Unable to resolve module|VirtualizedLists should never|window is not defined|document is not defined|expo-modules-core.*mismatch/i.test(e.message || e.rawError || '')
  );

  if (hasRNErrors) {
    prompt += `\n\n## React Native Specific Rules\n`;
    prompt += `- Replace ALL HTML elements: div→View, span→Text, button→Pressable, input→TextInput, img→Image\n`;
    prompt += `- Replace className with style prop using StyleSheet.create()\n`;
    prompt += `- Replace onClick with onPress\n`;
    prompt += `- Wrap ALL bare text in <Text> components\n`;
    prompt += `- Import from 'react-native', NOT 'react-dom'\n`;
    prompt += `- Use 'npx expo install <package>' to install missing Expo packages\n`;
    prompt += `- Replace ALL \`window.\` and \`document.\` usage with React Native equivalents or Platform checks\n`;
    prompt += `- Never nest FlatList/SectionList inside ScrollView — use ListHeaderComponent/ListFooterComponent\n`;
    prompt += `- Use \`key\` prop on mapped elements and \`keyExtractor\` on FlatList\n`;
    prompt += `- Run \`npx expo install --fix\` if you see version mismatch errors\n`;
  }

  return prompt;
}

/**
 * Format a single file's errors for AI with enhanced context
 */
export function formatFileErrorsForAI(
  errors: BuildError[],
  filePath: string,
  options: AutoFixOptions = {}
): string {
  const fileErrors = errors.filter((e) => {
    const normalized = e.filePath?.replace('/workspace/', '');
    const targetNormalized = filePath.replace('/workspace/', '');

    return normalized === targetNormalized;
  });

  if (fileErrors.length === 0) {
    return '';
  }

  const { requireConfirmation = true } = options;

  const displayPath = filePath.replace('/workspace/', '');
  let prompt = `🔧 Fix errors in ${displayPath}:\n\n`;

  for (const error of fileErrors) {
    const location = error.line ? `Line ${error.line}${error.column ? `, Column ${error.column}` : ''}` : '';
    prompt += `- [${error.severity.toUpperCase()}] ${location}\n  ${error.message}\n`;
  }

  // Check for missing dependencies
  const missingDeps = extractMissingDependencies(fileErrors);

  prompt += `\nIMPORTANT - Follow DEBUG WORKFLOW:\n\n`;
  prompt += `1. EXPLORE: Use readFile to read ${displayPath} and package.json\n`;

  if (missingDeps.length > 0) {
    prompt += `   Potentially missing dependencies: ${missingDeps.join(', ')}\n`;
  }

  prompt += `2. DIAGNOSE: Present 2-3 possible causes and your most likely diagnosis\n`;

  if (requireConfirmation) {
    prompt += `3. 🛑 ASK: "Does this diagnosis look correct? Should I proceed with the fix?"\n`;
    prompt += `4. WAIT for user confirmation before applying any changes\n`;
    prompt += `5. FIX: Only after confirmation, use strReplace for targeted fixes\n`;
    prompt += `6. VERIFY: Run npm run dev to confirm the fix\n`;
    prompt += `\n⚠️ DO NOT apply fixes without user confirmation!`;
  } else {
    prompt += `3. FIX: Use strReplace for targeted fixes (after creating a snapshot)\n`;
    prompt += `4. VERIFY: Run npm run dev to confirm the fix\n`;
  }

  return prompt;
}

/**
 * Request AI to fix all errors with enhanced options
 */
export function requestAIFix(
  errors: BuildError[],
  sendMessage: (message: string) => void,
  options: AutoFixOptions = {}
): void {
  const prompt = formatErrorsForAI(errors, options);

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
  sendMessage: (message: string) => void,
  options: AutoFixOptions = {}
): void {
  const prompt = formatFileErrorsForAI(errors, filePath, options);

  if (prompt) {
    sendMessage(prompt);
  }
}

/**
 * Enhanced auto-fix with pre-processing
 * Reads files and checks dependencies before sending to AI
 */
export async function requestEnhancedAIFix(
  errors: BuildError[],
  projectId: string,
  sendMessage: (message: string) => void,
  options: AutoFixOptions = {}
): Promise<void> {
  const {
    autoReadFiles = true,
    checkDependencies = true,
    maxFilesToRead = 10,
  } = options;

  // Extract files to read
  const filesToRead = new Set<string>();
  if (checkDependencies) {
    filesToRead.add('package.json');
  }

  for (const error of errors) {
    if (error.filePath && filesToRead.size < maxFilesToRead) {
      const normalizedPath = error.filePath.replace('/workspace/', '');
      filesToRead.add(normalizedPath);
    }
  }

  // Read files if enabled
  const fileContents: Record<string, string> = {};
  if (autoReadFiles) {
    for (const filePath of filesToRead) {
      const content = await readFileForError(projectId, filePath);
      if (content) {
        fileContents[filePath] = content;
      }
    }
  }

  // Check for missing dependencies
  let missingDeps: string[] = [];
  if (checkDependencies) {
    const potentialDeps = extractMissingDependencies(errors);
    if (potentialDeps.length > 0) {
      missingDeps = await checkMissingDependencies(projectId, potentialDeps);
    }
  }

  // Format prompt with enhanced context
  let prompt = formatErrorsForAI(errors, options);

  // Add file contents context if available
  if (Object.keys(fileContents).length > 0) {
    prompt += `\n\n## File Contents (for context):\n\n`;
    for (const [filePath, content] of Object.entries(fileContents)) {
      const preview = content.length > 500 ? content.slice(0, 500) + '\n... (truncated)' : content;
      prompt += `### ${filePath}\n\`\`\`\n${preview}\n\`\`\`\n\n`;
    }
  }

  // Add missing dependencies info
  if (missingDeps.length > 0) {
    prompt += `\n## Confirmed Missing Dependencies:\n`;
    for (const dep of missingDeps) {
      prompt += `- ${dep} (not found in package.json)\n`;
    }
    prompt += `\nYou should add these to package.json and run npm install.\n`;
  }

  sendMessage(prompt);
}

/**
 * Watch terminal output for errors and auto-detect
 */
export function watchTerminalForErrors(
  terminalOutput: string,
  onErrorsDetected: (errors: BuildError[]) => void
): void {
  const errors = parseTerminalErrors(terminalOutput);
  if (errors.length > 0) {
    onErrorsDetected(errors);
  }
}

/**
 * Create a fix plan (without executing)
 */
export interface FixPlan {
  errors: BuildError[];
  filesToRead: string[];
  missingDependencies: string[];
  estimatedSteps: number;
  requiresUserConfirmation: boolean;
}

export function createFixPlan(
  errors: BuildError[],
  options: AutoFixOptions = {}
): FixPlan {
  const {
    requireConfirmation = true,
    checkDependencies = true,
    maxFilesToRead = 10,
  } = options;

  const filesToRead = new Set<string>();
  filesToRead.add('package.json');

  for (const error of errors) {
    if (error.filePath && filesToRead.size < maxFilesToRead) {
      const normalizedPath = error.filePath.replace('/workspace/', '');
      filesToRead.add(normalizedPath);
    }
  }

  const missingDeps = checkDependencies ? extractMissingDependencies(errors) : [];

  // Estimate steps: read files + diagnose + fix + verify
  let estimatedSteps = 2; // diagnose + verify
  estimatedSteps += filesToRead.size; // read each file
  estimatedSteps += missingDeps.length > 0 ? 1 : 0; // npm install if needed
  estimatedSteps += errors.length; // fix each error

  return {
    errors,
    filesToRead: Array.from(filesToRead),
    missingDependencies: missingDeps,
    estimatedSteps,
    requiresUserConfirmation: requireConfirmation,
  };
}
