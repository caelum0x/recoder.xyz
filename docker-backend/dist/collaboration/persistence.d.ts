/**
 * Yjs Document Persistence
 *
 * Persists Yjs documents to disk for recovery and durability.
 * Uses a write-ahead log pattern with periodic snapshots for
 * efficient storage and fast recovery.
 */
import * as Y from 'yjs';
/**
 * Manages persistence of Yjs documents to disk
 */
declare class PersistenceManager {
    private dirty;
    private meta;
    private saveTimers;
    private initialized;
    constructor();
    /**
     * Initialize persistence directory
     */
    private initialize;
    /**
     * Get the storage path for a document
     */
    private getDocumentPath;
    /**
     * Get the updates path for incremental updates
     */
    private getUpdatesPath;
    /**
     * Get the metadata path for a document
     */
    private getMetaPath;
    /**
     * Ensure directory exists for a document
     */
    private ensureDirectory;
    /**
     * Load a document from disk
     */
    loadDocument(projectId: string, filePath: string, doc: Y.Doc): Promise<boolean>;
    /**
     * Save a document to disk (debounced)
     */
    saveDocument(projectId: string, filePath: string, doc: Y.Doc): Promise<void>;
    /**
     * Actually perform the save operation
     */
    private doSave;
    /**
     * Force immediate save of a document
     */
    forceSave(projectId: string, filePath: string, doc: Y.Doc): Promise<void>;
    /**
     * Delete persistence data for a document
     */
    deleteDocument(projectId: string, filePath: string): Promise<void>;
    /**
     * Delete all persistence data for a project
     */
    deleteProject(projectId: string): Promise<void>;
    /**
     * List all persisted documents for a project
     */
    listDocuments(projectId: string): Promise<string[]>;
    /**
     * Get persistence statistics
     */
    getStats(): Promise<{
        persistenceDir: string;
        totalProjects: number;
        totalDocuments: number;
        totalSize: number;
        dirtyDocuments: number;
    }>;
    /**
     * Flush all pending saves (for graceful shutdown)
     */
    flush(): Promise<void>;
}
export declare const persistenceManager: PersistenceManager;
export {};
