/**
 * Context Filter Service
 * Smart file filtering to reduce token usage in AI context
 *
 * Features:
 * - Filters out directories: node_modules, .next, .git, dist, build, coverage, __pycache__
 * - Filters out files: lock files, .DS_Store, binary files, generated files
 * - Set file size limits (max 10MB per file, skip large files)
 * - Prioritize important files: package.json, tsconfig.json, main entry points
 * - Count tokens and limit total context size
 * - Return filtered file tree with content
 */

import { contextSettingsStore, getContextSettings, type ContextSettings } from '../stores/context-settings';

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  content?: string;
  children?: FileItem[];
}

export interface FilteredFile {
  path: string;
  name: string;
  content: string;
  size: number;
  tokenCount: number;
  priority: number; // Higher = more important
  language: string;
}

export interface FilterResult {
  files: FilteredFile[];
  totalTokens: number;
  totalFiles: number;
  filteredCount: number;
  skippedReasons: Map<string, string[]>;
  warnings: string[];
}

// Default excluded directories
export const DEFAULT_EXCLUDED_DIRS = [
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.cache',
  '.turbo',
  '.vercel',
  '.svelte-kit',
  '.nuxt',
  '.output',
  'vendor',
  'venv',
  '.venv',
  'env',
  '.env',
  '__snapshots__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'egg-info',
  '.eggs',
  'htmlcov',
  '.nyc_output',
  'bower_components',
  '.sass-cache',
  '.parcel-cache',
  '.webpack',
  '.rollup.cache',
  'storybook-static',
  'out',
  '.expo',
  '.idea',
  '.vscode',
  'components/ui', // shadcn generated components
];

// Default excluded file patterns (regex patterns)
export const DEFAULT_EXCLUDED_FILE_PATTERNS = [
  // Lock files
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^bun\.lock(b)?$/,
  /^Gemfile\.lock$/,
  /^Cargo\.lock$/,
  /^poetry\.lock$/,
  /^composer\.lock$/,
  /^Pipfile\.lock$/,

  // OS files
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /^desktop\.ini$/,

  // Generated/build files
  /\.min\.(js|css)$/,
  /\.bundle\.(js|css)$/,
  /\.chunk\.(js|css)$/,
  /\.map$/,
  /\.d\.ts$/, // Type declaration files (except important ones)
  /^next-env\.d\.ts$/,

  // Binary and media files
  /\.(png|jpg|jpeg|gif|ico|svg|webp|avif|bmp|tiff)$/i,
  /\.(mp3|mp4|wav|ogg|webm|mov|avi|mkv)$/i,
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i,
  /\.(zip|tar|gz|rar|7z|bz2)$/i,
  /\.(exe|dll|so|dylib|bin|dmg|iso)$/i,
  /\.(woff|woff2|ttf|otf|eot)$/i,

  // Config and metadata
  /^\.gitignore$/,
  /^\.eslintignore$/,
  /^\.prettierignore$/,
  /^\.npmrc$/,
  /^\.nvmrc$/,
  /^\.editorconfig$/,
  /^\.browserslistrc$/,
  /^LICENSE(\.md)?$/i,
  /^CHANGELOG(\.md)?$/i,
  /^CONTRIBUTING(\.md)?$/i,
  /^CODE_OF_CONDUCT(\.md)?$/i,

  // Test snapshots and mocks
  /__snapshots__/,
  /\.snap$/,
  /\.mock\.(ts|js)$/,
  /\.stub\.(ts|js)$/,

  // IDE and editor
  /\.swp$/,
  /\.swo$/,
  /~$/,
  /\.bak$/,
];

// Priority files that should always be included (if they exist)
export const PRIORITY_FILES = [
  // Package management
  { pattern: /^package\.json$/, priority: 100, requireContent: true },
  { pattern: /^tsconfig\.json$/, priority: 95, requireContent: true },
  { pattern: /^tsconfig\.\w+\.json$/, priority: 90, requireContent: true },

  // Framework config
  { pattern: /^next\.config\.(js|mjs|ts)$/, priority: 90, requireContent: true },
  { pattern: /^vite\.config\.(js|ts|mjs)$/, priority: 90, requireContent: true },
  { pattern: /^webpack\.config\.(js|ts)$/, priority: 85, requireContent: true },
  { pattern: /^tailwind\.config\.(js|ts|mjs)$/, priority: 85, requireContent: true },
  { pattern: /^postcss\.config\.(js|mjs|cjs)$/, priority: 80, requireContent: false },

  // Entry points
  { pattern: /^(src\/)?index\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },
  { pattern: /^(src\/)?main\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },
  { pattern: /^(src\/)?App\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },
  { pattern: /^app\/page\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },
  { pattern: /^app\/layout\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },
  { pattern: /^pages\/_app\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },
  { pattern: /^pages\/index\.(ts|tsx|js|jsx)$/, priority: 85, requireContent: true },

  // Common important directories
  { pattern: /^(src\/)?components\/.*\.(ts|tsx|js|jsx)$/, priority: 70, requireContent: true },
  { pattern: /^(src\/)?hooks\/.*\.(ts|tsx|js|jsx)$/, priority: 70, requireContent: true },
  { pattern: /^(src\/)?lib\/.*\.(ts|tsx|js|jsx)$/, priority: 65, requireContent: true },
  { pattern: /^(src\/)?utils\/.*\.(ts|tsx|js|jsx)$/, priority: 65, requireContent: true },
  { pattern: /^(src\/)?types\/.*\.(ts|tsx)$/, priority: 60, requireContent: true },
  { pattern: /^(src\/)?api\/.*\.(ts|tsx|js|jsx)$/, priority: 70, requireContent: true },
  { pattern: /^app\/api\/.*\.(ts|tsx|js|jsx)$/, priority: 70, requireContent: true },
  { pattern: /^pages\/api\/.*\.(ts|tsx|js|jsx)$/, priority: 70, requireContent: true },

  // Styles
  { pattern: /^(src\/)?styles\/.*\.(css|scss|sass|less)$/, priority: 50, requireContent: true },
  { pattern: /^(src\/)?globals?\.(css|scss)$/, priority: 55, requireContent: true },
];

// Language detection from file extension
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  html: 'html',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'mdx',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  env: 'env',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  toml: 'toml',
  xml: 'xml',
  vue: 'vue',
  svelte: 'svelte',
};

/**
 * Estimate token count for text (rough approximation)
 * Uses ~4 characters per token as a heuristic
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // More accurate estimation: count words, special chars, and newlines
  const words = text.split(/\s+/).filter(Boolean).length;
  const specialChars = (text.match(/[{}[\]();:,.<>!@#$%^&*+=|\\/?`~"'-]/g) || []).length;
  const newlines = (text.match(/\n/g) || []).length;
  // Rough estimate: words + special chars + newlines
  return Math.ceil(words + specialChars * 0.5 + newlines * 0.5);
}

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'text';
}

/**
 * Check if a directory should be excluded
 */
export function shouldExcludeDirectory(dirName: string, settings: ContextSettings): boolean {
  const excludedDirs = [...DEFAULT_EXCLUDED_DIRS, ...settings.customExcludedDirs];
  return excludedDirs.some((excluded) => {
    if (typeof excluded === 'string') {
      return dirName === excluded || dirName.endsWith(`/${excluded}`);
    }
    return false;
  });
}

/**
 * Check if a file should be excluded
 */
export function shouldExcludeFile(fileName: string, filePath: string, settings: ContextSettings): string | null {
  // Check custom excluded patterns
  for (const pattern of settings.customExcludedPatterns) {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(fileName) || regex.test(filePath)) {
        return `Matches custom pattern: ${pattern}`;
      }
    } catch {
      // Invalid regex, skip
    }
  }

  // Check default excluded patterns
  for (const pattern of DEFAULT_EXCLUDED_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return `Matches excluded pattern: ${pattern.source}`;
    }
  }

  return null;
}

/**
 * Get priority for a file based on its path
 */
export function getFilePriority(filePath: string): number {
  // Normalize path (remove leading slash if present)
  const normalizedPath = filePath.replace(/^\/+/, '');

  for (const priorityFile of PRIORITY_FILES) {
    if (priorityFile.pattern.test(normalizedPath)) {
      return priorityFile.priority;
    }
  }

  // Default priority based on file type
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return 50;
  if (['css', 'scss', 'less'].includes(ext)) return 40;
  if (['json', 'yaml', 'yml'].includes(ext)) return 35;
  if (['md', 'mdx'].includes(ext)) return 20;

  return 30;
}

/**
 * Check if content appears to be binary
 */
export function isBinaryContent(content: string): boolean {
  // Check for null bytes or high ratio of non-printable characters
  const nullBytes = (content.match(/\x00/g) || []).length;
  if (nullBytes > 0) return true;

  // Check for high ratio of control characters
  const controlChars = (content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  if (content.length > 0 && controlChars / content.length > 0.1) return true;

  return false;
}

/**
 * Flatten a file tree into a list of files
 */
export function flattenFileTree(items: FileItem[], basePath = ''): FileItem[] {
  const files: FileItem[] = [];

  for (const item of items) {
    const fullPath = basePath ? `${basePath}/${item.name}` : item.name;

    if (item.type === 'file') {
      files.push({
        ...item,
        path: item.path || fullPath,
      });
    } else if (item.type === 'directory' && item.children) {
      files.push(...flattenFileTree(item.children, fullPath));
    }
  }

  return files;
}

/**
 * Filter files from a file tree based on context settings
 */
export function filterFileTree(
  items: FileItem[],
  settings?: Partial<ContextSettings>
): FilterResult {
  const currentSettings = { ...getContextSettings(), ...settings };
  const result: FilterResult = {
    files: [],
    totalTokens: 0,
    totalFiles: 0,
    filteredCount: 0,
    skippedReasons: new Map(),
    warnings: [],
  };

  // Helper to add skip reason
  const addSkipReason = (reason: string, path: string) => {
    const paths = result.skippedReasons.get(reason) || [];
    paths.push(path);
    result.skippedReasons.set(reason, paths);
    result.filteredCount++;
  };

  // Flatten the file tree
  const allFiles = flattenFileTree(items);
  result.totalFiles = allFiles.length;

  // First pass: filter and collect valid files
  const validFiles: Array<{
    item: FileItem;
    priority: number;
    tokenCount: number;
    language: string;
  }> = [];

  for (const item of allFiles) {
    const fileName = item.name;
    const filePath = item.path;

    // Check if file is in an excluded directory
    const pathParts = filePath.split('/');
    let inExcludedDir = false;
    for (const part of pathParts.slice(0, -1)) {
      if (shouldExcludeDirectory(part, currentSettings)) {
        addSkipReason(`In excluded directory: ${part}`, filePath);
        inExcludedDir = true;
        break;
      }
    }
    if (inExcludedDir) continue;

    // Check if file should be excluded
    const excludeReason = shouldExcludeFile(fileName, filePath, currentSettings);
    if (excludeReason) {
      addSkipReason(excludeReason, filePath);
      continue;
    }

    // Check file size
    const size = item.size || (item.content?.length || 0);
    if (size > currentSettings.maxFileSize) {
      addSkipReason(`File too large: ${Math.round(size / 1024)}KB > ${Math.round(currentSettings.maxFileSize / 1024)}KB`, filePath);
      continue;
    }

    // Check if content is available and not binary
    const content = item.content || '';
    if (content && isBinaryContent(content)) {
      addSkipReason('Binary file detected', filePath);
      continue;
    }

    // Calculate token count
    const tokenCount = estimateTokenCount(content);
    const priority = getFilePriority(filePath);
    const language = detectLanguage(filePath);

    validFiles.push({
      item: { ...item, content },
      priority,
      tokenCount,
      language,
    });
  }

  // Sort by priority (descending)
  validFiles.sort((a, b) => b.priority - a.priority);

  // Second pass: select files within token limit
  let currentTokens = 0;
  let fileCount = 0;

  for (const { item, priority, tokenCount, language } of validFiles) {
    // Check file count limit
    if (fileCount >= currentSettings.maxFiles) {
      addSkipReason('Max file count reached', item.path);
      continue;
    }

    // Check token limit
    if (currentTokens + tokenCount > currentSettings.maxTokens) {
      // Allow high-priority files to exceed limit slightly
      if (priority < 80 || currentTokens + tokenCount > currentSettings.maxTokens * 1.1) {
        addSkipReason('Token limit reached', item.path);
        continue;
      }
    }

    result.files.push({
      path: item.path,
      name: item.name,
      content: item.content || '',
      size: item.size || item.content?.length || 0,
      tokenCount,
      priority,
      language,
    });

    currentTokens += tokenCount;
    fileCount++;
  }

  result.totalTokens = currentTokens;

  // Add warnings
  if (result.filteredCount > result.files.length) {
    result.warnings.push(
      `${result.filteredCount} files were filtered out. ` +
      `Included ${result.files.length} files with ${result.totalTokens} estimated tokens.`
    );
  }

  if (currentTokens > currentSettings.maxTokens * 0.9) {
    result.warnings.push(
      `Context is near token limit (${result.totalTokens}/${currentSettings.maxTokens}).`
    );
  }

  return result;
}

/**
 * Filter files for AI context with optional custom settings
 */
export function filterForAIContext(
  files: FileItem[],
  options?: {
    maxTokens?: number;
    maxFiles?: number;
    priorityPatterns?: RegExp[];
    excludePatterns?: string[];
  }
): FilterResult {
  const settings: Partial<ContextSettings> = {};

  if (options?.maxTokens) settings.maxTokens = options.maxTokens;
  if (options?.maxFiles) settings.maxFiles = options.maxFiles;
  if (options?.excludePatterns) settings.customExcludedPatterns = options.excludePatterns;

  return filterFileTree(files, settings);
}

/**
 * Format filtered files for AI context prompt
 */
export function formatFilesForContext(
  filteredFiles: FilteredFile[],
  options?: {
    includeLineNumbers?: boolean;
    maxContentLength?: number;
  }
): string {
  const lines: string[] = [];
  lines.push('<project_files>');

  for (const file of filteredFiles) {
    let content = file.content;

    // Truncate if needed
    if (options?.maxContentLength && content.length > options.maxContentLength) {
      content = content.slice(0, options.maxContentLength) + '\n... (truncated)';
    }

    // Add line numbers if requested
    if (options?.includeLineNumbers) {
      content = content
        .split('\n')
        .map((line, i) => `${(i + 1).toString().padStart(4, ' ')} | ${line}`)
        .join('\n');
    }

    lines.push(`\n<file path="${file.path}" language="${file.language}" tokens="${file.tokenCount}">`);
    lines.push(content);
    lines.push('</file>');
  }

  lines.push('\n</project_files>');
  return lines.join('\n');
}

/**
 * Get a summary of the filter result
 */
export function getFilterSummary(result: FilterResult): string {
  const lines: string[] = [];

  lines.push(`Files: ${result.files.length} included, ${result.filteredCount} filtered`);
  lines.push(`Tokens: ~${result.totalTokens.toLocaleString()}`);

  if (result.skippedReasons.size > 0) {
    lines.push('\nFiltered by reason:');
    for (const [reason, paths] of result.skippedReasons) {
      lines.push(`  - ${reason}: ${paths.length} files`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create a compact file tree structure for display
 */
export function createCompactFileTree(files: FilteredFile[]): string {
  // Sort files by path
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Build tree structure
  const tree: Record<string, unknown> = {};

  for (const file of sortedFiles) {
    const parts = file.path.split('/').filter(Boolean);
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const fileName = parts[parts.length - 1];
    current[fileName] = `[${file.tokenCount}t]`;
  }

  // Format tree as string
  const formatTree = (node: Record<string, unknown>, indent = ''): string[] => {
    const lines: string[] = [];
    const entries = Object.entries(node).sort(([a], [b]) => {
      // Directories first, then files
      const aIsDir = typeof node[a] === 'object';
      const bIsDir = typeof node[b] === 'object';
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    for (let i = 0; i < entries.length; i++) {
      const [name, value] = entries[i];
      const isLast = i === entries.length - 1;
      const prefix = isLast ? '\\-- ' : '+-- ';
      const childIndent = isLast ? '    ' : '|   ';

      if (typeof value === 'string') {
        lines.push(`${indent}${prefix}${name} ${value}`);
      } else {
        lines.push(`${indent}${prefix}${name}/`);
        lines.push(...formatTree(value as Record<string, unknown>, indent + childIndent));
      }
    }

    return lines;
  };

  return formatTree(tree).join('\n');
}

// Re-export settings store functions for convenience
export { getContextSettings, updateContextSettings, resetContextSettings } from '../stores/context-settings';
