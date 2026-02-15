/**
 * Prompt Optimizer Service (Client-side)
 *
 * Client-side service for requesting prompt optimization from the server.
 * Uses nanostores for state management and includes caching and performance tracking.
 */

import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PromptOptimizer');

// ============================================
// Types
// ============================================

/** Best practice categories (matches server-side) */
export type BestPractice =
  | 'understand-task'
  | 'minimal-changes'
  | 'reasoning-before-conclusions'
  | 'examples-with-placeholders'
  | 'clarity-conciseness'
  | 'proper-formatting'
  | 'constants-inclusion'
  | 'output-format'
  | 'preserve-user-content'
  | 'structured-thinking'
  | 'error-handling'
  | 'context-awareness';

/** Configuration for prompt optimization */
export interface PromptOptimizerConfig {
  practices?: BestPractice[];
  includeExamples?: boolean;
  exampleCount?: 1 | 2 | 3;
  outputFormat?: 'text' | 'json' | 'markdown' | 'code';
  lengthGuidance?: 'short' | 'medium' | 'long';
  includeReasoning?: boolean;
  includeNotes?: boolean;
  includeSteps?: boolean;
  constants?: Record<string, string>;
  domain?: string;
  existingPrompt?: string;
}

/** Cached prompt entry */
export interface CachedPrompt {
  key: string;
  taskDescription: string;
  config: PromptOptimizerConfig;
  prompt: string;
  estimatedTokens: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/** Performance metric for a prompt */
export interface PromptPerformance {
  promptKey: string;
  taskDescription: string;
  usageCount: number;
  averageResponseTime: number;
  successRate: number;
  userRatings: number[];
  lastUsedAt: number;
  improvements: string[];
}

/** Prompt optimization result */
export interface OptimizationResult {
  prompt: string;
  appliedPractices: BestPractice[];
  estimatedTokens: number;
  suggestions: string[];
  cached: boolean;
}

/** Store state */
interface PromptOptimizerState {
  isLoading: boolean;
  error: string | null;
  lastOptimizedPrompt: string | null;
  lastTaskDescription: string | null;
}

// ============================================
// Constants
// ============================================

const CACHE_KEY = 'recoder_prompt_cache';
const PERFORMANCE_KEY = 'recoder_prompt_performance';
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Default best practices to apply */
export const DEFAULT_PRACTICES: BestPractice[] = [
  'understand-task',
  'reasoning-before-conclusions',
  'clarity-conciseness',
  'proper-formatting',
  'output-format',
  'structured-thinking',
];

/** All available best practices */
export const ALL_PRACTICES: BestPractice[] = [
  'understand-task',
  'minimal-changes',
  'reasoning-before-conclusions',
  'examples-with-placeholders',
  'clarity-conciseness',
  'proper-formatting',
  'constants-inclusion',
  'output-format',
  'preserve-user-content',
  'structured-thinking',
  'error-handling',
  'context-awareness',
];

/** Best practice descriptions for UI */
export const PRACTICE_DESCRIPTIONS: Record<BestPractice, string> = {
  'understand-task': 'Analyze and understand the core objective and requirements',
  'minimal-changes': 'Make minimal changes when improving existing prompts',
  'reasoning-before-conclusions': 'Include reasoning steps before final answers',
  'examples-with-placeholders': 'Add examples with placeholders for complex elements',
  'clarity-conciseness': 'Use clear, specific language without unnecessary content',
  'proper-formatting': 'Use markdown and proper formatting for readability',
  'constants-inclusion': 'Include reference constants and guidelines',
  'output-format': 'Specify the expected output format clearly',
  'preserve-user-content': 'Preserve user-provided guidelines and examples',
  'structured-thinking': 'Organize with clear sections and logical flow',
  'error-handling': 'Include guidance for edge cases and errors',
  'context-awareness': 'Adapt to the domain and context of use',
};

// ============================================
// Stores
// ============================================

/** Main optimizer state */
export const optimizerStore = map<PromptOptimizerState>({
  isLoading: false,
  error: null,
  lastOptimizedPrompt: null,
  lastTaskDescription: null,
});

/** Cache store */
export const cacheStore = map<Record<string, CachedPrompt>>({});

/** Performance metrics store */
export const performanceStore = map<Record<string, PromptPerformance>>({});

/** Current configuration store */
export const configStore = map<PromptOptimizerConfig>({
  practices: DEFAULT_PRACTICES,
  includeExamples: false,
  exampleCount: 1,
  outputFormat: 'text',
  lengthGuidance: 'medium',
  includeReasoning: true,
  includeNotes: false,
  includeSteps: false,
});

/** Loading state */
export const isLoading = computed(optimizerStore, (state) => state.isLoading);

/** Error state */
export const error = computed(optimizerStore, (state) => state.error);

/** Cache size */
export const cacheSize = computed(cacheStore, (cache) => Object.keys(cache).length);

/** Cache hit rate */
export const cacheHitRate = atom<number>(0);

// ============================================
// Cache Management
// ============================================

/**
 * Generate a cache key from task description and config
 */
function generateCacheKey(taskDescription: string, config: PromptOptimizerConfig): string {
  const configStr = JSON.stringify({
    practices: config.practices?.sort() || [],
    includeExamples: config.includeExamples,
    exampleCount: config.exampleCount,
    outputFormat: config.outputFormat,
    lengthGuidance: config.lengthGuidance,
    includeReasoning: config.includeReasoning,
    includeNotes: config.includeNotes,
    includeSteps: config.includeSteps,
    domain: config.domain,
  });

  // Simple hash function
  let hash = 0;
  const str = taskDescription + configStr;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `prompt_${Math.abs(hash).toString(36)}`;
}

/**
 * Load cache from localStorage
 */
export function loadCache(): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, CachedPrompt>;

      // Filter out expired entries
      const now = Date.now();
      const validEntries: Record<string, CachedPrompt> = {};

      for (const [key, entry] of Object.entries(parsed)) {
        if (now - entry.createdAt < CACHE_TTL_MS) {
          validEntries[key] = entry;
        }
      }

      cacheStore.set(validEntries);
    }
  } catch (e) {
    logger.error('[PromptOptimizer] Failed to load cache:', e);
  }
}

/**
 * Save cache to localStorage
 */
function saveCache(): void {
  if (typeof window === 'undefined') return;

  try {
    const cache = cacheStore.get();
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    logger.error('[PromptOptimizer] Failed to save cache:', e);
  }
}

/**
 * Get a cached prompt
 */
export function getCachedPrompt(
  taskDescription: string,
  config: PromptOptimizerConfig
): CachedPrompt | null {
  const key = generateCacheKey(taskDescription, config);
  const cache = cacheStore.get();
  const entry = cache[key];

  if (entry) {
    // Update access count and timestamp
    const updated = {
      ...entry,
      accessCount: entry.accessCount + 1,
      lastAccessedAt: Date.now(),
    };
    cacheStore.setKey(key, updated);
    saveCache();
    return updated;
  }

  return null;
}

/**
 * Add a prompt to the cache
 */
export function cachePrompt(
  taskDescription: string,
  config: PromptOptimizerConfig,
  prompt: string,
  estimatedTokens: number
): void {
  const key = generateCacheKey(taskDescription, config);
  const now = Date.now();

  const entry: CachedPrompt = {
    key,
    taskDescription,
    config,
    prompt,
    estimatedTokens,
    createdAt: now,
    accessCount: 1,
    lastAccessedAt: now,
  };

  const cache = cacheStore.get();

  // Evict oldest entries if cache is full
  if (Object.keys(cache).length >= MAX_CACHE_SIZE) {
    evictOldestEntries(10); // Remove 10 oldest
  }

  cacheStore.setKey(key, entry);
  saveCache();
}

/**
 * Evict oldest cache entries
 */
function evictOldestEntries(count: number): void {
  const cache = cacheStore.get();
  const entries = Object.entries(cache);

  // Sort by last accessed time (oldest first)
  entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  // Remove oldest entries
  const toRemove = entries.slice(0, count).map(([key]) => key);
  const newCache = { ...cache };

  for (const key of toRemove) {
    delete newCache[key];
  }

  cacheStore.set(newCache);
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  cacheStore.set({});
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  const cache = cacheStore.get();
  const entries = Object.values(cache);

  if (entries.length === 0) {
    return {
      size: 0,
      maxSize: MAX_CACHE_SIZE,
      hitRate: cacheHitRate.get(),
      oldestEntry: null,
      newestEntry: null,
    };
  }

  const timestamps = entries.map((e) => e.createdAt);

  return {
    size: entries.length,
    maxSize: MAX_CACHE_SIZE,
    hitRate: cacheHitRate.get(),
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps),
  };
}

// ============================================
// Performance Tracking
// ============================================

/**
 * Load performance metrics from localStorage
 */
export function loadPerformanceMetrics(): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(PERFORMANCE_KEY);
    if (stored) {
      performanceStore.set(JSON.parse(stored));
    }
  } catch (e) {
    logger.error('[PromptOptimizer] Failed to load performance metrics:', e);
  }
}

/**
 * Save performance metrics to localStorage
 */
function savePerformanceMetrics(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(performanceStore.get()));
  } catch (e) {
    logger.error('[PromptOptimizer] Failed to save performance metrics:', e);
  }
}

/**
 * Track prompt usage
 */
export function trackPromptUsage(
  promptKey: string,
  taskDescription: string,
  responseTimeMs: number,
  success: boolean
): void {
  const metrics = performanceStore.get();
  const existing = metrics[promptKey];

  if (existing) {
    const totalTime = existing.averageResponseTime * existing.usageCount + responseTimeMs;
    const totalSuccess = existing.successRate * existing.usageCount + (success ? 1 : 0);
    const newCount = existing.usageCount + 1;

    performanceStore.setKey(promptKey, {
      ...existing,
      usageCount: newCount,
      averageResponseTime: totalTime / newCount,
      successRate: totalSuccess / newCount,
      lastUsedAt: Date.now(),
    });
  } else {
    performanceStore.setKey(promptKey, {
      promptKey,
      taskDescription,
      usageCount: 1,
      averageResponseTime: responseTimeMs,
      successRate: success ? 1 : 0,
      userRatings: [],
      lastUsedAt: Date.now(),
      improvements: [],
    });
  }

  savePerformanceMetrics();
}

/**
 * Add a user rating for a prompt
 */
export function ratePrompt(promptKey: string, rating: number): void {
  const metrics = performanceStore.get();
  const existing = metrics[promptKey];

  if (existing) {
    performanceStore.setKey(promptKey, {
      ...existing,
      userRatings: [...existing.userRatings, Math.min(5, Math.max(1, rating))],
    });
    savePerformanceMetrics();
  }
}

/**
 * Get average rating for a prompt
 */
export function getPromptRating(promptKey: string): number | null {
  const metrics = performanceStore.get();
  const existing = metrics[promptKey];

  if (!existing || existing.userRatings.length === 0) {
    return null;
  }

  return existing.userRatings.reduce((a, b) => a + b, 0) / existing.userRatings.length;
}

/**
 * Get top performing prompts
 */
export function getTopPrompts(limit: number = 10): PromptPerformance[] {
  const metrics = performanceStore.get();
  const entries = Object.values(metrics);

  // Sort by success rate, then by usage count
  entries.sort((a, b) => {
    if (b.successRate !== a.successRate) {
      return b.successRate - a.successRate;
    }
    return b.usageCount - a.usageCount;
  });

  return entries.slice(0, limit);
}

/**
 * Clear performance metrics
 */
export function clearPerformanceMetrics(): void {
  performanceStore.set({});
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PERFORMANCE_KEY);
  }
}

// ============================================
// Optimization Functions
// ============================================

/**
 * Optimize a prompt using the server-side meta-prompt generator
 *
 * This function makes an API call to optimize the prompt.
 * For server-side usage, import directly from meta-prompt.ts instead.
 */
export async function optimizePrompt(
  taskDescription: string,
  config: PromptOptimizerConfig = {}
): Promise<OptimizationResult> {
  const mergedConfig = { ...configStore.get(), ...config };

  // Check cache first
  const cached = getCachedPrompt(taskDescription, mergedConfig);
  if (cached) {
    updateCacheHitRate(true);
    return {
      prompt: cached.prompt,
      appliedPractices: mergedConfig.practices || DEFAULT_PRACTICES,
      estimatedTokens: cached.estimatedTokens,
      suggestions: [],
      cached: true,
    };
  }

  updateCacheHitRate(false);

  // Set loading state
  optimizerStore.set({
    ...optimizerStore.get(),
    isLoading: true,
    error: null,
  });

  try {
    // Make API call to optimize prompt
    const response = await fetch('/api/optimize-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskDescription,
        config: mergedConfig,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to optimize prompt: ${response.statusText}`);
    }

    const result = await response.json() as {
      prompt: string;
      appliedPractices: BestPractice[];
      estimatedTokens: number;
      suggestions: string[];
    };

    // Cache the result
    cachePrompt(taskDescription, mergedConfig, result.prompt, result.estimatedTokens);

    // Update state
    optimizerStore.set({
      isLoading: false,
      error: null,
      lastOptimizedPrompt: result.prompt,
      lastTaskDescription: taskDescription,
    });

    return {
      ...result,
      cached: false,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';

    optimizerStore.set({
      ...optimizerStore.get(),
      isLoading: false,
      error: errorMessage,
    });

    throw e;
  }
}

/**
 * Optimize a prompt locally (without API call)
 *
 * This is a simplified client-side optimization that doesn't require
 * an API call. For full optimization, use optimizePrompt().
 */
export function optimizePromptLocal(
  taskDescription: string,
  config: PromptOptimizerConfig = {}
): OptimizationResult {
  const mergedConfig = { ...configStore.get(), ...config };
  const suggestions: string[] = [];

  // Build the optimized prompt
  let prompt = taskDescription;

  // Apply basic optimizations
  prompt = prompt.trim();

  // Ensure first letter is capitalized
  if (prompt.length > 0) {
    prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);
  }

  // Add output format if configured
  if (mergedConfig.outputFormat && mergedConfig.outputFormat !== 'text') {
    const formatGuides: Record<string, string> = {
      json: '\n\nProvide your response as valid JSON.',
      markdown: '\n\nFormat your response using Markdown.',
      code: '\n\nProvide complete, working code.',
    };
    prompt += formatGuides[mergedConfig.outputFormat] || '';
  }

  // Add length guidance
  if (mergedConfig.lengthGuidance === 'short') {
    prompt += '\n\nBe concise.';
  } else if (mergedConfig.lengthGuidance === 'long') {
    prompt += '\n\nBe comprehensive and thorough.';
  }

  // Add reasoning section if configured
  if (mergedConfig.includeReasoning) {
    prompt += '\n\nBefore providing your answer, briefly explain your reasoning.';
  }

  // Generate suggestions
  if (taskDescription.length < 50) {
    suggestions.push('Consider adding more detail to your task description.');
  }

  if (!mergedConfig.includeExamples && taskDescription.length > 200) {
    suggestions.push('Complex task detected. Consider enabling examples.');
  }

  // Estimate tokens (~4 chars per token)
  const estimatedTokens = Math.ceil(prompt.length / 4);

  // Cache the result
  const cacheKey = generateCacheKey(taskDescription, mergedConfig);
  cachePrompt(taskDescription, mergedConfig, prompt, estimatedTokens);

  // Update state
  optimizerStore.set({
    isLoading: false,
    error: null,
    lastOptimizedPrompt: prompt,
    lastTaskDescription: taskDescription,
  });

  return {
    prompt,
    appliedPractices: mergedConfig.practices || DEFAULT_PRACTICES,
    estimatedTokens,
    suggestions,
    cached: false,
  };
}

// ============================================
// Configuration Functions
// ============================================

/**
 * Update optimizer configuration
 */
export function updateConfig(updates: Partial<PromptOptimizerConfig>): void {
  configStore.set({
    ...configStore.get(),
    ...updates,
  });
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  configStore.set({
    practices: DEFAULT_PRACTICES,
    includeExamples: false,
    exampleCount: 1,
    outputFormat: 'text',
    lengthGuidance: 'medium',
    includeReasoning: true,
    includeNotes: false,
    includeSteps: false,
  });
}

/**
 * Toggle a best practice
 */
export function togglePractice(practice: BestPractice): void {
  const config = configStore.get();
  const practices = config.practices || [];

  if (practices.includes(practice)) {
    updateConfig({
      practices: practices.filter((p) => p !== practice),
    });
  } else {
    updateConfig({
      practices: [...practices, practice],
    });
  }
}

/**
 * Set all practices
 */
export function setAllPractices(): void {
  updateConfig({
    practices: [...ALL_PRACTICES],
  });
}

/**
 * Clear all practices
 */
export function clearAllPractices(): void {
  updateConfig({
    practices: [],
  });
}

// ============================================
// Helper Functions
// ============================================

/** Track cache hit/miss for hit rate calculation */
let cacheHits = 0;
let cacheMisses = 0;

function updateCacheHitRate(hit: boolean): void {
  if (hit) {
    cacheHits++;
  } else {
    cacheMisses++;
  }

  const total = cacheHits + cacheMisses;
  if (total > 0) {
    cacheHitRate.set(cacheHits / total);
  }
}

/**
 * Initialize the prompt optimizer
 * Call this on app startup
 */
export function initializePromptOptimizer(): void {
  loadCache();
  loadPerformanceMetrics();
}

/**
 * Get a quick optimization preview
 */
export function getOptimizationPreview(taskDescription: string): {
  estimatedTokens: number;
  suggestedPractices: BestPractice[];
  complexity: 'simple' | 'moderate' | 'complex';
} {
  const words = taskDescription.toLowerCase();
  const suggestedPractices: BestPractice[] = [...DEFAULT_PRACTICES];

  // Suggest additional practices based on content
  if (words.includes('code') || words.includes('function') || words.includes('implement')) {
    suggestedPractices.push('examples-with-placeholders');
  }

  if (words.includes('fix') || words.includes('debug') || words.includes('error')) {
    suggestedPractices.push('error-handling');
  }

  if (words.includes('api') || words.includes('react') || words.includes('web')) {
    suggestedPractices.push('context-awareness');
  }

  // Estimate complexity
  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (taskDescription.length > 300 || taskDescription.split('.').length > 5) {
    complexity = 'complex';
  } else if (taskDescription.length > 100 || taskDescription.includes('multiple')) {
    complexity = 'moderate';
  }

  return {
    estimatedTokens: Math.ceil(taskDescription.length * 1.5 / 4), // Rough estimate with overhead
    suggestedPractices: Array.from(new Set(suggestedPractices)),
    complexity,
  };
}

/**
 * Export all data (for backup/debugging)
 */
export function exportOptimizerData(): {
  cache: Record<string, CachedPrompt>;
  performance: Record<string, PromptPerformance>;
  config: PromptOptimizerConfig;
} {
  return {
    cache: cacheStore.get(),
    performance: performanceStore.get(),
    config: configStore.get(),
  };
}

/**
 * Import data (for restore)
 */
export function importOptimizerData(data: {
  cache?: Record<string, CachedPrompt>;
  performance?: Record<string, PromptPerformance>;
  config?: PromptOptimizerConfig;
}): void {
  if (data.cache) {
    cacheStore.set(data.cache);
    saveCache();
  }

  if (data.performance) {
    performanceStore.set(data.performance);
    savePerformanceMetrics();
  }

  if (data.config) {
    configStore.set(data.config);
  }
}
