/**
 * Starter System Configuration
 * Central configuration for all starter-related paths and settings
 */

/**
 * Get the project root directory
 */
export function getProjectRoot(): string {
  if (typeof process !== 'undefined' && process.cwd) {
    return process.cwd();
  }
  // Fallback for Cloudflare Workers
  return '/app';
}

/**
 * Get the starters directory path
 */
export function getStartersPath(): string {
  const root = getProjectRoot();
  return `${root}/starters`;
}

/**
 * Configuration for starter system
 */
export const STARTER_CONFIG = {
  // Paths
  paths: {
    root: getProjectRoot(),
    starters: getStartersPath(),
  },

  // Search engine settings
  search: {
    minScore: 0.15,              // Minimum score to consider a match
    cacheTimeout: 5 * 60 * 1000, // 5 minutes cache TTL
    maxResults: 5,                // Maximum number of search results
  },

  // Scoring weights for search engine
  scoring: {
    tfidf: 0.5,        // 50% - Keyword relevance
    idMatch: 0.2,      // 20% - Template ID similarity
    nameMatch: 0.15,   // 15% - Template name similarity
    framework: 0.1,    // 10% - Framework exact match
    category: 0.05,    // 5% - Category exact match
  },

  // Fuzzy matching settings
  fuzzyMatch: {
    minSimilarity: 0.6, // Minimum similarity score to consider
    exactMatchScore: 1.0,
    containsMatchScore: 0.8,
  },

  // File loading settings
  fileLoading: {
    ignorePatterns: [
      /^\.git/,
      /^node_modules/,
      /^\.next/,
      /^dist/,
      /^build/,
      /^out/,
      /^\.vscode/,
      /^\.idea/,
      /\.DS_Store$/,
      /\.env$/,
      /\.env\./,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.log$/,
      /^coverage/,
      /^\.cache/,
    ],
    ignoreDirs: [
      'node_modules',
      '.git',
      '.next',
      'dist',
      'build',
      'out',
      '.vscode',
      '.idea',
      'coverage',
      '.cache',
    ],
  },

  // Injection settings
  injection: {
    simpleRequestThreshold: 0.7,  // Confidence threshold for direct injection
    customizationThreshold: 0.15, // Minimum confidence for AI customization
  },

  // Logging
  logging: {
    enabled: true,
    verbose: true, // Set to true for detailed logs - ENABLED FOR DEBUGGING
  },
} as const;

/**
 * Get configuration value by path
 */
export function getConfig<T = any>(path: string): T {
  const parts = path.split('.');
  let value: any = STARTER_CONFIG;
  
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) break;
  }
  
  return value as T;
}

/**
 * Check if a file/directory should be ignored
 */
export function shouldIgnoreFile(path: string, name: string): boolean {
  const { ignorePatterns, ignoreDirs } = STARTER_CONFIG.fileLoading;
  
  // Check if directory name is in ignore list
  if (ignoreDirs.includes(name)) {
    return true;
  }
  
  // Check against patterns
  return ignorePatterns.some((pattern) => pattern.test(path));
}

/**
 * Log message if logging is enabled
 */
export function log(message: string, ...args: any[]): void {
  if (STARTER_CONFIG.logging.enabled) {
    console.log(message, ...args);
  }
}

/**
 * Log verbose message if verbose logging is enabled
 */
export function logVerbose(message: string, ...args: any[]): void {
  if (STARTER_CONFIG.logging.enabled && STARTER_CONFIG.logging.verbose) {
    console.log(message, ...args);
  }
}
