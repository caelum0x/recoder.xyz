/**
 * Code Index Service for docker-backend
 * Real semantic code search using OpenAI embeddings
 * Runs inside Docker containers with full filesystem access
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ==================== Types ====================

export interface CodeBlock {
  id: string;
  filePath: string;
  name: string;
  type: 'function' | 'class' | 'method' | 'chunk';
  content: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface IndexedBlock extends CodeBlock {
  vector: number[];
}

export interface SearchResult {
  block: CodeBlock;
  score: number;
}

export interface IndexingProgress {
  status: 'idle' | 'scanning' | 'parsing' | 'embedding' | 'complete' | 'error';
  filesScanned: number;
  filesParsed: number;
  blocksIndexed: number;
  totalFiles: number;
  currentFile?: string;
  error?: string;
}

export interface IndexingResult {
  success: boolean;
  filesIndexed: number;
  blocksIndexed: number;
  tokensUsed: number;
  duration: number;
  error?: string;
}

// ==================== Vector Store ====================

interface VectorStore {
  blocks: IndexedBlock[];
  indexingComplete: boolean;
  lastUpdated: Date | null;
}

const vectorStores = new Map<string, VectorStore>();

function getVectorStore(projectId: string): VectorStore {
  let store = vectorStores.get(projectId);
  if (!store) {
    store = {
      blocks: [],
      indexingComplete: false,
      lastUpdated: null,
    };
    vectorStores.set(projectId, store);
  }
  return store;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

// ==================== OpenAI Embeddings ====================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;
const BATCH_SIZE = 50;

async function createEmbeddings(
  texts: string[],
  apiKey: string
): Promise<{ embeddings: number[][]; tokensUsed: number }> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };

  return {
    embeddings: data.data.map(d => d.embedding),
    tokensUsed: data.usage.total_tokens,
  };
}

// ==================== Code Parser ====================

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.cs': 'csharp',
};

function isSupported(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext in SUPPORTED_EXTENSIONS;
}

function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS[ext] || 'unknown';
}

// Simple regex-based parser for common patterns
function parseFile(filePath: string, content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const language = getLanguage(filePath);
  const lines = content.split('\n');

  // Function patterns by language
  const patterns: Record<string, RegExp[]> = {
    typescript: [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
      /^(?:export\s+)?class\s+(\w+)/,
      /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/,
    ],
    javascript: [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
      /^(?:export\s+)?class\s+(\w+)/,
      /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    ],
    python: [
      /^(?:async\s+)?def\s+(\w+)/,
      /^class\s+(\w+)/,
    ],
    go: [
      /^func\s+(?:\([^)]+\)\s+)?(\w+)/,
      /^type\s+(\w+)\s+struct/,
    ],
    rust: [
      /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
      /^(?:pub\s+)?struct\s+(\w+)/,
      /^(?:pub\s+)?impl(?:<[^>]+>)?\s+(\w+)/,
    ],
    java: [
      /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*\)/,
      /^(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)/,
    ],
  };

  const langPatterns = patterns[language] || patterns.typescript;
  let blockId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of langPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        const isClass = /class\s+/.test(line);

        // Find block end (simple brace counting)
        let braceCount = 0;
        let started = false;
        let endLine = i;

        for (let j = i; j < lines.length && j < i + 200; j++) {
          const checkLine = lines[j];
          for (const char of checkLine) {
            if (char === '{' || char === ':' && language === 'python') {
              braceCount++;
              started = true;
            }
            if (char === '}' || (language === 'python' && started && /^\S/.test(checkLine) && j > i)) {
              braceCount--;
            }
          }

          if (started && braceCount <= 0) {
            endLine = j;
            break;
          }
          endLine = j;
        }

        // Extract block content
        const blockContent = lines.slice(i, endLine + 1).join('\n');

        // Skip if too short or too long
        if (blockContent.length < 20 || blockContent.length > 10000) {
          continue;
        }

        blocks.push({
          id: `${filePath}:${blockId++}`,
          filePath,
          name,
          type: isClass ? 'class' : 'function',
          content: blockContent,
          startLine: i + 1,
          endLine: endLine + 1,
          language,
        });

        break; // Found a match, don't check other patterns
      }
    }
  }

  // If no blocks found, create chunks
  if (blocks.length === 0 && content.length > 100) {
    const chunkSize = 50; // lines per chunk
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunkContent = chunkLines.join('\n');

      if (chunkContent.trim().length > 50) {
        blocks.push({
          id: `${filePath}:chunk:${i}`,
          filePath,
          name: `chunk_${Math.floor(i / chunkSize)}`,
          type: 'chunk',
          content: chunkContent,
          startLine: i + 1,
          endLine: Math.min(i + chunkSize, lines.length),
          language,
        });
      }
    }
  }

  return blocks;
}

// ==================== Progress Tracking ====================

const progressMap = new Map<string, IndexingProgress>();

export function getIndexingProgress(projectId: string): IndexingProgress | null {
  return progressMap.get(projectId) || null;
}

// ==================== Main Functions ====================

const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.recoder',
]);

const IGNORED_FILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const IGNORED_FILE_SUFFIXES = ['.lock', '.min.js', '.min.css', '.map'];

function shouldIgnoreFile(fileName: string): boolean {
  return (
    IGNORED_FILE_NAMES.has(fileName) ||
    IGNORED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  );
}

async function collectWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentPath: string, relativeDir = ''): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          continue;
        }
        await walk(fullPath, relativePath);
        continue;
      }

      if (shouldIgnoreFile(entry.name) || !isSupported(relativePath)) {
        continue;
      }

      files.push(relativePath);
    }
  }

  await walk(workspacePath);
  return files;
}

/**
 * Index a workspace for semantic code search
 */
export async function indexWorkspace(
  projectId: string,
  workspacePath: string,
  openaiApiKey: string
): Promise<IndexingResult> {
  const startTime = Date.now();

  // Initialize progress
  const progress: IndexingProgress = {
    status: 'scanning',
    filesScanned: 0,
    filesParsed: 0,
    blocksIndexed: 0,
    totalFiles: 0,
  };
  progressMap.set(projectId, progress);

  try {
    console.log(`[CodeIndex] Starting indexing for ${projectId} at ${workspacePath}`);

    // Get or create vector store
    const store = getVectorStore(projectId);
    store.blocks = []; // Clear existing
    store.indexingComplete = false;

    // Scan for files
    progress.status = 'scanning';
    const files = await collectWorkspaceFiles(workspacePath);

    progress.totalFiles = files.length;
    console.log(`[CodeIndex] Found ${files.length} files to index`);

    // Parse files and collect code blocks
    progress.status = 'parsing';
    const allBlocks: CodeBlock[] = [];

    for (const file of files) {
      progress.filesScanned++;
      progress.currentFile = file;

      const fullPath = path.join(workspacePath, file);

      try {
        // Check file size (skip large files)
        const stats = await fs.stat(fullPath);
        if (stats.size > 1024 * 1024) { // 1MB limit
          console.log(`[CodeIndex] Skipping large file: ${file}`);
          continue;
        }

        // Check if supported
        if (!isSupported(file)) {
          continue;
        }

        // Read and parse file
        const content = await fs.readFile(fullPath, 'utf-8');
        const blocks = parseFile(file, content);

        allBlocks.push(...blocks);
        progress.filesParsed++;
      } catch (error) {
        console.warn(`[CodeIndex] Error parsing ${file}:`, error);
      }
    }

    console.log(`[CodeIndex] Parsed ${allBlocks.length} code blocks from ${progress.filesParsed} files`);

    if (allBlocks.length === 0) {
      progress.status = 'complete';
      store.indexingComplete = true;
      store.lastUpdated = new Date();
      return {
        success: true,
        filesIndexed: progress.filesParsed,
        blocksIndexed: 0,
        tokensUsed: 0,
        duration: Date.now() - startTime,
      };
    }

    // Create embeddings in batches
    progress.status = 'embedding';
    let totalTokens = 0;

    for (let i = 0; i < allBlocks.length; i += BATCH_SIZE) {
      const batch = allBlocks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(b => `${b.name} (${b.type}):\n${b.content.slice(0, 2000)}`);

      try {
        const { embeddings, tokensUsed } = await createEmbeddings(texts, openaiApiKey);
        totalTokens += tokensUsed;

        // Store indexed blocks
        for (let j = 0; j < batch.length; j++) {
          store.blocks.push({
            ...batch[j],
            vector: embeddings[j],
          });
        }

        progress.blocksIndexed += batch.length;
        console.log(`[CodeIndex] Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allBlocks.length / BATCH_SIZE)}`);
      } catch (error) {
        console.error(`[CodeIndex] Error embedding batch:`, error);
        throw error;
      }
    }

    // Mark complete
    store.indexingComplete = true;
    store.lastUpdated = new Date();
    progress.status = 'complete';
    progress.currentFile = undefined;

    const duration = Date.now() - startTime;
    console.log(`[CodeIndex] Complete: ${progress.blocksIndexed} blocks from ${progress.filesParsed} files in ${duration}ms`);

    return {
      success: true,
      filesIndexed: progress.filesParsed,
      blocksIndexed: progress.blocksIndexed,
      tokensUsed: totalTokens,
      duration,
    };
  } catch (error) {
    progress.status = 'error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      filesIndexed: progress.filesParsed,
      blocksIndexed: progress.blocksIndexed,
      tokensUsed: 0,
      duration: Date.now() - startTime,
      error: progress.error,
    };
  }
}

/**
 * Search indexed code semantically
 */
export async function searchCode(
  projectId: string,
  query: string,
  openaiApiKey: string,
  maxResults: number = 10,
  directoryPrefix?: string
): Promise<{ success: boolean; results: SearchResult[]; error?: string }> {
  try {
    const store = getVectorStore(projectId);

    if (store.blocks.length === 0) {
      return {
        success: false,
        results: [],
        error: 'No index found. Run index action first.',
      };
    }

    // Create embedding for query
    const { embeddings } = await createEmbeddings([query], openaiApiKey);
    const queryVector = embeddings[0];

    // Search with cosine similarity
    let candidates = store.blocks;

    // Filter by directory prefix if specified
    if (directoryPrefix) {
      candidates = candidates.filter(b => b.filePath.startsWith(directoryPrefix));
    }

    const results: SearchResult[] = candidates
      .map(block => ({
        block: {
          id: block.id,
          filePath: block.filePath,
          name: block.name,
          type: block.type,
          content: block.content,
          startLine: block.startLine,
          endLine: block.endLine,
          language: block.language,
        },
        score: cosineSimilarity(queryVector, block.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return { success: true, results };
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'Search failed',
    };
  }
}

/**
 * Get index stats
 */
export function getIndexStats(projectId: string): {
  indexed: boolean;
  totalBlocks: number;
  totalFiles: number;
  lastUpdated: Date | null;
} {
  const store = getVectorStore(projectId);
  const filePaths = new Set(store.blocks.map(b => b.filePath));

  return {
    indexed: store.indexingComplete,
    totalBlocks: store.blocks.length,
    totalFiles: filePaths.size,
    lastUpdated: store.lastUpdated,
  };
}

/**
 * Clear project index
 */
export function clearIndex(projectId: string): void {
  vectorStores.delete(projectId);
  progressMap.delete(projectId);
  console.log(`[CodeIndex] Cleared index for ${projectId}`);
}

/**
 * Check if project is indexed
 */
export function isIndexed(projectId: string): boolean {
  const store = vectorStores.get(projectId);
  return store?.indexingComplete ?? false;
}
