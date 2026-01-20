/**
 * Simple code parser for semantic chunking
 * Uses regex-based detection for functions/classes
 * Falls back to line-based chunking
 */

import type { CodeBlock } from './vector-store.js';
import crypto from 'crypto';

export interface ParserConfig {
  maxChunkSize?: number;
  minChunkSize?: number;
  chunkOverlap?: number;
}

const DEFAULT_MAX_CHUNK_SIZE = 1000; // characters
const DEFAULT_MIN_CHUNK_SIZE = 50;
const DEFAULT_CHUNK_OVERLAP = 50;

// Supported file extensions for code indexing
const SUPPORTED_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyw',
  // Rust
  '.rs',
  // Go
  '.go',
  // Java/Kotlin
  '.java', '.kt', '.kts',
  // C/C++
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  // C#
  '.cs',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Swift
  '.swift',
  // Markdown/Docs
  '.md', '.mdx',
  // Config
  '.json', '.yaml', '.yml', '.toml',
  // Web
  '.html', '.css', '.scss', '.less',
  // SQL
  '.sql',
  // Shell
  '.sh', '.bash', '.zsh',
]);

// Language-specific patterns for function/class detection
const PATTERNS: Record<string, { function: RegExp; class: RegExp }> = {
  typescript: {
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm,
  },
  javascript: {
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    class: /^(?:export\s+)?class\s+(\w+)/gm,
  },
  python: {
    function: /^def\s+(\w+)\s*\(/gm,
    class: /^class\s+(\w+)/gm,
  },
  rust: {
    function: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm,
    class: /^(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/gm,
  },
  go: {
    function: /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm,
    class: /^type\s+(\w+)\s+struct/gm,
  },
  java: {
    function: /^(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/gm,
    class: /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/gm,
  },
};

/**
 * Parse a file into semantic code blocks
 */
export function parseFile(
  filePath: string,
  content: string,
  config?: ParserConfig
): CodeBlock[] {
  const ext = getExtension(filePath);

  if (!isSupported(filePath)) {
    return [];
  }

  const maxSize = config?.maxChunkSize || DEFAULT_MAX_CHUNK_SIZE;
  const minSize = config?.minChunkSize || DEFAULT_MIN_CHUNK_SIZE;

  // Skip empty or very small files
  if (content.length < minSize) {
    return [];
  }

  // Try semantic parsing first
  const language = getLanguage(ext);
  let blocks: CodeBlock[] = [];

  if (language && PATTERNS[language]) {
    blocks = parseWithPatterns(filePath, content, language);
  }

  // Fall back to chunk-based parsing if no semantic blocks found
  if (blocks.length === 0) {
    blocks = parseIntoChunks(filePath, content, maxSize, minSize);
  }

  return blocks;
}

/**
 * Check if a file extension is supported
 */
export function isSupported(filePath: string): boolean {
  const ext = getExtension(filePath);
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Get supported extensions list
 */
export function getSupportedExtensions(): string[] {
  return Array.from(SUPPORTED_EXTENSIONS);
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

function getLanguage(ext: string): string | null {
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.pyw': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'java', // Kotlin uses similar patterns
  };
  return langMap[ext] || null;
}

/**
 * Parse using language-specific patterns
 */
function parseWithPatterns(
  filePath: string,
  content: string,
  language: string
): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = content.split('\n');
  const patterns = PATTERNS[language];

  // Find functions
  const funcMatches = findPatternMatches(content, patterns.function);
  for (const match of funcMatches) {
    const block = extractBlock(filePath, content, lines, match, 'function');
    if (block) blocks.push(block);
  }

  // Find classes
  const classMatches = findPatternMatches(content, patterns.class);
  for (const match of classMatches) {
    const block = extractBlock(filePath, content, lines, match, 'class');
    if (block) blocks.push(block);
  }

  return blocks;
}

interface PatternMatch {
  name: string;
  startIndex: number;
  line: number;
}

function findPatternMatches(content: string, pattern: RegExp): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const lines = content.split('\n');
  let currentIndex = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    pattern.lastIndex = 0;
    const match = pattern.exec(line);

    if (match) {
      matches.push({
        name: match[1] || 'anonymous',
        startIndex: currentIndex + (match.index || 0),
        line: lineNum + 1,
      });
    }

    currentIndex += line.length + 1; // +1 for newline
  }

  return matches;
}

function extractBlock(
  filePath: string,
  content: string,
  lines: string[],
  match: PatternMatch,
  type: 'function' | 'class'
): CodeBlock | null {
  const startLine = match.line;
  let endLine = startLine;

  // Find the end of the block using brace/indent matching
  let braceCount = 0;
  let foundStart = false;

  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      if (char === '{' || char === '(') {
        braceCount++;
        foundStart = true;
      } else if (char === '}' || char === ')') {
        braceCount--;
      }
    }

    // For Python, use indentation instead
    if (!foundStart && i > startLine - 1) {
      const currentIndent = getIndent(lines[i]);
      const startIndent = getIndent(lines[startLine - 1]);
      if (currentIndent <= startIndent && lines[i].trim().length > 0) {
        endLine = i;
        break;
      }
    }

    if (foundStart && braceCount === 0) {
      endLine = i + 1;
      break;
    }

    endLine = i + 1;

    // Limit block size
    if (endLine - startLine > 100) {
      endLine = startLine + 100;
      break;
    }
  }

  const blockContent = lines.slice(startLine - 1, endLine).join('\n');

  if (blockContent.length < DEFAULT_MIN_CHUNK_SIZE) {
    return null;
  }

  return {
    id: generateBlockId(filePath, startLine, endLine),
    filePath,
    content: blockContent,
    startLine,
    endLine,
    type,
  };
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Parse content into fixed-size chunks
 */
function parseIntoChunks(
  filePath: string,
  content: string,
  maxSize: number,
  minSize: number
): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = content.split('\n');

  let currentChunk: string[] = [];
  let chunkStartLine = 1;
  let currentSize = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineSize = line.length + 1; // +1 for newline

    if (currentSize + lineSize > maxSize && currentChunk.length > 0) {
      // Save current chunk
      const chunkContent = currentChunk.join('\n');
      if (chunkContent.length >= minSize) {
        blocks.push({
          id: generateBlockId(filePath, chunkStartLine, i),
          filePath,
          content: chunkContent,
          startLine: chunkStartLine,
          endLine: i,
          type: 'chunk',
        });
      }

      // Start new chunk
      currentChunk = [];
      chunkStartLine = i + 1;
      currentSize = 0;
    }

    currentChunk.push(line);
    currentSize += lineSize;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n');
    if (chunkContent.length >= minSize) {
      blocks.push({
        id: generateBlockId(filePath, chunkStartLine, lines.length),
        filePath,
        content: chunkContent,
        startLine: chunkStartLine,
        endLine: lines.length,
        type: 'chunk',
      });
    }
  }

  return blocks;
}

function generateBlockId(filePath: string, startLine: number, endLine: number): string {
  const input = `${filePath}:${startLine}:${endLine}`;
  return crypto.createHash('md5').update(input).digest('hex');
}
