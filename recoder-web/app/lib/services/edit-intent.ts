/**
 * Edit Intent Analyzer
 * Analyzes user prompts to determine edit intent and select relevant files
 *
 * Inspired by open-lovable's edit-intent-analyzer
 * Adapted for recoder-web with Docker backend integration
 *
 * Features:
 * 1. Detect edit intent from user prompts
 * 2. Map user intent to target files
 * 3. Confidence scoring (high/medium/low)
 * 4. File resolution based on keywords
 * 5. Reduce token usage by providing focused context
 */

import { loadProjectContext, parseFileReferences, type ProjectContext, type FileContext } from './code-context';

// Edit types for classifying user intent
export enum EditType {
  UPDATE_COMPONENT = 'UPDATE_COMPONENT',    // "update the header", "change button color"
  ADD_FEATURE = 'ADD_FEATURE',              // "add a videos page", "create new component"
  FIX_ISSUE = 'FIX_ISSUE',                  // "fix the styling", "resolve error"
  REFACTOR = 'REFACTOR',                    // "reorganize", "clean up"
  FULL_REBUILD = 'FULL_REBUILD',            // "start over", "recreate everything"
  UPDATE_STYLE = 'UPDATE_STYLE',            // "change colors", "update theme"
  ADD_DEPENDENCY = 'ADD_DEPENDENCY',        // "install package", "add library"
  GENERAL_QUERY = 'GENERAL_QUERY',          // "how do I...", "explain..."
}

// Confidence levels for intent detection
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Result of intent analysis
export interface EditIntent {
  type: EditType;
  targetFiles: string[];           // Predicted files to edit
  confidence: number;              // 0-1 confidence score
  confidenceLevel: ConfidenceLevel;
  description: string;             // Human-readable description
  suggestedContext: string[];      // Additional files to include for context
  keywords: string[];              // Keywords that triggered this intent
}

// Pattern for intent detection
interface IntentPattern {
  patterns: RegExp[];
  type: EditType;
  fileResolver: (prompt: string, context: ProjectContext | null) => string[];
}

// File manifest simplified for recoder (maps to ProjectContext)
interface FileManifest {
  files: Map<string, FileContext>;
  entryPoints: string[];
  styleFiles: string[];
  configFiles: string[];
}

/**
 * Analyze user prompt to determine edit intent
 */
export function analyzeEditIntent(
  prompt: string,
  context: ProjectContext | null
): EditIntent {
  const lowerPrompt = prompt.toLowerCase();
  const manifest = contextToManifest(context);

  // Define intent patterns (order matters - more specific patterns first)
  const patterns: IntentPattern[] = [
    // Full rebuild - highest priority when matched
    {
      patterns: [
        /start\s+over/i,
        /recreate\s+everything/i,
        /rebuild\s+(the\s+)?app/i,
        /new\s+app/i,
        /from\s+scratch/i,
        /completely\s+rewrite/i,
      ],
      type: EditType.FULL_REBUILD,
      fileResolver: (p, c) => getEntryPoints(c),
    },
    // Add dependency
    {
      patterns: [
        /install\s+(\w+)/i,
        /add\s+(\w+)\s+(package|library|dependency)/i,
        /use\s+(\w+)\s+(library|framework)/i,
        /npm\s+install/i,
        /yarn\s+add/i,
        /pnpm\s+add/i,
      ],
      type: EditType.ADD_DEPENDENCY,
      fileResolver: (p, c) => findPackageFiles(c),
    },
    // Update component - match content or component mentions
    {
      patterns: [
        /update\s+(the\s+)?(\w+)\s+(component|section|page)/i,
        /change\s+(the\s+)?(\w+)/i,
        /modify\s+(the\s+)?(\w+)/i,
        /edit\s+(the\s+)?(\w+)/i,
        /remove\s+.*\s+(button|link|text|element|section)/i,
        /delete\s+.*\s+(button|link|text|element|section)/i,
        /hide\s+.*\s+(button|link|text|element|section)/i,
        /show\s+.*\s+(button|link|text|element|section)/i,
        /toggle\s+.*\s+(button|link|text|element|section)/i,
      ],
      type: EditType.UPDATE_COMPONENT,
      fileResolver: (p, c) => findComponentByContent(p, c),
    },
    // Add feature
    {
      patterns: [
        /add\s+(a\s+)?new\s+(\w+)\s+(page|section|feature|component)/i,
        /create\s+(a\s+)?(\w+)\s+(page|section|feature|component)/i,
        /implement\s+(a\s+)?(\w+)\s+(page|section|feature)/i,
        /build\s+(a\s+)?(\w+)\s+(page|section|feature)/i,
        /add\s+(\w+)\s+to\s+(?:the\s+)?(\w+)/i,
        /add\s+(?:a\s+)?(\w+)\s+(?:component|section)/i,
        /include\s+(?:a\s+)?(\w+)/i,
        /make\s+(?:a\s+)?new/i,
      ],
      type: EditType.ADD_FEATURE,
      fileResolver: (p, c) => findFeatureInsertionPoints(p, c),
    },
    // Fix issue
    {
      patterns: [
        /fix\s+(the\s+)?(\w+|\w+\s+\w+)(?!\s+styling|\s+style)/i,
        /resolve\s+(the\s+)?error/i,
        /debug\s+(the\s+)?(\w+)/i,
        /repair\s+(the\s+)?(\w+)/i,
        /not\s+working/i,
        /broken/i,
        /bug\s+in/i,
        /error\s+in/i,
      ],
      type: EditType.FIX_ISSUE,
      fileResolver: (p, c) => findProblemFiles(p, c),
    },
    // Update style
    {
      patterns: [
        /change\s+(the\s+)?(color|theme|style|styling|css)/i,
        /update\s+(the\s+)?(color|theme|style|styling|css)/i,
        /make\s+it\s+(dark|light|blue|red|green|bigger|smaller)/i,
        /style\s+(the\s+)?(\w+)/i,
        /fix\s+(the\s+)?(\w+)\s+(styling|style|css|layout)/i,
        /responsive/i,
        /mobile\s+friendly/i,
        /dark\s+mode/i,
        /light\s+mode/i,
      ],
      type: EditType.UPDATE_STYLE,
      fileResolver: (p, c) => findStyleFiles(p, c),
    },
    // Refactor
    {
      patterns: [
        /refactor\s+(the\s+)?(\w+)/i,
        /clean\s+up\s+(the\s+)?code/i,
        /reorganize\s+(the\s+)?(\w+)/i,
        /optimize\s+(the\s+)?(\w+)/i,
        /simplify\s+(the\s+)?(\w+)/i,
        /improve\s+(the\s+)?code/i,
        /split\s+(the\s+)?(\w+)/i,
        /extract\s+(the\s+)?(\w+)/i,
      ],
      type: EditType.REFACTOR,
      fileResolver: (p, c) => findRefactorTargets(p, c),
    },
    // General query (low priority - fallback)
    {
      patterns: [
        /how\s+(do|can|should)\s+i/i,
        /explain\s+/i,
        /what\s+(is|are)/i,
        /why\s+(does|is)/i,
        /help\s+me\s+understand/i,
      ],
      type: EditType.GENERAL_QUERY,
      fileResolver: (p, c) => [],
    },
  ];

  // Find matching pattern
  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(lowerPrompt)) {
        const targetFiles = pattern.fileResolver(prompt, context);
        const suggestedContext = getSuggestedContext(targetFiles, context);
        const confidence = calculateConfidence(prompt, pattern, targetFiles);
        const keywords = extractKeywords(prompt, regex);

        return {
          type: pattern.type,
          targetFiles,
          confidence,
          confidenceLevel: getConfidenceLevel(confidence),
          description: generateDescription(pattern.type, prompt, targetFiles),
          suggestedContext,
          keywords,
        };
      }
    }
  }

  // Default: Component update with low confidence
  const entryPoints = getEntryPoints(context);
  return {
    type: EditType.UPDATE_COMPONENT,
    targetFiles: entryPoints.length > 0 ? [entryPoints[0]] : [],
    confidence: 0.3,
    confidenceLevel: 'low',
    description: 'General update to application',
    suggestedContext: [],
    keywords: [],
  };
}

/**
 * Analyze intent asynchronously (loads context if needed)
 */
export async function analyzeEditIntentAsync(
  prompt: string,
  projectId: string
): Promise<EditIntent> {
  const context = await loadProjectContext(projectId);
  return analyzeEditIntent(prompt, context);
}

/**
 * Convert ProjectContext to FileManifest format
 */
function contextToManifest(context: ProjectContext | null): FileManifest {
  if (!context) {
    return {
      files: new Map(),
      entryPoints: [],
      styleFiles: [],
      configFiles: [],
    };
  }

  const styleFiles: string[] = [];
  const configFiles: string[] = [];

  for (const [path] of context.files) {
    if (path.endsWith('.css') || path.endsWith('.scss') || path.endsWith('.less')) {
      styleFiles.push(path);
    }
    if (path.includes('config') || path.endsWith('.config.ts') || path.endsWith('.config.js') ||
        path === 'package.json' || path === 'tsconfig.json') {
      configFiles.push(path);
    }
  }

  return {
    files: context.files,
    entryPoints: context.entryPoints,
    styleFiles,
    configFiles,
  };
}

/**
 * Get entry points from context
 */
function getEntryPoints(context: ProjectContext | null): string[] {
  if (!context) return [];

  if (context.entryPoints.length > 0) {
    return context.entryPoints;
  }

  // Try to find common entry points
  const commonEntryPoints = [
    'src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js',
    'src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js',
    'src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js',
    'app/page.tsx', 'app/page.jsx', // Next.js
    'pages/index.tsx', 'pages/index.jsx', // Next.js pages dir
  ];

  for (const ep of commonEntryPoints) {
    if (context.files.has(ep)) {
      return [ep];
    }
  }

  return [];
}

/**
 * Find component files by searching for content mentioned in the prompt
 */
function findComponentByContent(prompt: string, context: ProjectContext | null): string[] {
  if (!context) return [];

  const files: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  // Extract quoted strings or specific element text
  const quotedStrings = prompt.match(/["']([^"']+)["']/g) || [];
  const searchTerms: string[] = quotedStrings.map(s => s.replace(/["']/g, ''));

  // Also look for specific terms after action words
  const actionMatch = prompt.match(/(?:remove|delete|hide|update|change|modify|fix)\s+(?:the\s+)?(.+?)(?:\s+button|\s+link|\s+text|\s+element|\s+section|\s+component|$)/i);
  if (actionMatch) {
    searchTerms.push(actionMatch[1].trim());
  }

  // Search for terms in file contents
  if (searchTerms.length > 0) {
    for (const [path, fileInfo] of context.files) {
      // Only search in component files
      if (!isComponentFile(path)) continue;

      const content = fileInfo.content.toLowerCase();

      for (const term of searchTerms) {
        if (content.includes(term.toLowerCase())) {
          files.push(path);
          break;
        }
      }
    }
  }

  // If no files found by content, search by component name
  if (files.length === 0) {
    return findComponentByName(prompt, context);
  }

  // Return only the first match to avoid editing multiple files
  return files.length > 0 ? [files[0]] : getEntryPoints(context);
}

/**
 * Find component files by name
 */
function findComponentByName(prompt: string, context: ProjectContext | null): string[] {
  if (!context) return [];

  const files: string[] = [];
  const componentWords = extractComponentNames(prompt);

  // Look for exact component file matches
  for (const [path] of context.files) {
    const fileName = path.split('/').pop()?.toLowerCase() || '';

    for (const word of componentWords) {
      if (fileName.includes(word)) {
        files.push(path);
        break;
      }
    }
  }

  // If no specific component found, check for common UI elements
  if (files.length === 0) {
    const uiElements = [
      'header', 'footer', 'nav', 'navbar', 'sidebar', 'menu',
      'button', 'card', 'modal', 'dialog', 'form',
      'hero', 'banner', 'about', 'services', 'features',
      'testimonials', 'gallery', 'contact', 'team', 'pricing',
      'layout', 'container', 'wrapper', 'page', 'home',
    ];

    const lowerPrompt = prompt.toLowerCase();
    for (const element of uiElements) {
      if (lowerPrompt.includes(element)) {
        for (const [path] of context.files) {
          const fileName = path.split('/').pop()?.toLowerCase() || '';
          if (fileName.includes(element)) {
            return [path]; // Return immediately with just this file
          }
        }
      }
    }
  }

  // Limit to first match
  return files.length > 0 ? [files[0]] : getEntryPoints(context);
}

/**
 * Find where to add new features
 */
function findFeatureInsertionPoints(prompt: string, context: ProjectContext | null): string[] {
  if (!context) return [];

  const files: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  // For new pages, include routing files and layout
  if (lowerPrompt.includes('page')) {
    // Find router configuration
    for (const [path, fileInfo] of context.files) {
      if (fileInfo.content.includes('Route') ||
          fileInfo.content.includes('createBrowserRouter') ||
          path.includes('router') ||
          path.includes('routes')) {
        files.push(path);
      }
    }

    // Add App file for navigation updates
    const entryPoints = getEntryPoints(context);
    if (entryPoints.length > 0) {
      files.push(...entryPoints);
    }
  }

  // For new components/sections, find appropriate parent
  if (lowerPrompt.includes('component') || lowerPrompt.includes('section') ||
      lowerPrompt.includes('add') || lowerPrompt.includes('create')) {
    // Extract where to add it
    const locationMatch = prompt.match(/(?:in|to|on|inside)\s+(?:the\s+)?(\w+)/i);
    if (locationMatch) {
      const location = locationMatch[1];
      const parentFiles = findComponentByName(location, context);
      files.push(...parentFiles);
    } else {
      // Default to entry point
      const entryPoints = getEntryPoints(context);
      if (entryPoints.length > 0 && files.length === 0) {
        files.push(...entryPoints);
      }
    }
  }

  // Remove duplicates
  return [...new Set(files)];
}

/**
 * Find files that might have problems
 */
function findProblemFiles(prompt: string, context: ProjectContext | null): string[] {
  if (!context) return [];

  const files: string[] = [];

  // First check for specific component mentions
  const componentFiles = findComponentByName(prompt, context);
  files.push(...componentFiles);

  // If no specific files found, include entry points
  if (files.length === 0) {
    files.push(...getEntryPoints(context));
  }

  return [...new Set(files)];
}

/**
 * Find style-related files
 */
function findStyleFiles(prompt: string, context: ProjectContext | null): string[] {
  if (!context) return [];

  const files: string[] = [];

  // Add all CSS files
  for (const [path] of context.files) {
    if (path.endsWith('.css') || path.endsWith('.scss') || path.endsWith('.less')) {
      files.push(path);
    }
  }

  // Check for Tailwind config
  for (const [path] of context.files) {
    if (path.includes('tailwind.config')) {
      files.push(path);
      break;
    }
  }

  // If specific component styling mentioned, include that component
  const componentFiles = findComponentByName(prompt, context);
  files.push(...componentFiles);

  return [...new Set(files)];
}

/**
 * Find files to refactor
 */
function findRefactorTargets(prompt: string, context: ProjectContext | null): string[] {
  // Similar to findComponentByContent but can be broader
  return findComponentByContent(prompt, context);
}

/**
 * Find package configuration files
 */
function findPackageFiles(context: ProjectContext | null): string[] {
  if (!context) return [];

  const files: string[] = [];

  for (const [path] of context.files) {
    if (path.endsWith('package.json') ||
        path.endsWith('vite.config.js') ||
        path.endsWith('vite.config.ts') ||
        path.endsWith('tsconfig.json')) {
      files.push(path);
    }
  }

  return files;
}

/**
 * Extract component names from prompt
 */
function extractComponentNames(prompt: string): string[] {
  const words: string[] = [];

  // Remove common words but keep component-related words
  const cleanPrompt = prompt
    .replace(/\b(the|a|an|in|on|to|from|update|change|modify|edit|fix|make|add|create|delete|remove)\b/gi, '')
    .toLowerCase();

  // Extract potential component names
  const matches = cleanPrompt.match(/\b\w+\b/g) || [];

  for (const match of matches) {
    if (match.length > 2) { // Skip very short words
      words.push(match);
    }
  }

  return words;
}

/**
 * Check if file is a component file
 */
function isComponentFile(path: string): boolean {
  return path.endsWith('.tsx') || path.endsWith('.jsx') ||
         path.endsWith('.ts') || path.endsWith('.js');
}

/**
 * Get additional files for context
 */
function getSuggestedContext(targetFiles: string[], context: ProjectContext | null): string[] {
  if (!context) return [];

  const suggested: string[] = [];

  // Always include config files for context
  for (const [path] of context.files) {
    if (path === 'package.json' || path === 'tsconfig.json') {
      suggested.push(path);
    }
  }

  // Add files that import the target files
  for (const [path, fileInfo] of context.files) {
    if (targetFiles.includes(path)) continue;

    for (const targetFile of targetFiles) {
      const targetName = targetFile.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
      if (fileInfo.imports.some(imp => imp.includes(targetName))) {
        suggested.push(path);
        break;
      }
    }
  }

  // Add files that target files import
  for (const targetFile of targetFiles) {
    const fileInfo = context.files.get(targetFile);
    if (fileInfo) {
      for (const imp of fileInfo.imports) {
        // Try to resolve the import to a file
        if (imp.startsWith('.') || imp.startsWith('/')) {
          for (const [path] of context.files) {
            const importBase = imp.replace(/^\.\/|^\.\.\//, '').replace(/\.[^.]+$/, '');
            if (path.includes(importBase)) {
              suggested.push(path);
              break;
            }
          }
        }
      }
    }
  }

  // Remove duplicates and target files
  return [...new Set(suggested)].filter(f => !targetFiles.includes(f));
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  prompt: string,
  pattern: IntentPattern,
  targetFiles: string[]
): number {
  let confidence = 0.5; // Base confidence

  // Higher confidence if we found specific files
  if (targetFiles.length > 0) {
    confidence += 0.2;
  }

  // Higher confidence for more specific prompts
  if (prompt.split(' ').length > 5) {
    confidence += 0.1;
  }

  // Higher confidence for exact pattern matches
  for (const regex of pattern.patterns) {
    if (regex.test(prompt)) {
      confidence += 0.2;
      break;
    }
  }

  // Higher confidence if files are referenced explicitly
  const explicitRefs = parseFileReferences(prompt);
  if (explicitRefs.length > 0) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Get confidence level from score
 */
function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Extract keywords that triggered the intent
 */
function extractKeywords(prompt: string, regex: RegExp): string[] {
  const match = regex.exec(prompt);
  if (!match) return [];

  // Extract captured groups
  const keywords: string[] = [];
  for (let i = 1; i < match.length; i++) {
    if (match[i]) {
      keywords.push(match[i].trim());
    }
  }

  return keywords;
}

/**
 * Generate human-readable description
 */
function generateDescription(
  type: EditType,
  prompt: string,
  targetFiles: string[]
): string {
  const fileNames = targetFiles.map(f => f.split('/').pop()).join(', ');

  switch (type) {
    case EditType.UPDATE_COMPONENT:
      return fileNames ? `Updating component(s): ${fileNames}` : 'Updating component';
    case EditType.ADD_FEATURE:
      return fileNames ? `Adding new feature to: ${fileNames}` : 'Adding new feature';
    case EditType.FIX_ISSUE:
      return fileNames ? `Fixing issue in: ${fileNames}` : 'Fixing issue';
    case EditType.UPDATE_STYLE:
      return fileNames ? `Updating styles in: ${fileNames}` : 'Updating styles';
    case EditType.REFACTOR:
      return fileNames ? `Refactoring: ${fileNames}` : 'Refactoring code';
    case EditType.FULL_REBUILD:
      return 'Rebuilding entire application';
    case EditType.ADD_DEPENDENCY:
      return 'Adding new dependency';
    case EditType.GENERAL_QUERY:
      return 'Answering question';
    default:
      return fileNames ? `Editing: ${fileNames}` : 'Making changes';
  }
}

/**
 * Format intent for display in UI
 */
export function formatIntentForDisplay(intent: EditIntent): string {
  const parts: string[] = [];

  parts.push(`Intent: ${intent.type.replace(/_/g, ' ')}`);
  parts.push(`Confidence: ${intent.confidenceLevel} (${Math.round(intent.confidence * 100)}%)`);

  if (intent.targetFiles.length > 0) {
    parts.push(`Files: ${intent.targetFiles.join(', ')}`);
  }

  if (intent.suggestedContext.length > 0) {
    parts.push(`Context: ${intent.suggestedContext.length} related file(s)`);
  }

  return parts.join(' | ');
}

/**
 * Generate focused context prompt based on intent
 * This reduces token usage by only including relevant files
 */
export function generateFocusedContext(
  intent: EditIntent,
  context: ProjectContext | null,
  maxTokens: number = 4000
): string {
  if (!context || !intent.targetFiles.length) {
    return '';
  }

  const lines: string[] = [];
  lines.push('<focused_context>');
  lines.push(`<!-- Intent: ${intent.description} -->`);
  lines.push(`<!-- Confidence: ${intent.confidenceLevel} (${Math.round(intent.confidence * 100)}%) -->`);

  // Add framework info
  if (context.framework) {
    lines.push(`\nFramework: ${context.framework}`);
  }

  // Calculate token budget
  let tokenEstimate = 0;
  const maxFileTokens = maxTokens - 200;

  // Priority 1: Target files (full content)
  lines.push('\n<target_files>');
  lines.push('<!-- These are the files that will likely be modified -->');

  for (const targetPath of intent.targetFiles) {
    const fileInfo = context.files.get(targetPath);
    if (fileInfo) {
      const fileContent = `\n<file path="${targetPath}" language="${fileInfo.language}">\n${fileInfo.content}\n</file>`;
      const fileTokens = estimateTokens(fileContent);
      if (tokenEstimate + fileTokens < maxFileTokens) {
        lines.push(fileContent);
        tokenEstimate += fileTokens;
      }
    }
  }
  lines.push('</target_files>');

  // Priority 2: Context files (if we have token budget)
  if (intent.suggestedContext.length > 0 && tokenEstimate < maxFileTokens * 0.7) {
    lines.push('\n<context_files>');
    lines.push('<!-- Related files for reference -->');

    for (const contextPath of intent.suggestedContext) {
      const fileInfo = context.files.get(contextPath);
      if (fileInfo) {
        const fileContent = `\n<file path="${contextPath}" language="${fileInfo.language}">\n${fileInfo.content}\n</file>`;
        const fileTokens = estimateTokens(fileContent);
        if (tokenEstimate + fileTokens < maxFileTokens) {
          lines.push(fileContent);
          tokenEstimate += fileTokens;
        }
      }
    }
    lines.push('</context_files>');
  }

  // Add file structure overview
  lines.push('\n<file_structure>');
  const allPaths = Array.from(context.files.keys()).sort();
  lines.push(allPaths.slice(0, 30).join('\n')); // Limit to 30 files
  if (allPaths.length > 30) {
    lines.push(`... and ${allPaths.length - 30} more files`);
  }
  lines.push('</file_structure>');

  lines.push('</focused_context>');

  return lines.join('\n');
}

/**
 * Estimate token count for a string
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Get affected files preview for UI
 */
export function getAffectedFilesPreview(intent: EditIntent): {
  willModify: string[];
  mayReference: string[];
  confidence: ConfidenceLevel;
} {
  return {
    willModify: intent.targetFiles,
    mayReference: intent.suggestedContext,
    confidence: intent.confidenceLevel,
  };
}
