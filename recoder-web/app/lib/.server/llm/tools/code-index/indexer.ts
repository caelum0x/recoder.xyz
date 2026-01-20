/**
 * Code Indexer Service
 * Orchestrates parsing, embedding, and storing code for semantic search
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { createEmbeddings, getEmbeddingDimension, type EmbedderConfig } from './embedder.js';
import { getVectorStore, clearVectorStore, type CodeBlock, type IndexedBlock } from './vector-store.js';
import { parseFile, isSupported, getSupportedExtensions } from './parser.js';

export interface IndexerConfig {
  projectId: string;
  workspacePath: string;
  openaiApiKey: string;
  embeddingModel?: string;
  batchSize?: number;
  maxFileSize?: number;
  ignorePatterns?: string[];
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

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
];

// Track indexing progress per project
const progressMap = new Map<string, IndexingProgress>();

/**
 * Index a workspace for semantic code search
 */
export async function indexWorkspace(config: IndexerConfig): Promise<IndexingResult> {
  const startTime = Date.now();
  const {
    projectId,
    workspacePath,
    openaiApiKey,
    embeddingModel,
    batchSize = DEFAULT_BATCH_SIZE,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    ignorePatterns = DEFAULT_IGNORE_PATTERNS,
  } = config;

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
    // Get or create vector store
    const dimension = getEmbeddingDimension(embeddingModel);
    const store = getVectorStore(projectId, dimension);
    await store.initialize();

    // Clear existing index
    await store.clear();

    // Scan for files
    progress.status = 'scanning';
    const extensions = getSupportedExtensions().map(ext => ext.slice(1)); // Remove leading dot
    const pattern = `**/*.{${extensions.join(',')}}`;

    const files = await glob(pattern, {
      cwd: workspacePath,
      ignore: ignorePatterns,
      nodir: true,
      absolute: false,
    });

    progress.totalFiles = files.length;
    console.log(`[Indexer] Found ${files.length} files to index`);

    // Parse files and collect code blocks
    progress.status = 'parsing';
    const allBlocks: CodeBlock[] = [];

    for (const file of files) {
      progress.filesScanned++;
      progress.currentFile = file;

      const fullPath = path.join(workspacePath, file);

      try {
        // Check file size
        const stats = await fs.stat(fullPath);
        if (stats.size > maxFileSize) {
          console.log(`[Indexer] Skipping large file: ${file} (${stats.size} bytes)`);
          continue;
        }

        // Read and parse file
        const content = await fs.readFile(fullPath, 'utf-8');
        const blocks = parseFile(file, content);

        allBlocks.push(...blocks);
        progress.filesParsed++;
      } catch (error) {
        console.warn(`[Indexer] Error parsing ${file}:`, error);
      }
    }

    console.log(`[Indexer] Parsed ${allBlocks.length} code blocks from ${progress.filesParsed} files`);

    if (allBlocks.length === 0) {
      progress.status = 'complete';
      store.markIndexingComplete();
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
    const embedderConfig: EmbedderConfig = {
      apiKey: openaiApiKey,
      model: embeddingModel,
      batchSize,
    };

    let totalTokens = 0;

    for (let i = 0; i < allBlocks.length; i += batchSize) {
      const batch = allBlocks.slice(i, i + batchSize);
      const texts = batch.map(b => b.content);

      try {
        const { embeddings, usage } = await createEmbeddings(texts, embedderConfig);
        totalTokens += usage.totalTokens;

        // Combine blocks with their embeddings
        const indexedBlocks: IndexedBlock[] = batch.map((block, idx) => ({
          ...block,
          vector: embeddings[idx],
        }));

        // Store in vector database
        await store.upsertBlocks(indexedBlocks);
        progress.blocksIndexed += indexedBlocks.length;

        console.log(
          `[Indexer] Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allBlocks.length / batchSize)}`
        );
      } catch (error) {
        console.error(`[Indexer] Error embedding batch:`, error);
        throw error;
      }
    }

    // Mark indexing complete
    store.markIndexingComplete();
    progress.status = 'complete';
    progress.currentFile = undefined;

    const duration = Date.now() - startTime;
    console.log(
      `[Indexer] Complete: ${progress.blocksIndexed} blocks from ${progress.filesParsed} files in ${duration}ms`
    );

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
 * Get indexing progress for a project
 */
export function getIndexingProgress(projectId: string): IndexingProgress | null {
  return progressMap.get(projectId) || null;
}

/**
 * Check if a project is indexed
 */
export function isProjectIndexed(projectId: string): boolean {
  const dimension = getEmbeddingDimension();
  const store = getVectorStore(projectId, dimension);
  return store.isIndexingComplete();
}

/**
 * Get index stats for a project
 */
export function getIndexStats(projectId: string): {
  indexed: boolean;
  totalBlocks: number;
  totalFiles: number;
  lastUpdated: Date | null;
} {
  const dimension = getEmbeddingDimension();
  const store = getVectorStore(projectId, dimension);
  const stats = store.getStats();
  const filePaths = store.getIndexedFilePaths();

  return {
    indexed: stats.indexingComplete,
    totalBlocks: stats.totalBlocks,
    totalFiles: filePaths.length,
    lastUpdated: stats.lastUpdated,
  };
}

/**
 * Clear a project's index
 */
export async function clearProjectIndex(projectId: string): Promise<void> {
  await clearVectorStore(projectId);
  progressMap.delete(projectId);
}

/**
 * Re-index a single file (for incremental updates)
 */
export async function reindexFile(
  projectId: string,
  filePath: string,
  content: string,
  openaiApiKey: string,
  embeddingModel?: string
): Promise<{ success: boolean; blocksIndexed: number; error?: string }> {
  try {
    if (!isSupported(filePath)) {
      return { success: true, blocksIndexed: 0 };
    }

    const dimension = getEmbeddingDimension(embeddingModel);
    const store = getVectorStore(projectId, dimension);

    // Delete existing blocks for this file
    await store.deleteByFilePath(filePath);

    // Parse file
    const blocks = parseFile(filePath, content);

    if (blocks.length === 0) {
      return { success: true, blocksIndexed: 0 };
    }

    // Create embeddings
    const embedderConfig: EmbedderConfig = {
      apiKey: openaiApiKey,
      model: embeddingModel,
    };

    const texts = blocks.map(b => b.content);
    const { embeddings } = await createEmbeddings(texts, embedderConfig);

    // Store indexed blocks
    const indexedBlocks: IndexedBlock[] = blocks.map((block, idx) => ({
      ...block,
      vector: embeddings[idx],
    }));

    await store.upsertBlocks(indexedBlocks);

    return { success: true, blocksIndexed: indexedBlocks.length };
  } catch (error) {
    return {
      success: false,
      blocksIndexed: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
