/**
 * AI Context
 * Context building for AI generation
 * Adapted from Libra's AI context module
 */

import type {
  GenerationConfig,
  GenerationContext,
  ProjectData,
  FileInfo,
} from './types';
import { buildFilesToXml, buildSingleFileXml, type FileContentMap } from './files';
import { tryCatch } from './utils';

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build generation context from project data
 */
export async function buildGenerationContext(
  projectData: ProjectData,
  fileMap: FileContentMap,
  config: GenerationConfig
): Promise<GenerationContext> {
  try {
    // Get user plan (default to free for recoder)
    const userPlan = 'recoder';

    // Build XML files based on config
    let xmlFiles: string;
    if (config.isFileEdit && config.targetFilename) {
      xmlFiles = buildSingleFileXml(fileMap, config.targetFilename, projectData.id);
    } else {
      xmlFiles = buildFilesToXml(fileMap, projectData.id);
    }

    return {
      projectData,
      userPlan,
      fileMap,
      xmlFiles,
    };
  } catch (error) {
    // Re-throw with context for better error tracking
    if (error instanceof Error) {
      throw new Error(`Failed to build AI generation context: ${error.message}`);
    }
    throw error;
  }
}

// ============================================================================
// File Map Building with History
// ============================================================================

/**
 * History entry for file changes
 */
export interface HistoryEntry {
  type: 'file' | 'delete';
  path: string;
  content?: string;
  timestamp: number;
}

/**
 * Build file map with history applied
 */
export function buildFileMapWithHistory(
  initialFiles: FileContentMap,
  history: HistoryEntry[]
): FileContentMap {
  // Start with initial files
  const fileMap: FileContentMap = { ...initialFiles };

  // Apply history in order
  for (const entry of history) {
    if (entry.type === 'delete') {
      delete fileMap[entry.path];
    } else if (entry.type === 'file' && entry.content !== undefined) {
      fileMap[entry.path] = {
        content: entry.content,
        path: entry.path,
      };
    }
  }

  return fileMap;
}

/**
 * Parse message history JSON to history entries
 */
export function parseMessageHistory(messageHistoryJson: string | null): HistoryEntry[] {
  if (!messageHistoryJson) return [];

  try {
    const history = JSON.parse(messageHistoryJson);
    if (!Array.isArray(history)) return [];

    return history
      .filter((entry: any) => entry && (entry.type === 'file' || entry.type === 'delete'))
      .map((entry: any) => ({
        type: entry.type,
        path: entry.path || entry.filename,
        content: entry.content,
        timestamp: entry.timestamp || Date.now(),
      }));
  } catch {
    return [];
  }
}

// ============================================================================
// Quota and Validation
// ============================================================================

/**
 * Usage quota information
 */
export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Check quota for operation type
 * In recoder, we don't have quota limits, so this always returns true
 */
export async function checkQuota(
  quotaType: 'ai' | 'enhance'
): Promise<boolean> {
  // Recoder doesn't have quota limits
  return true;
}

/**
 * Get quota information (stub for compatibility)
 */
export async function getQuotaInfo(): Promise<QuotaInfo | null> {
  // Recoder doesn't have quota limits
  return null;
}

// ============================================================================
// Context Size Management
// ============================================================================

/**
 * Context size limits by model
 */
const CONTEXT_LIMITS: Record<string, number> = {
  'anthropic/claude-3.5-sonnet': 200000,
  'anthropic/claude-3-opus': 200000,
  'openai/gpt-4o': 128000,
  'openai/gpt-4o-mini': 128000,
  'google/gemini-1.5-pro': 2000000,
  'deepseek/deepseek-chat': 128000,
  default: 128000,
};

/**
 * Get context limit for a model
 */
export function getContextLimit(modelId: string): number {
  return CONTEXT_LIMITS[modelId] || CONTEXT_LIMITS.default;
}

/**
 * Estimate context size in tokens (rough approximation)
 */
export function estimateContextSize(context: GenerationContext): number {
  let totalChars = 0;

  // Count XML files
  totalChars += context.xmlFiles.length;

  // Count knowledge
  if (context.projectData.knowledge) {
    totalChars += context.projectData.knowledge.length;
  }

  // Rough token estimation: ~4 chars per token
  return Math.ceil(totalChars / 4);
}

/**
 * Check if context fits within model limits
 */
export function contextFitsModel(
  context: GenerationContext,
  modelId: string,
  promptOverhead: number = 5000
): boolean {
  const contextSize = estimateContextSize(context);
  const limit = getContextLimit(modelId);

  return contextSize + promptOverhead < limit;
}

// ============================================================================
// Context Filtering
// ============================================================================

/**
 * Files to always include in context
 */
const PRIORITY_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'tailwind.config.ts',
  'tailwind.config.js',
  'next.config.js',
  'next.config.mjs',
  'astro.config.mjs',
];

/**
 * File patterns to exclude from context
 */
const EXCLUDE_PATTERNS = [
  /\.lock$/,
  /\.log$/,
  /\.map$/,
  /\.min\./,
  /node_modules/,
  /\.git/,
  /dist\//,
  /build\//,
  /coverage\//,
];

/**
 * Filter files for context based on relevance
 */
export function filterFilesForContext(
  fileMap: FileContentMap,
  targetFiles?: string[]
): FileContentMap {
  const filtered: FileContentMap = {};

  for (const [path, info] of Object.entries(fileMap)) {
    // Check exclusion patterns
    if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(path))) {
      continue;
    }

    // Always include priority files
    if (PRIORITY_FILES.some((pf) => path.endsWith(pf))) {
      filtered[path] = info;
      continue;
    }

    // Include target files
    if (targetFiles?.includes(path)) {
      filtered[path] = info;
      continue;
    }

    // Include all other source files
    filtered[path] = info;
  }

  return filtered;
}

/**
 * Reduce context to fit within token limit
 */
export function reduceContextToFit(
  context: GenerationContext,
  maxTokens: number
): GenerationContext {
  const currentSize = estimateContextSize(context);

  if (currentSize <= maxTokens) {
    return context;
  }

  // Sort files by priority (config files first, then by size ascending)
  const files = Object.entries(context.fileMap);
  files.sort(([pathA, infoA], [pathB, infoB]) => {
    const aPriority = PRIORITY_FILES.some((pf) => pathA.endsWith(pf)) ? 0 : 1;
    const bPriority = PRIORITY_FILES.some((pf) => pathB.endsWith(pf)) ? 0 : 1;

    if (aPriority !== bPriority) return aPriority - bPriority;

    // Sort by size ascending (keep smaller files)
    return (infoA.content?.length || 0) - (infoB.content?.length || 0);
  });

  // Remove files until we fit
  const reducedFileMap: FileContentMap = {};
  let currentTokens = 0;

  for (const [path, info] of files) {
    const fileTokens = Math.ceil((info.content?.length || 0) / 4);

    if (currentTokens + fileTokens <= maxTokens * 0.8) {
      // Use 80% of limit for files
      reducedFileMap[path] = info;
      currentTokens += fileTokens;
    }
  }

  // Rebuild XML
  const xmlFiles = buildFilesToXml(reducedFileMap, context.projectData.id);

  return {
    ...context,
    fileMap: reducedFileMap,
    xmlFiles,
  };
}

// ============================================================================
// Knowledge Base
// ============================================================================

/**
 * Build knowledge section from project knowledge
 */
export function buildKnowledgeSection(knowledge?: string | null): string {
  if (!knowledge) return '';

  return `
<projectKnowledge>
${knowledge}
</projectKnowledge>
`.trim();
}

/**
 * Extract relevant knowledge based on query
 */
export function extractRelevantKnowledge(
  knowledge: string,
  query: string,
  maxLength: number = 2000
): string {
  // Simple keyword-based extraction
  const queryWords = query.toLowerCase().split(/\s+/);
  const paragraphs = knowledge.split('\n\n');

  // Score paragraphs by relevance
  const scored = paragraphs.map((p) => {
    const pLower = p.toLowerCase();
    const score = queryWords.reduce(
      (s, word) => s + (pLower.includes(word) ? 1 : 0),
      0
    );
    return { paragraph: p, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Build result within maxLength
  let result = '';
  for (const { paragraph, score } of scored) {
    if (score === 0) break;
    if (result.length + paragraph.length > maxLength) break;
    result += paragraph + '\n\n';
  }

  return result.trim();
}
