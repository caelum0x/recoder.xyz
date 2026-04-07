/**
 * Code Index Service for docker-backend
 * Real semantic code search using OpenAI embeddings
 * Runs inside Docker containers with full filesystem access
 */
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
export declare function getIndexingProgress(projectId: string): IndexingProgress | null;
/**
 * Index a workspace for semantic code search
 */
export declare function indexWorkspace(projectId: string, workspacePath: string, openaiApiKey: string): Promise<IndexingResult>;
/**
 * Search indexed code semantically
 */
export declare function searchCode(projectId: string, query: string, openaiApiKey: string, maxResults?: number, directoryPrefix?: string): Promise<{
    success: boolean;
    results: SearchResult[];
    error?: string;
}>;
/**
 * Get index stats
 */
export declare function getIndexStats(projectId: string): {
    indexed: boolean;
    totalBlocks: number;
    totalFiles: number;
    lastUpdated: Date | null;
};
/**
 * Clear project index
 */
export declare function clearIndex(projectId: string): void;
/**
 * Check if project is indexed
 */
export declare function isIndexed(projectId: string): boolean;
