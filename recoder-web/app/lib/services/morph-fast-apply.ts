/**
 * Morph Fast Apply Service
 *
 * Enables ultra-fast targeted code edits (5x faster than full file regeneration) by:
 * 1. Parsing `<edit>` blocks from LLM output with target file, instructions, and update code
 * 2. Direct code merging without full file regeneration using Morph API
 * 3. Normalizing paths for Docker container compatibility
 *
 * Based on open-lovable's morph-fast-apply.ts, adapted for recoder-web's
 * Docker-based architecture and nanostores state management.
 */

import { atom, map, type WritableAtom, type MapStore } from 'nanostores';
import { dockerReadFile, dockerWriteFile } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MorphFastApply');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a parsed edit block from LLM output
 */
export interface MorphEditBlock {
  targetFile: string;
  instructions: string;
  update: string;
}

/**
 * Result of applying a Morph edit
 */
export interface MorphApplyResult {
  success: boolean;
  normalizedPath?: string;
  mergedCode?: string;
  error?: string;
  duration?: number;
}

/**
 * Result of processing multiple edit blocks
 */
export interface MorphBatchResult {
  success: boolean;
  totalEdits: number;
  successCount: number;
  failedCount: number;
  results: Map<string, MorphApplyResult>;
  duration: number;
}

/**
 * Configuration for the Morph service
 */
export interface MorphConfig {
  /** Morph API key (from environment) */
  apiKey?: string;
  /** Model to use for code merging */
  model: string;
  /** Timeout for API calls (ms) */
  timeout: number;
  /** Base path for files in container */
  basePath: string;
  /** Whether to use caching */
  enableCache: boolean;
}

/**
 * Status of the Morph service
 */
export type MorphStatus = 'idle' | 'processing' | 'error';

// ============================================================================
// STATE STORES (nanostores)
// ============================================================================

/** Current service status */
export const morphStatus: WritableAtom<MorphStatus> = atom<MorphStatus>('idle');

/** Current processing progress (0-100) */
export const morphProgress: WritableAtom<number> = atom<number>(0);

/** Last error message */
export const morphError: WritableAtom<string | null> = atom<string | null>(null);

/** Statistics about recent operations */
export const morphStats: MapStore<{
  totalApplied: number;
  totalFailed: number;
  averageDuration: number;
  lastOperation: number | null;
}> = map({
  totalApplied: 0,
  totalFailed: 0,
  averageDuration: 0,
  lastOperation: null,
});

/** Cache of recently merged files */
const fileCache: Map<string, { content: string; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: MorphConfig = {
  model: 'morph-v3-large',
  timeout: 30000,
  basePath: '/home/user/app',
  enableCache: true,
};

// ============================================================================
// PATH NORMALIZATION
// ============================================================================

/**
 * Configuration files that should stay at project root
 */
const CONFIG_FILES = new Set([
  'tailwind.config.js',
  'tailwind.config.ts',
  'vite.config.js',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'postcss.config.js',
  'postcss.config.cjs',
  'postcss.config.mjs',
  'eslint.config.js',
  '.eslintrc.js',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.json',
  'next.config.js',
  'next.config.mjs',
  'nuxt.config.ts',
  'astro.config.mjs',
  'remix.config.js',
  'svelte.config.js',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.gitignore',
  'README.md',
  'LICENSE',
]);

/**
 * Root directories that don't need src/ prefix
 */
const ROOT_DIRS = new Set(['src', 'public', 'app', 'pages', 'components', 'lib', 'styles', 'assets']);

/**
 * Normalize a project-relative path to the container's expected layout
 *
 * @param inputPath - The path from the LLM (may be relative or absolute)
 * @returns Normalized path and full container path
 */
export function normalizeProjectPath(inputPath: string): { normalizedPath: string; fullPath: string } {
  let normalizedPath = inputPath.trim();

  // Remove leading slash if present
  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  // Remove any leading ./ or ../
  while (normalizedPath.startsWith('./') || normalizedPath.startsWith('../')) {
    normalizedPath = normalizedPath.replace(/^\.\.?\//, '');
  }

  // Check if it's a config file at root
  const fileName = normalizedPath.split('/').pop() || '';
  const firstSegment = normalizedPath.split('/')[0];

  // Don't modify if:
  // 1. It's a known config file at root
  // 2. It already starts with a known root directory
  // 3. It's index.html at root
  const shouldNotModify =
    CONFIG_FILES.has(fileName) ||
    ROOT_DIRS.has(firstSegment) ||
    normalizedPath === 'index.html' ||
    normalizedPath.startsWith('node_modules/');

  // If it's a component/page/util and doesn't have a standard prefix, add src/
  if (!shouldNotModify && !normalizedPath.includes('/')) {
    // Single file without path - might be a source file
    if (fileName.endsWith('.tsx') || fileName.endsWith('.ts') || fileName.endsWith('.jsx') || fileName.endsWith('.js')) {
      // Don't auto-prefix single files at root - let LLM specify
    }
  } else if (
    !shouldNotModify &&
    !normalizedPath.startsWith('src/') &&
    !normalizedPath.startsWith('app/') &&
    !normalizedPath.startsWith('pages/')
  ) {
    // Common component patterns that should be in src/
    if (
      normalizedPath.startsWith('components/') ||
      normalizedPath.startsWith('hooks/') ||
      normalizedPath.startsWith('utils/') ||
      normalizedPath.startsWith('lib/') ||
      normalizedPath.startsWith('services/')
    ) {
      normalizedPath = 'src/' + normalizedPath;
    }
  }

  const fullPath = `${DEFAULT_CONFIG.basePath}/${normalizedPath}`;
  return { normalizedPath, fullPath };
}

// ============================================================================
// EDIT BLOCK PARSING
// ============================================================================

/**
 * Parse `<edit>` blocks from LLM output text
 *
 * Expected format:
 * ```
 * <edit target_file="path/to/file.tsx">
 *   <instructions>What changes to make</instructions>
 *   <update>The code snippet or patch to apply</update>
 * </edit>
 * ```
 *
 * @param text - Raw LLM output text
 * @returns Array of parsed edit blocks
 */
export function parseMorphEdits(text: string): MorphEditBlock[] {
  const edits: MorphEditBlock[] = [];

  // Match <edit target_file="...">...</edit> blocks
  const editRegex = /<edit\s+target_file="([^"]+)">([\s\S]*?)<\/edit>/g;

  let match: RegExpExecArray | null;
  while ((match = editRegex.exec(text)) !== null) {
    const targetFile = match[1].trim();
    const innerContent = match[2];

    // Extract instructions
    const instructionsMatch = innerContent.match(/<instructions>([\s\S]*?)<\/instructions>/);
    const instructions = instructionsMatch ? instructionsMatch[1].trim() : '';

    // Extract update code
    const updateMatch = innerContent.match(/<update>([\s\S]*?)<\/update>/);
    const update = updateMatch ? updateMatch[1].trim() : '';

    // Only add if we have a target file and update content
    if (targetFile && update) {
      edits.push({ targetFile, instructions, update });
      logger.debug(`Parsed edit block for: ${targetFile}`);
    } else {
      logger.warn(`Skipping incomplete edit block for: ${targetFile || 'unknown'}`);
    }
  }

  logger.info(`Parsed ${edits.length} edit blocks from LLM output`);
  return edits;
}

/**
 * Check if text contains any edit blocks
 */
export function hasEditBlocks(text: string): boolean {
  return /<edit\s+target_file="[^"]+">/.test(text);
}

/**
 * Strip edit blocks from text (for display purposes)
 */
export function stripEditBlocks(text: string): string {
  return text.replace(/<edit\s+target_file="[^"]+">[\s\S]*?<\/edit>/g, '').trim();
}

// ============================================================================
// MORPH API CLIENT
// ============================================================================

/**
 * Make a request to Morph's OpenAI-compatible chat completions API
 *
 * @param payload - The chat completions request payload
 * @param config - Configuration including API key
 * @returns The API response
 */
async function morphChatCompletionsCreate(
  payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
  },
  config: Partial<MorphConfig> = {}
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const apiKey = config.apiKey || process.env.MORPH_API_KEY;

  if (!apiKey) {
    throw new Error('MORPH_API_KEY is not set. Please configure it in your environment.');
  }

  const timeout = config.timeout || DEFAULT_CONFIG.timeout;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://api.morphllm.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Morph API error ${response.status}: ${errorText}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Morph API request timed out after ${timeout}ms`);
    }

    throw error;
  }
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Read a file from the Docker container, with caching support
 *
 * @param projectId - The project ID
 * @param normalizedPath - The normalized file path
 * @param config - Configuration options
 * @returns The file content
 */
async function readFileFromContainer(
  projectId: string,
  normalizedPath: string,
  config: Partial<MorphConfig> = {}
): Promise<string> {
  const enableCache = config.enableCache ?? DEFAULT_CONFIG.enableCache;
  const cacheKey = `${projectId}:${normalizedPath}`;

  // Check cache first
  if (enableCache) {
    const cached = fileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.debug(`Cache hit for: ${normalizedPath}`);
      return cached.content;
    }
  }

  // Read from container
  const content = await dockerReadFile(projectId, normalizedPath);

  // Update cache
  if (enableCache) {
    fileCache.set(cacheKey, { content, timestamp: Date.now() });
  }

  return content;
}

/**
 * Write a file to the Docker container and update cache
 *
 * @param projectId - The project ID
 * @param normalizedPath - The normalized file path
 * @param content - The file content
 * @param config - Configuration options
 */
async function writeFileToContainer(
  projectId: string,
  normalizedPath: string,
  content: string,
  config: Partial<MorphConfig> = {}
): Promise<void> {
  await dockerWriteFile(projectId, normalizedPath, content);

  // Update cache
  const enableCache = config.enableCache ?? DEFAULT_CONFIG.enableCache;
  if (enableCache) {
    const cacheKey = `${projectId}:${normalizedPath}`;
    fileCache.set(cacheKey, { content, timestamp: Date.now() });
  }
}

// ============================================================================
// CORE APPLY FUNCTION
// ============================================================================

/**
 * Apply a Morph edit to a file in the Docker container
 *
 * This function:
 * 1. Normalizes the target file path
 * 2. Reads the original file content
 * 3. Sends the code + update to Morph API for intelligent merging
 * 4. Writes the merged result back to the file
 *
 * @param projectId - The project ID
 * @param params - Edit parameters
 * @param config - Optional configuration overrides
 * @returns Result of the apply operation
 */
export async function applyMorphEditToFile(
  projectId: string,
  params: {
    targetPath: string;
    instructions: string;
    updateSnippet: string;
  },
  config: Partial<MorphConfig> = {}
): Promise<MorphApplyResult> {
  const startTime = Date.now();

  try {
    // Check for API key
    const apiKey = config.apiKey || process.env.MORPH_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: 'MORPH_API_KEY not set. Configure it in environment variables.',
      };
    }

    // Normalize the path
    const { normalizedPath, fullPath } = normalizeProjectPath(params.targetPath);
    logger.info(`Applying Morph edit to: ${normalizedPath}`);

    // Read the original file
    let initialCode: string;
    try {
      initialCode = await readFileFromContainer(projectId, normalizedPath, config);
    } catch (readError) {
      return {
        success: false,
        normalizedPath,
        error: `Failed to read file: ${readError instanceof Error ? readError.message : String(readError)}`,
      };
    }

    // Call Morph API to merge the code
    const model = config.model || DEFAULT_CONFIG.model;
    const morphPayload = {
      model,
      messages: [
        {
          role: 'user',
          content: `<instruction>${params.instructions || 'Apply the following update to the code'}</instruction>\n<code>${initialCode}</code>\n<update>${params.updateSnippet}</update>`,
        },
      ],
    };

    let mergedCode: string;
    try {
      const response = await morphChatCompletionsCreate(morphPayload, { ...config, apiKey });
      mergedCode = response?.choices?.[0]?.message?.content || '';

      if (!mergedCode) {
        return {
          success: false,
          normalizedPath,
          error: 'Morph API returned empty content',
        };
      }
    } catch (apiError) {
      return {
        success: false,
        normalizedPath,
        error: `Morph API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
      };
    }

    // Write the merged code back
    try {
      await writeFileToContainer(projectId, normalizedPath, mergedCode, config);
    } catch (writeError) {
      return {
        success: false,
        normalizedPath,
        mergedCode,
        error: `Failed to write file: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      };
    }

    const duration = Date.now() - startTime;
    logger.info(`Successfully applied Morph edit to ${normalizedPath} in ${duration}ms`);

    // Update stats
    const stats = morphStats.get();
    morphStats.setKey('totalApplied', stats.totalApplied + 1);
    morphStats.setKey('lastOperation', Date.now());

    // Update average duration
    const totalOps = stats.totalApplied + stats.totalFailed + 1;
    const newAvg = (stats.averageDuration * (totalOps - 1) + duration) / totalOps;
    morphStats.setKey('averageDuration', Math.round(newAvg));

    return {
      success: true,
      normalizedPath,
      mergedCode,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Morph edit failed: ${errorMessage}`);

    // Update stats
    const stats = morphStats.get();
    morphStats.setKey('totalFailed', stats.totalFailed + 1);
    morphStats.setKey('lastOperation', Date.now());

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Apply multiple Morph edits from parsed edit blocks
 *
 * @param projectId - The project ID
 * @param edits - Array of edit blocks to apply
 * @param config - Optional configuration overrides
 * @returns Batch result with individual results
 */
export async function applyMorphEdits(
  projectId: string,
  edits: MorphEditBlock[],
  config: Partial<MorphConfig> = {}
): Promise<MorphBatchResult> {
  const startTime = Date.now();
  const results = new Map<string, MorphApplyResult>();
  let successCount = 0;
  let failedCount = 0;

  morphStatus.set('processing');
  morphProgress.set(0);
  morphError.set(null);

  try {
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];

      const result = await applyMorphEditToFile(
        projectId,
        {
          targetPath: edit.targetFile,
          instructions: edit.instructions,
          updateSnippet: edit.update,
        },
        config
      );

      results.set(edit.targetFile, result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Update progress
      morphProgress.set(Math.round(((i + 1) / edits.length) * 100));
    }

    morphStatus.set('idle');
    morphProgress.set(100);

    return {
      success: failedCount === 0,
      totalEdits: edits.length,
      successCount,
      failedCount,
      results,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    morphStatus.set('error');
    morphError.set(errorMessage);

    return {
      success: false,
      totalEdits: edits.length,
      successCount,
      failedCount: edits.length - successCount,
      results,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Parse and apply all edit blocks from LLM output text
 *
 * Convenience function that combines parsing and applying.
 *
 * @param projectId - The project ID
 * @param llmOutput - Raw LLM output text containing edit blocks
 * @param config - Optional configuration overrides
 * @returns Batch result
 */
export async function applyMorphEditsFromText(
  projectId: string,
  llmOutput: string,
  config: Partial<MorphConfig> = {}
): Promise<MorphBatchResult> {
  const edits = parseMorphEdits(llmOutput);

  if (edits.length === 0) {
    return {
      success: true,
      totalEdits: 0,
      successCount: 0,
      failedCount: 0,
      results: new Map(),
      duration: 0,
    };
  }

  return applyMorphEdits(projectId, edits, config);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clear the file cache
 */
export function clearFileCache(): void {
  fileCache.clear();
  logger.debug('File cache cleared');
}

/**
 * Clear cache for a specific project
 */
export function clearProjectCache(projectId: string): void {
  const prefix = `${projectId}:`;
  for (const key of fileCache.keys()) {
    if (key.startsWith(prefix)) {
      fileCache.delete(key);
    }
  }
  logger.debug(`Cache cleared for project: ${projectId}`);
}

/**
 * Invalidate a specific file from cache
 */
export function invalidateFile(projectId: string, normalizedPath: string): void {
  const cacheKey = `${projectId}:${normalizedPath}`;
  fileCache.delete(cacheKey);
}

/**
 * Get current Morph service statistics
 */
export function getMorphStats(): {
  totalApplied: number;
  totalFailed: number;
  averageDuration: number;
  lastOperation: number | null;
  cacheSize: number;
} {
  const stats = morphStats.get();
  return {
    ...stats,
    cacheSize: fileCache.size,
  };
}

/**
 * Reset Morph service statistics
 */
export function resetMorphStats(): void {
  morphStats.set({
    totalApplied: 0,
    totalFailed: 0,
    averageDuration: 0,
    lastOperation: null,
  });
}

/**
 * Check if Morph API is configured
 */
export function isMorphConfigured(): boolean {
  return !!process.env.MORPH_API_KEY;
}

/**
 * Validate Morph API key by making a test request
 */
export async function validateMorphApiKey(apiKey?: string): Promise<boolean> {
  const key = apiKey || process.env.MORPH_API_KEY;
  if (!key) return false;

  try {
    // Make a minimal request to test the API key
    const response = await fetch('https://api.morphllm.com/v1/models', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
