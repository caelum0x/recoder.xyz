/**
 * File Mention Extractor
 *
 * Automatically extracts file references from text content (messages, comments, etc.)
 * Uses multiple strategies to identify file mentions:
 * - Explicit file paths (src/components/Button.tsx)
 * - Inline code references (`Button.tsx`)
 * - Natural language references ("the Button component")
 * - Import-style references (from './Button')
 */

import type { FileMention } from './types';

/**
 * Common file extensions to match
 */
const FILE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'yaml', 'yml',
  'css', 'scss', 'less', 'sass',
  'html', 'htm', 'vue', 'svelte',
  'md', 'mdx',
  'py', 'go', 'rs', 'java', 'rb', 'php',
  'sh', 'bash', 'zsh',
  'sql',
  'graphql', 'gql',
  'prisma',
  'env', 'local',
  'lock',
];

/**
 * Extension pattern for regex
 */
const EXT_PATTERN = FILE_EXTENSIONS.join('|');

/**
 * Extract file mentions from text content
 */
export function extractFileMentions(
  text: string,
  knownFiles?: string[]
): FileMention[] {
  const mentions: FileMention[] = [];
  const addedPaths = new Set<string>();

  // Strategy 1: Match explicit file paths (highest confidence)
  const explicitPathRegex = new RegExp(
    `(?:^|[\\s"'\`\\(\\[\\{])` +                    // Start or delimiter
    `((?:[a-zA-Z0-9_.-]+\\/)*` +                    // Directory parts
    `[a-zA-Z0-9_.-]+\\.(?:${EXT_PATTERN}))` +       // Filename with extension
    `(?:[\\s"'\`\\)\\]\\}]|$)`,                      // End or delimiter
    'gm'
  );

  let match;
  while ((match = explicitPathRegex.exec(text)) !== null) {
    const path = normalizePath(match[1]);
    if (!addedPaths.has(path) && isValidFilePath(path)) {
      mentions.push({
        path,
        matchText: match[1],
        startIndex: match.index + (match[0].length - match[1].length - (match[0].endsWith(' ') ? 1 : 0)),
        endIndex: match.index + match[0].length,
        confidence: 'high',
        context: 'path_reference',
      });
      addedPaths.add(path);
    }
  }

  // Strategy 2: Match inline code references
  const inlineCodeRegex = /`([^`]+\.([\w]+))`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    const potentialPath = match[1];
    const extension = match[2].toLowerCase();
    if (FILE_EXTENSIONS.includes(extension)) {
      const path = normalizePath(potentialPath);
      if (!addedPaths.has(path) && isValidFilePath(path)) {
        mentions.push({
          path,
          matchText: match[1],
          startIndex: match.index + 1,
          endIndex: match.index + match[0].length - 1,
          confidence: 'high',
          context: 'inline_code',
        });
        addedPaths.add(path);
      }
    }
  }

  // Strategy 3: Match import-style references
  const importRegex = /(?:from|import)\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(text)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      const path = normalizePath(importPath);
      if (!addedPaths.has(path)) {
        mentions.push({
          path,
          matchText: match[1],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 'high',
          context: 'inline_code',
        });
        addedPaths.add(path);
      }
    }
  }

  // Strategy 4: Match file references with action keywords
  const actionRegex = new RegExp(
    `(?:in|from|file|edit|modify|update|change|fix|create|delete|read|open|check)\\s+` +
    `(?:the\\s+)?` +
    `["'\`]?([a-zA-Z0-9_.-]+(?:\\/[a-zA-Z0-9_.-]+)*\\.(?:${EXT_PATTERN}))["'\`]?`,
    'gi'
  );
  while ((match = actionRegex.exec(text)) !== null) {
    const path = normalizePath(match[1]);
    if (!addedPaths.has(path) && isValidFilePath(path)) {
      mentions.push({
        path,
        matchText: match[1],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 'medium',
        context: 'natural_language',
      });
      addedPaths.add(path);
    }
  }

  // Strategy 5: Match against known files (if provided)
  if (knownFiles && knownFiles.length > 0) {
    for (const knownPath of knownFiles) {
      if (addedPaths.has(knownPath)) continue;

      const fileName = knownPath.split('/').pop() || '';
      const baseName = fileName.replace(/\.[^.]+$/, '');

      // Check if the base name is mentioned
      const nameRegex = new RegExp(`\\b${escapeRegex(baseName)}\\b`, 'gi');
      let nameMatch;
      while ((nameMatch = nameRegex.exec(text)) !== null) {
        // Check context to avoid false positives
        const before = text.slice(Math.max(0, nameMatch.index - 30), nameMatch.index);
        const after = text.slice(nameMatch.index + baseName.length, nameMatch.index + baseName.length + 30);

        // Look for file/component context clues
        const hasFileContext =
          /(?:file|component|module|function|class|hook|page|route|style|config)\s*$/i.test(before) ||
          /^\s*(?:file|component|module|\.tsx?|\.jsx?|\.css)/i.test(after) ||
          /(?:in|from|edit|modify|update|the)\s+$/i.test(before);

        if (hasFileContext && !addedPaths.has(knownPath)) {
          mentions.push({
            path: knownPath,
            matchText: baseName,
            startIndex: nameMatch.index,
            endIndex: nameMatch.index + baseName.length,
            confidence: 'low',
            context: 'natural_language',
          });
          addedPaths.add(knownPath);
          break; // Only add once per known file
        }
      }
    }
  }

  // Sort by confidence and position
  return mentions.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return a.startIndex - b.startIndex;
  });
}

/**
 * Extract file mentions from a user message with additional context
 */
export function extractFileMentionsFromMessage(
  message: string,
  projectFiles?: string[],
  currentFile?: string
): FileMention[] {
  const mentions = extractFileMentions(message, projectFiles);

  // If user mentions "this file" or "current file", add current file
  if (currentFile && /\b(?:this|current|active)\s+file\b/i.test(message)) {
    const hasCurrentFile = mentions.some(m => m.path === currentFile);
    if (!hasCurrentFile) {
      mentions.unshift({
        path: currentFile,
        matchText: 'this file',
        startIndex: 0,
        endIndex: 0,
        confidence: 'high',
        context: 'natural_language',
      });
    }
  }

  return mentions;
}

/**
 * Find related files based on mentions
 */
export function findRelatedFilesFromMentions(
  mentions: FileMention[],
  allFiles: string[]
): string[] {
  const related = new Set<string>();

  for (const mention of mentions) {
    const mentionedPath = mention.path;
    const baseName = mentionedPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';

    for (const file of allFiles) {
      // Skip the mentioned file itself
      if (file === mentionedPath) continue;

      const fileName = file.split('/').pop() || '';
      const fileBaseName = fileName.replace(/\.[^.]+$/, '');

      // Find related test files
      if (
        fileBaseName === `${baseName}.test` ||
        fileBaseName === `${baseName}.spec` ||
        file.includes(`__tests__/${baseName}`)
      ) {
        related.add(file);
      }

      // Find related style files
      if (fileBaseName === baseName && /\.(css|scss|less|sass)$/.test(fileName)) {
        related.add(file);
      }

      // Find index files in same directory
      if (file.includes(`${mentionedPath.replace(/[^/]+$/, '')}index.`)) {
        related.add(file);
      }
    }
  }

  return Array.from(related);
}

/**
 * Normalize a file path
 */
function normalizePath(path: string): string {
  // Remove leading ./ if present
  let normalized = path.replace(/^\.\//, '');

  // Handle paths without extensions (might be directory imports)
  // Don't add extension here - let resolution handle it

  return normalized;
}

/**
 * Check if a path looks like a valid file path
 */
function isValidFilePath(path: string): boolean {
  // Must have at least one character
  if (!path || path.length === 0) return false;

  // Must not start with http:// or https://
  if (/^https?:\/\//.test(path)) return false;

  // Must not contain invalid characters
  if (/[<>:"|?*]/.test(path)) return false;

  // Must not be just dots
  if (/^\.+$/.test(path)) return false;

  // Should have a reasonable extension or be a known path pattern
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (FILE_EXTENSIONS.includes(ext)) return true;

  // Allow paths that look like directories with index files
  if (path.endsWith('/index') || /\/[a-zA-Z][a-zA-Z0-9-_]*$/.test(path)) {
    return true;
  }

  return false;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get file mentions statistics
 */
export function getMentionStats(mentions: FileMention[]): {
  total: number;
  byConfidence: Record<string, number>;
  byContext: Record<string, number>;
  uniquePaths: string[];
} {
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const byContext: Record<string, number> = {};
  const uniquePaths = new Set<string>();

  for (const mention of mentions) {
    byConfidence[mention.confidence]++;
    byContext[mention.context] = (byContext[mention.context] || 0) + 1;
    uniquePaths.add(mention.path);
  }

  return {
    total: mentions.length,
    byConfidence,
    byContext,
    uniquePaths: Array.from(uniquePaths),
  };
}

/**
 * Filter mentions by confidence level
 */
export function filterMentionsByConfidence(
  mentions: FileMention[],
  minConfidence: 'high' | 'medium' | 'low' = 'medium'
): FileMention[] {
  const levels = { high: 2, medium: 1, low: 0 };
  const minLevel = levels[minConfidence];

  return mentions.filter(m => levels[m.confidence] >= minLevel);
}

/**
 * Resolve mention paths against project files
 */
export function resolveMentionPaths(
  mentions: FileMention[],
  projectFiles: string[]
): Map<string, string[]> {
  const resolved = new Map<string, string[]>();

  for (const mention of mentions) {
    const candidates: string[] = [];
    const mentionPath = mention.path.toLowerCase();

    for (const file of projectFiles) {
      const fileLower = file.toLowerCase();

      // Exact match
      if (fileLower === mentionPath || fileLower.endsWith('/' + mentionPath)) {
        candidates.unshift(file); // Exact matches first
        continue;
      }

      // Partial match (file ends with mention)
      if (fileLower.endsWith(mentionPath)) {
        candidates.push(file);
        continue;
      }

      // Extension-less match
      const mentionWithoutExt = mentionPath.replace(/\.[^.]+$/, '');
      const fileWithoutExt = fileLower.replace(/\.[^.]+$/, '');
      if (fileWithoutExt.endsWith(mentionWithoutExt)) {
        candidates.push(file);
      }
    }

    if (candidates.length > 0) {
      resolved.set(mention.path, candidates);
    }
  }

  return resolved;
}
