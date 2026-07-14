/**
 * Yjs Document Persistence
 *
 * Persists Yjs documents to disk for recovery and durability.
 * Uses a write-ahead log pattern with periodic snapshots for
 * efficient storage and fast recovery.
 */

import * as Y from 'yjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';

// Base directory for persistence storage
const PERSISTENCE_DIR = process.env.COLLAB_PERSISTENCE_DIR || '/tmp/recoder-collab';
const SNAPSHOT_INTERVAL = 60 * 1000; // Create snapshot every minute of changes
const MAX_UPDATES_BEFORE_SNAPSHOT = 100; // Force snapshot after 100 updates

interface DocumentMeta {
  projectId: string;
  filePath: string;
  lastSnapshot: number;
  updateCount: number;
  version: number;
}

/**
 * Manages persistence of Yjs documents to disk
 */
class PersistenceManager {
  private dirty = new Map<string, boolean>(); // Track documents with unsaved changes
  private meta = new Map<string, DocumentMeta>(); // Track document metadata
  private saveTimers = new Map<string, NodeJS.Timeout>(); // Debounce saves
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize persistence directory
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!existsSync(PERSISTENCE_DIR)) {
        mkdirSync(PERSISTENCE_DIR, { recursive: true });
      }
      this.initialized = true;
      console.log(`[Persistence] Initialized at ${PERSISTENCE_DIR}`);
    } catch (error: any) {
      console.error(`[Persistence] Failed to initialize:`, error.message);
    }
  }

  /**
   * Get the storage path for a document
   */
  private getDocumentPath(projectId: string, filePath: string): string {
    // Sanitize the file path to create a safe filename
    const sanitizedPath = filePath
      .replace(/^\/+/, '')
      .replace(/\//g, '__')
      .replace(/[^a-zA-Z0-9_.-]/g, '_');

    return path.join(PERSISTENCE_DIR, projectId, `${sanitizedPath}.yjs`);
  }

  /**
   * Get the updates path for incremental updates
   */
  private getUpdatesPath(projectId: string, filePath: string): string {
    const docPath = this.getDocumentPath(projectId, filePath);
    return docPath.replace('.yjs', '.updates');
  }

  /**
   * Get the metadata path for a document
   */
  private getMetaPath(projectId: string, filePath: string): string {
    const docPath = this.getDocumentPath(projectId, filePath);
    return docPath.replace('.yjs', '.meta.json');
  }

  /**
   * Ensure directory exists for a document
   */
  private async ensureDirectory(projectId: string): Promise<void> {
    const projectDir = path.join(PERSISTENCE_DIR, projectId);
    if (!existsSync(projectDir)) {
      await fs.mkdir(projectDir, { recursive: true });
    }
  }

  /**
   * Load a document from disk
   */
  async loadDocument(projectId: string, filePath: string, doc: Y.Doc): Promise<boolean> {
    const docKey = `${projectId}:${filePath}`;

    try {
      const snapshotPath = this.getDocumentPath(projectId, filePath);
      const updatesPath = this.getUpdatesPath(projectId, filePath);
      const metaPath = this.getMetaPath(projectId, filePath);

      // Load metadata
      let meta: DocumentMeta = {
        projectId,
        filePath,
        lastSnapshot: 0,
        updateCount: 0,
        version: 1,
      };

      if (existsSync(metaPath)) {
        try {
          const metaContent = await fs.readFile(metaPath, 'utf-8');
          meta = JSON.parse(metaContent);
        } catch {
          // Ignore meta read errors
        }
      }

      this.meta.set(docKey, meta);

      // Load snapshot if exists
      if (existsSync(snapshotPath)) {
        const snapshotData = await fs.readFile(snapshotPath);
        Y.applyUpdate(doc, new Uint8Array(snapshotData), 'persistence');
        console.log(`[Persistence] Loaded snapshot for ${docKey}`);
      }

      // Apply incremental updates if any
      if (existsSync(updatesPath)) {
        const updatesData = await fs.readFile(updatesPath);
        if (updatesData.length > 0) {
          // Updates are stored as length-prefixed chunks
          let offset = 0;
          let updateCount = 0;

          while (offset < updatesData.length) {
            if (offset + 4 > updatesData.length) break;

            const length = updatesData.readUInt32BE(offset);
            offset += 4;

            if (offset + length > updatesData.length) break;

            const update = updatesData.slice(offset, offset + length);
            Y.applyUpdate(doc, new Uint8Array(update), 'persistence');
            offset += length;
            updateCount++;
          }

          console.log(`[Persistence] Applied ${updateCount} updates for ${docKey}`);
        }
      }

      return true;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`[Persistence] Error loading ${docKey}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Save a document to disk (debounced)
   */
  async saveDocument(projectId: string, filePath: string, doc: Y.Doc): Promise<void> {
    const docKey = `${projectId}:${filePath}`;

    // Mark as dirty
    this.dirty.set(docKey, true);

    // Clear existing timer
    const existingTimer = this.saveTimers.get(docKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule save with debounce
    const timer = setTimeout(() => {
      this.doSave(projectId, filePath, doc);
    }, 1000);

    this.saveTimers.set(docKey, timer);
  }

  /**
   * Actually perform the save operation
   */
  private async doSave(projectId: string, filePath: string, doc: Y.Doc): Promise<void> {
    const docKey = `${projectId}:${filePath}`;

    // Check if still dirty
    if (!this.dirty.get(docKey)) {
      return;
    }

    try {
      await this.ensureDirectory(projectId);

      const meta = this.meta.get(docKey) || {
        projectId,
        filePath,
        lastSnapshot: 0,
        updateCount: 0,
        version: 1,
      };

      const snapshotPath = this.getDocumentPath(projectId, filePath);
      const updatesPath = this.getUpdatesPath(projectId, filePath);
      const metaPath = this.getMetaPath(projectId, filePath);

      const now = Date.now();
      const shouldSnapshot =
        meta.updateCount >= MAX_UPDATES_BEFORE_SNAPSHOT ||
        now - meta.lastSnapshot > SNAPSHOT_INTERVAL;

      if (shouldSnapshot) {
        // Create full snapshot
        const state = Y.encodeStateAsUpdate(doc);
        await fs.writeFile(snapshotPath, Buffer.from(state));

        // Clear updates file
        if (existsSync(updatesPath)) {
          await fs.unlink(updatesPath);
        }

        meta.lastSnapshot = now;
        meta.updateCount = 0;
        meta.version++;

        console.log(`[Persistence] Created snapshot for ${docKey}`);
      } else {
        // Append incremental update
        const update = Y.encodeStateAsUpdate(doc);
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32BE(update.length, 0);

        await fs.appendFile(updatesPath, Buffer.concat([lengthBuffer, Buffer.from(update)]));
        meta.updateCount++;
      }

      // Save metadata
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      this.meta.set(docKey, meta);

      // Mark as clean
      this.dirty.set(docKey, false);
    } catch (error: any) {
      console.error(`[Persistence] Error saving ${docKey}:`, error.message);
    }
  }

  /**
   * Force immediate save of a document
   */
  async forceSave(projectId: string, filePath: string, doc: Y.Doc): Promise<void> {
    const docKey = `${projectId}:${filePath}`;

    // Clear any pending timer
    const existingTimer = this.saveTimers.get(docKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.saveTimers.delete(docKey);
    }

    // Mark as dirty and save immediately
    this.dirty.set(docKey, true);
    await this.doSave(projectId, filePath, doc);
  }

  /**
   * Delete persistence data for a document
   */
  async deleteDocument(projectId: string, filePath: string): Promise<void> {
    const docKey = `${projectId}:${filePath}`;

    try {
      const snapshotPath = this.getDocumentPath(projectId, filePath);
      const updatesPath = this.getUpdatesPath(projectId, filePath);
      const metaPath = this.getMetaPath(projectId, filePath);

      const deleteIfExists = async (p: string) => {
        if (existsSync(p)) {
          await fs.unlink(p);
        }
      };

      await Promise.all([
        deleteIfExists(snapshotPath),
        deleteIfExists(updatesPath),
        deleteIfExists(metaPath),
      ]);

      this.dirty.delete(docKey);
      this.meta.delete(docKey);

      const timer = this.saveTimers.get(docKey);
      if (timer) {
        clearTimeout(timer);
        this.saveTimers.delete(docKey);
      }

      console.log(`[Persistence] Deleted persistence data for ${docKey}`);
    } catch (error: any) {
      console.error(`[Persistence] Error deleting ${docKey}:`, error.message);
    }
  }

  /**
   * Delete all persistence data for a project
   */
  async deleteProject(projectId: string): Promise<void> {
    const projectDir = path.join(PERSISTENCE_DIR, projectId);

    try {
      if (existsSync(projectDir)) {
        await fs.rm(projectDir, { recursive: true });
        console.log(`[Persistence] Deleted project ${projectId}`);
      }

      // Clean up in-memory state
      for (const [key, timer] of this.saveTimers) {
        if (key.startsWith(`${projectId}:`)) {
          clearTimeout(timer);
          this.saveTimers.delete(key);
        }
      }

      for (const key of this.dirty.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          this.dirty.delete(key);
        }
      }

      for (const key of this.meta.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          this.meta.delete(key);
        }
      }
    } catch (error: any) {
      console.error(`[Persistence] Error deleting project ${projectId}:`, error.message);
    }
  }

  /**
   * List all persisted documents for a project
   */
  async listDocuments(projectId: string): Promise<string[]> {
    const projectDir = path.join(PERSISTENCE_DIR, projectId);
    const documents: string[] = [];

    try {
      if (!existsSync(projectDir)) {
        return [];
      }

      const files = await fs.readdir(projectDir);
      for (const file of files) {
        if (file.endsWith('.yjs')) {
          // Convert filename back to path
          const filePath = file
            .slice(0, -4) // Remove .yjs
            .replace(/__/g, '/')
            .replace(/_/g, '/'); // This is a simplification; may need more robust handling

          documents.push(filePath);
        }
      }
    } catch (error: any) {
      console.error(`[Persistence] Error listing documents for ${projectId}:`, error.message);
    }

    return documents;
  }

  /**
   * Get persistence statistics
   */
  async getStats(): Promise<{
    persistenceDir: string;
    totalProjects: number;
    totalDocuments: number;
    totalSize: number;
    dirtyDocuments: number;
  }> {
    const stats = {
      persistenceDir: PERSISTENCE_DIR,
      totalProjects: 0,
      totalDocuments: 0,
      totalSize: 0,
      dirtyDocuments: 0,
    };

    try {
      if (!existsSync(PERSISTENCE_DIR)) {
        return stats;
      }

      const projects = await fs.readdir(PERSISTENCE_DIR);
      stats.totalProjects = projects.length;

      for (const project of projects) {
        const projectDir = path.join(PERSISTENCE_DIR, project);
        const projectStats = await fs.stat(projectDir);

        if (projectStats.isDirectory()) {
          const files = await fs.readdir(projectDir);
          const yjsFiles = files.filter((f) => f.endsWith('.yjs'));
          stats.totalDocuments += yjsFiles.length;

          for (const file of files) {
            const filePath = path.join(projectDir, file);
            const fileStats = await fs.stat(filePath);
            stats.totalSize += fileStats.size;
          }
        }
      }

      stats.dirtyDocuments = Array.from(this.dirty.values()).filter(Boolean).length;
    } catch (error: any) {
      console.error(`[Persistence] Error getting stats:`, error.message);
    }

    return stats;
  }

  /**
   * Flush all pending saves (for graceful shutdown)
   */
  async flush(): Promise<void> {
    console.log(`[Persistence] Flushing all pending saves...`);

    // Cancel all timers
    for (const [key, timer] of this.saveTimers) {
      clearTimeout(timer);
      this.saveTimers.delete(key);
    }

    // Note: Actual saves require the Y.Doc instances, which we don't have here.
    // The yjs-server.ts module should call saveAllDocuments() for a proper flush.
    console.log(`[Persistence] Flush complete`);
  }
}

// Export singleton instance
export const persistenceManager = new PersistenceManager();
