/**
 * Context Optimizer - Smart context selection to maximize relevance
 * Inspired by Lovable's context-selector.ts and edit-intent-analyzer.ts
 */

import type { Messages } from '~/lib/types/chat';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ContextOptimizer');

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  path: string;
  content: string;
  size: number;
  language: string;
  isComponent?: boolean;
  isConfig?: boolean;
  isStyle?: boolean;
  lastModified?: number;
  imports?: string[];
  exports?: string[];
}

export interface ContextSelection {
  primaryFiles: string[];      // Files to edit
  contextFiles: string[];      // Files to include for reference
  excludedFiles: string[];     // Files explicitly excluded
  totalTokens: number;         // Estimated token count
  strategy: string;            // Strategy used
}

export interface EditIntent {
  type: EditType;
  targetFiles: string[];
  confidence: number;
  description: string;
  keywords: string[];
}

export enum EditType {
  UPDATE_COMPONENT = 'update_component',
  ADD_FEATURE = 'add_feature',
  FIX_ISSUE = 'fix_issue',
  UPDATE_STYLE = 'update_style',
  REFACTOR = 'refactor',
  FULL_REBUILD = 'full_rebuild',
  ADD_DEPENDENCY = 'add_dependency',
  CREATE_NEW = 'create_new',
}

export interface ProjectManifest {
  files: Map<string, FileInfo>;
  entryPoint: string;
  framework: string;
  dependencies: string[];
  componentTree: Map<string, string[]>; // component -> child components
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  maxContextTokens: 100000,       // Max tokens for context
  tokensPerChar: 0.25,            // Approximate tokens per character
  priorityBonus: {
    entryPoint: 50,
    componentMentioned: 40,
    importedByTarget: 30,
    styleFile: 20,
    configFile: 15,
    recentlyModified: 10,
  },
  fileTypePriority: {
    tsx: 10,
    jsx: 10,
    ts: 8,
    js: 7,
    css: 5,
    json: 3,
    md: 1,
  } as Record<string, number>,
};

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Analyze user prompt and select optimal files for context
 */
export function selectContextFiles(
  userPrompt: string,
  files: Map<string, string>,
  messages: Messages = [],
  maxTokens: number = CONFIG.maxContextTokens
): ContextSelection {
  // Build file info map
  const fileInfos = buildFileInfoMap(files);

  // Analyze edit intent
  const intent = analyzeEditIntent(userPrompt, fileInfos);

  // Prioritize files
  const prioritizedFiles = prioritizeFiles(userPrompt, fileInfos, intent);

  // Select files within token budget
  const selection = selectWithinBudget(prioritizedFiles, fileInfos, maxTokens, intent);

  logger.info(`📦 Context Optimizer: Selected ${selection.primaryFiles.length} primary, ${selection.contextFiles.length} context files`);
  logger.info(`📊 Estimated tokens: ${selection.totalTokens}`);
  logger.info(`🎯 Edit intent: ${intent.type} (${Math.round(intent.confidence * 100)}% confident)`);

  return selection;
}

/**
 * Build optimized system prompt with selected context
 */
export function buildOptimizedPrompt(
  basePrompt: string,
  selection: ContextSelection,
  files: Map<string, string>,
  intent: EditIntent
): string {
  const sections: string[] = [basePrompt];

  // Add edit intent section
  sections.push(`
<edit_intent>
TYPE: ${intent.type}
CONFIDENCE: ${Math.round(intent.confidence * 100)}%
DESCRIPTION: ${intent.description}
TARGET_FILES: ${intent.targetFiles.join(', ') || 'To be determined'}
</edit_intent>
`);

  // Add primary files (files to edit)
  if (selection.primaryFiles.length > 0) {
    sections.push(`
<primary_files title="Files to Edit - OUTPUT THESE">
${selection.primaryFiles.map(path => {
  const content = files.get(path) || '';
  return `<file path="${path}">
${content}
</file>`;
}).join('\n')}
</primary_files>
`);
  }

  // Add context files (reference only)
  if (selection.contextFiles.length > 0) {
    sections.push(`
<context_files title="Reference Files - DO NOT EDIT unless necessary">
${selection.contextFiles.map(path => {
  const content = files.get(path) || '';
  // Truncate large context files
  const truncated = content.length > 3000
    ? content.substring(0, 3000) + '\n// ... [truncated]'
    : content;
  return `<file path="${path}">
${truncated}
</file>`;
}).join('\n')}
</context_files>
`);
  }

  // Add file structure overview
  sections.push(`
<file_structure>
${Array.from(files.keys())
  .filter(f => !f.includes('node_modules'))
  .sort()
  .join('\n')}
</file_structure>
`);

  return sections.join('\n');
}

// ============================================================================
// Intent Analysis
// ============================================================================

/**
 * Analyze user prompt to determine edit intent
 */
export function analyzeEditIntent(
  prompt: string,
  files: Map<string, FileInfo>
): EditIntent {
  const lowerPrompt = prompt.toLowerCase();

  // Pattern matching for different intents
  const patterns: Array<{
    patterns: RegExp[];
    type: EditType;
    keywords: string[];
  }> = [
    {
      patterns: [
        /update\s+(the\s+)?(\w+)\s*(component|section|page)?/i,
        /change\s+(the\s+)?(\w+)/i,
        /modify\s+(the\s+)?(\w+)/i,
        /edit\s+(the\s+)?(\w+)/i,
        /fix\s+(the\s+)?(\w+)\s*(styling|style|css|layout)/i,
        /remove\s+.*\s*(button|link|text|element|section)/i,
        /delete\s+.*\s*(button|link|text|element|section)/i,
      ],
      type: EditType.UPDATE_COMPONENT,
      keywords: ['update', 'change', 'modify', 'edit', 'fix', 'remove', 'delete'],
    },
    {
      patterns: [
        /add\s+(a\s+)?new?\s+(\w+)\s*(page|section|feature|component)?/i,
        /create\s+(a\s+)?(\w+)\s*(page|section|feature|component)?/i,
        /implement\s+(a\s+)?(\w+)/i,
        /build\s+(a\s+)?(\w+)/i,
        /add\s+(\w+)\s+to\s+/i,
      ],
      type: EditType.ADD_FEATURE,
      keywords: ['add', 'create', 'implement', 'build', 'new'],
    },
    {
      patterns: [
        /fix\s+(the\s+)?error/i,
        /fix\s+(the\s+)?bug/i,
        /debug\s+/i,
        /resolve\s+(the\s+)?issue/i,
        /not\s+working/i,
        /broken/i,
      ],
      type: EditType.FIX_ISSUE,
      keywords: ['fix', 'bug', 'error', 'debug', 'broken', 'issue'],
    },
    {
      patterns: [
        /change\s+(the\s+)?(color|theme|style|css)/i,
        /update\s+(the\s+)?(color|theme|style|css)/i,
        /make\s+it\s+(dark|light|blue|red|green)/i,
        /style\s+(the\s+)?/i,
        /restyle\s+/i,
      ],
      type: EditType.UPDATE_STYLE,
      keywords: ['color', 'theme', 'style', 'css', 'dark', 'light'],
    },
    {
      patterns: [
        /refactor\s+/i,
        /clean\s+up\s+/i,
        /reorganize\s+/i,
        /optimize\s+/i,
        /improve\s+(the\s+)?code/i,
      ],
      type: EditType.REFACTOR,
      keywords: ['refactor', 'clean', 'reorganize', 'optimize'],
    },
    {
      patterns: [
        /start\s+over/i,
        /recreate\s+everything/i,
        /rebuild\s+(the\s+)?app/i,
        /new\s+app/i,
        /from\s+scratch/i,
      ],
      type: EditType.FULL_REBUILD,
      keywords: ['start over', 'rebuild', 'recreate', 'scratch'],
    },
    {
      patterns: [
        /install\s+(\w+)/i,
        /add\s+(\w+)\s*(package|library|dependency)/i,
        /use\s+(\w+)\s*(library|framework)/i,
      ],
      type: EditType.ADD_DEPENDENCY,
      keywords: ['install', 'package', 'library', 'dependency'],
    },
    {
      patterns: [
        /^create\s+(a\s+)?/i,
        /^build\s+(a\s+)?/i,
        /^make\s+(a\s+)?/i,
        /landing\s+page/i,
        /website/i,
        /web\s+app/i,
      ],
      type: EditType.CREATE_NEW,
      keywords: ['create', 'build', 'make', 'landing', 'website', 'app'],
    },
  ];

  // Find matching pattern
  for (const { patterns: regexes, type, keywords } of patterns) {
    for (const regex of regexes) {
      if (regex.test(lowerPrompt)) {
        const targetFiles = findTargetFiles(prompt, files, type);
        return {
          type,
          targetFiles,
          confidence: calculateConfidence(prompt, keywords, targetFiles),
          description: generateDescription(type, prompt),
          keywords,
        };
      }
    }
  }

  // Default to UPDATE_COMPONENT if no pattern matches
  return {
    type: EditType.UPDATE_COMPONENT,
    targetFiles: [],
    confidence: 0.3,
    description: 'General update to application',
    keywords: [],
  };
}

/**
 * Find target files mentioned in prompt
 */
function findTargetFiles(
  prompt: string,
  files: Map<string, FileInfo>,
  intentType: EditType
): string[] {
  const targets: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  // Extract potential component/file names from prompt
  const words = extractComponentNames(prompt);

  // Match against file names and component names
  for (const [path, info] of files) {
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    const baseName = fileName.replace(/\.[^.]+$/, '');

    for (const word of words) {
      if (baseName.includes(word) || word.includes(baseName)) {
        targets.push(path);
        break;
      }
    }
  }

  // For style updates, include CSS files
  if (intentType === EditType.UPDATE_STYLE) {
    for (const [path, info] of files) {
      if (info.isStyle) {
        targets.push(path);
      }
    }
  }

  // For dependency updates, include package.json
  if (intentType === EditType.ADD_DEPENDENCY) {
    for (const [path] of files) {
      if (path.endsWith('package.json')) {
        targets.push(path);
      }
    }
  }

  return [...new Set(targets)];
}

/**
 * Extract potential component names from prompt
 */
function extractComponentNames(prompt: string): string[] {
  const words: string[] = [];

  // Remove common words
  const cleanPrompt = prompt
    .replace(/\b(the|a|an|in|on|to|from|update|change|modify|edit|fix|make|add|create)\b/gi, '')
    .toLowerCase();

  // Extract words that might be component names
  const matches = cleanPrompt.match(/\b\w+\b/g) || [];
  for (const match of matches) {
    if (match.length > 2) {
      words.push(match);
    }
  }

  return words;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  prompt: string,
  keywords: string[],
  targetFiles: string[]
): number {
  let confidence = 0.5;

  // Higher confidence if target files found
  if (targetFiles.length > 0) {
    confidence += 0.2;
  }

  // Higher confidence for more specific prompts
  if (prompt.split(' ').length > 5) {
    confidence += 0.1;
  }

  // Higher confidence if keywords match
  const promptLower = prompt.toLowerCase();
  const keywordMatches = keywords.filter(k => promptLower.includes(k)).length;
  confidence += keywordMatches * 0.05;

  return Math.min(confidence, 1.0);
}

/**
 * Generate description for edit intent
 */
function generateDescription(type: EditType, prompt: string): string {
  switch (type) {
    case EditType.UPDATE_COMPONENT:
      return 'Updating existing component';
    case EditType.ADD_FEATURE:
      return 'Adding new feature or component';
    case EditType.FIX_ISSUE:
      return 'Fixing bug or error';
    case EditType.UPDATE_STYLE:
      return 'Updating styles or theme';
    case EditType.REFACTOR:
      return 'Refactoring code for better quality';
    case EditType.FULL_REBUILD:
      return 'Complete rebuild requested';
    case EditType.ADD_DEPENDENCY:
      return 'Adding new dependency';
    case EditType.CREATE_NEW:
      return 'Creating new project or feature';
    default:
      return 'General code modification';
  }
}

// ============================================================================
// File Prioritization
// ============================================================================

/**
 * Build file info map with metadata
 */
function buildFileInfoMap(files: Map<string, string>): Map<string, FileInfo> {
  const fileInfos = new Map<string, FileInfo>();

  for (const [path, content] of files) {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const fileName = path.split('/').pop() || '';

    const info: FileInfo = {
      path,
      content,
      size: content.length,
      language: ext,
      isComponent:
        ['tsx', 'jsx'].includes(ext) &&
        (content.includes('export default') ||
          content.includes('export function') ||
          content.includes('React')),
      isConfig:
        fileName === 'package.json' ||
        fileName.includes('config') ||
        fileName.startsWith('.'),
      isStyle:
        ['css', 'scss', 'sass', 'less'].includes(ext) ||
        fileName.includes('style'),
      imports: extractImports(content),
      exports: extractExports(content),
    };

    fileInfos.set(path, info);
  }

  return fileInfos;
}

/**
 * Prioritize files based on prompt and intent
 */
function prioritizeFiles(
  prompt: string,
  files: Map<string, FileInfo>,
  intent: EditIntent
): Array<{ path: string; score: number }> {
  const scores: Array<{ path: string; score: number }> = [];
  const lowerPrompt = prompt.toLowerCase();
  const words = extractComponentNames(prompt);

  for (const [path, info] of files) {
    let score = 0;

    // Base score from file type
    const ext = info.language;
    score += CONFIG.fileTypePriority[ext] || 0;

    // Bonus if file name mentioned in prompt
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    const baseName = fileName.replace(/\.[^.]+$/, '');

    for (const word of words) {
      if (baseName.includes(word) || word.includes(baseName)) {
        score += CONFIG.priorityBonus.componentMentioned;
        break;
      }
    }

    // Bonus for entry points
    if (
      path.includes('App.tsx') ||
      path.includes('App.jsx') ||
      path.includes('main.tsx') ||
      path.includes('index.tsx')
    ) {
      score += CONFIG.priorityBonus.entryPoint;
    }

    // Bonus for config files when adding dependencies
    if (intent.type === EditType.ADD_DEPENDENCY && info.isConfig) {
      score += CONFIG.priorityBonus.configFile;
    }

    // Bonus for style files when updating styles
    if (intent.type === EditType.UPDATE_STYLE && info.isStyle) {
      score += CONFIG.priorityBonus.styleFile;
    }

    // Bonus if file is target
    if (intent.targetFiles.includes(path)) {
      score += 100;
    }

    // Penalty for node_modules
    if (path.includes('node_modules')) {
      score = -1000;
    }

    // Penalty for very large files
    if (info.size > 10000) {
      score -= 10;
    }

    scores.push({ path, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

/**
 * Select files within token budget
 */
function selectWithinBudget(
  prioritizedFiles: Array<{ path: string; score: number }>,
  files: Map<string, FileInfo>,
  maxTokens: number,
  intent: EditIntent
): ContextSelection {
  const primaryFiles: string[] = [];
  const contextFiles: string[] = [];
  const excludedFiles: string[] = [];
  let totalTokens = 0;

  // Reserve budget for primary files
  const primaryBudget = maxTokens * 0.6;
  const contextBudget = maxTokens * 0.4;

  // First pass: select primary files (targets)
  for (const { path, score } of prioritizedFiles) {
    if (score < 0) {
      excludedFiles.push(path);
      continue;
    }

    const info = files.get(path);
    if (!info) continue;

    const tokens = estimateTokens(info.content);

    // Primary file if it's a target or high score
    if (intent.targetFiles.includes(path) || score >= 50) {
      if (totalTokens + tokens <= primaryBudget) {
        primaryFiles.push(path);
        totalTokens += tokens;
      }
    }
  }

  // Second pass: select context files
  let contextTokens = 0;
  for (const { path, score } of prioritizedFiles) {
    if (primaryFiles.includes(path) || excludedFiles.includes(path)) continue;

    const info = files.get(path);
    if (!info) continue;

    const tokens = estimateTokens(info.content);

    if (contextTokens + tokens <= contextBudget) {
      contextFiles.push(path);
      contextTokens += tokens;
    } else if (score > 20) {
      // Still add important files but truncated
      contextFiles.push(path);
      contextTokens += Math.min(tokens, 500); // Assume truncation
    }
  }

  return {
    primaryFiles,
    contextFiles,
    excludedFiles,
    totalTokens: totalTokens + contextTokens,
    strategy: `intent:${intent.type}`,
  };
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for text
 */
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for code
  // More accurate would use a tokenizer, but this is fast
  return Math.ceil(text.length * CONFIG.tokensPerChar);
}

/**
 * Estimate total tokens for multiple files
 */
export function estimateTotalTokens(files: Map<string, string>): number {
  let total = 0;
  for (const content of files.values()) {
    total += estimateTokens(content);
  }
  return total;
}

// ============================================================================
// Import/Export Analysis
// ============================================================================

/**
 * Extract import statements from code
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES6 imports
  const es6Pattern = /import\s+(?:(?:\*\s+as\s+\w+)|(?:{\s*[^}]*\s*})|(?:\w+))?\s*,?\s*(?:(?:\*\s+as\s+\w+)|(?:{\s*[^}]*\s*})|(?:\w+))?\s*from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Pattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Extract export statements from code
 */
function extractExports(content: string): string[] {
  const exports: string[] = [];

  // Named exports
  const namedPattern = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  let match;
  while ((match = namedPattern.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // Default exports
  if (/export\s+default/.test(content)) {
    exports.push('default');
  }

  return exports;
}

// ============================================================================
// Context Compression
// ============================================================================

/**
 * Compress file content to fit within token limits
 */
export function compressContent(
  content: string,
  maxTokens: number
): { compressed: string; truncated: boolean } {
  const currentTokens = estimateTokens(content);

  if (currentTokens <= maxTokens) {
    return { compressed: content, truncated: false };
  }

  // Strategy 1: Remove comments
  let compressed = removeComments(content);
  if (estimateTokens(compressed) <= maxTokens) {
    return { compressed, truncated: true };
  }

  // Strategy 2: Remove empty lines and excess whitespace
  compressed = compressed
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+$/gm, '');

  if (estimateTokens(compressed) <= maxTokens) {
    return { compressed, truncated: true };
  }

  // Strategy 3: Truncate with summary
  const maxChars = maxTokens / CONFIG.tokensPerChar;
  const lines = compressed.split('\n');
  let result = '';
  let lineCount = 0;

  for (const line of lines) {
    if ((result + line).length > maxChars - 100) {
      break;
    }
    result += line + '\n';
    lineCount++;
  }

  result += `\n// ... [${lines.length - lineCount} more lines truncated]`;

  return { compressed: result, truncated: true };
}

/**
 * Remove comments from code
 */
function removeComments(code: string): string {
  // Remove single-line comments (but keep import/export lines)
  code = code.replace(/^(?!.*(?:import|export)).*\/\/.*$/gm, match => {
    // Keep if it's an important comment
    if (match.includes('TODO') || match.includes('FIXME') || match.includes('NOTE')) {
      return match;
    }
    return match.replace(/\/\/.*$/, '');
  });

  // Remove multi-line comments (but keep JSDoc)
  code = code.replace(/\/\*(?!\*)[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '');

  return code;
}

// ============================================================================
// Smart Context for Specific Tasks
// ============================================================================

/**
 * Get minimal context for simple fixes
 */
export function getMinimalContext(
  prompt: string,
  files: Map<string, string>,
  errorFile?: string
): ContextSelection {
  const primaryFiles: string[] = [];
  const contextFiles: string[] = [];

  // If error file specified, it's the primary target
  if (errorFile && files.has(errorFile)) {
    primaryFiles.push(errorFile);
  }

  // Always include package.json for dependency context
  for (const path of files.keys()) {
    if (path.endsWith('package.json')) {
      if (!primaryFiles.includes(path)) {
        contextFiles.push(path);
      }
    }
  }

  return {
    primaryFiles,
    contextFiles,
    excludedFiles: [],
    totalTokens: estimateTokens(
      [...primaryFiles, ...contextFiles].map(p => files.get(p) || '').join('\n')
    ),
    strategy: 'minimal',
  };
}

/**
 * Get component-focused context
 */
export function getComponentContext(
  componentName: string,
  files: Map<string, string>
): ContextSelection {
  const primaryFiles: string[] = [];
  const contextFiles: string[] = [];
  const lowerName = componentName.toLowerCase();

  for (const [path, content] of files) {
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    const baseName = fileName.replace(/\.[^.]+$/, '');

    if (baseName === lowerName || baseName.includes(lowerName)) {
      primaryFiles.push(path);
    } else if (
      path.includes('App.tsx') ||
      path.includes('App.jsx') ||
      path.endsWith('package.json')
    ) {
      contextFiles.push(path);
    }
  }

  return {
    primaryFiles,
    contextFiles,
    excludedFiles: [],
    totalTokens: estimateTokens(
      [...primaryFiles, ...contextFiles].map(p => files.get(p) || '').join('\n')
    ),
    strategy: 'component-focused',
  };
}
