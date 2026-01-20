/**
 * CLI-Web Sync Manager
 * Manages synchronization state and operations between CLI and web IDE
 */

import { EventEmitter } from 'events';
import { diffFileSets, getDetailedDiff, getDiffStats, hashContent, type DiffResult, type DetailedFileDiff } from './file-diff.js';

export interface SyncLink {
  projectId: string;
  userId: string;
  linkedAt: string;
  lastSyncAt?: string;
  syncDirection?: 'push' | 'pull' | 'bidirectional';
  cliVersion?: string;
  clientId: string;  // Unique identifier for this CLI client
}

export interface SyncSession {
  projectId: string;
  userId: string;
  clientId: string;
  connectedAt: string;
  lastActivity: string;
  status: 'connected' | 'syncing' | 'idle' | 'error';
  pendingChanges: number;
}

export interface SyncState {
  projectId: string;
  localFiles: Record<string, string>;
  remoteFiles: Record<string, string>;
  lastLocalHash: string;
  lastRemoteHash: string;
  conflictFiles: string[];
}

export interface SyncEvent {
  type: 'file-created' | 'file-modified' | 'file-deleted' | 'sync-complete' | 'conflict';
  projectId: string;
  path?: string;
  source: 'cli' | 'web';
  timestamp: string;
  data?: unknown;
}

class SyncManager extends EventEmitter {
  // Active sync links: projectId -> SyncLink
  private links: Map<string, SyncLink> = new Map();

  // Active sync sessions (WebSocket connections): clientId -> SyncSession
  private sessions: Map<string, SyncSession> = new Map();

  // Sync state per project: projectId -> SyncState
  private syncState: Map<string, SyncState> = new Map();

  // File hashes cache for quick comparison: projectId -> { path: hash }
  private fileHashes: Map<string, Map<string, string>> = new Map();

  constructor() {
    super();
  }

  /**
   * Link a CLI client to a project
   */
  linkProject(params: {
    projectId: string;
    userId: string;
    clientId: string;
    cliVersion?: string;
  }): SyncLink {
    const { projectId, userId, clientId, cliVersion } = params;

    const link: SyncLink = {
      projectId,
      userId,
      linkedAt: new Date().toISOString(),
      clientId,
      cliVersion,
    };

    this.links.set(projectId, link);

    this.emit('linked', { projectId, userId, clientId });

    return link;
  }

  /**
   * Unlink a CLI client from a project
   */
  unlinkProject(projectId: string): boolean {
    const link = this.links.get(projectId);
    if (!link) {
      return false;
    }

    this.links.delete(projectId);
    this.syncState.delete(projectId);
    this.fileHashes.delete(projectId);

    // Close any active sessions for this project
    for (const [clientId, session] of this.sessions) {
      if (session.projectId === projectId) {
        this.sessions.delete(clientId);
        this.emit('session-closed', { projectId, clientId });
      }
    }

    this.emit('unlinked', { projectId });

    return true;
  }

  /**
   * Check if a project is linked
   */
  isLinked(projectId: string): boolean {
    return this.links.has(projectId);
  }

  /**
   * Get link info for a project
   */
  getLink(projectId: string): SyncLink | undefined {
    return this.links.get(projectId);
  }

  /**
   * Register a new sync session (WebSocket connection)
   */
  registerSession(params: {
    projectId: string;
    userId: string;
    clientId: string;
  }): SyncSession {
    const { projectId, userId, clientId } = params;

    const session: SyncSession = {
      projectId,
      userId,
      clientId,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      status: 'connected',
      pendingChanges: 0,
    };

    this.sessions.set(clientId, session);

    this.emit('session-opened', { projectId, clientId });

    return session;
  }

  /**
   * Update session activity
   */
  updateSessionActivity(clientId: string, status?: SyncSession['status']): void {
    const session = this.sessions.get(clientId);
    if (session) {
      session.lastActivity = new Date().toISOString();
      if (status) {
        session.status = status;
      }
    }
  }

  /**
   * Close a sync session
   */
  closeSession(clientId: string): void {
    const session = this.sessions.get(clientId);
    if (session) {
      this.sessions.delete(clientId);
      this.emit('session-closed', { projectId: session.projectId, clientId });
    }
  }

  /**
   * Get active sessions for a project
   */
  getProjectSessions(projectId: string): SyncSession[] {
    const sessions: SyncSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Get sync status for a project
   */
  getSyncStatus(projectId: string, currentFiles?: Record<string, string>): {
    isLinked: boolean;
    link?: SyncLink;
    activeSessions: number;
    diff?: DiffResult;
    stats?: ReturnType<typeof getDiffStats>;
  } {
    const link = this.links.get(projectId);
    const sessions = this.getProjectSessions(projectId);
    const state = this.syncState.get(projectId);

    const result: ReturnType<typeof this.getSyncStatus> = {
      isLinked: !!link,
      link,
      activeSessions: sessions.length,
    };

    // If we have current files and sync state, compute diff
    if (currentFiles && state) {
      result.diff = diffFileSets(currentFiles, state.remoteFiles);
      result.stats = getDiffStats(result.diff);
    }

    return result;
  }

  /**
   * Update remote files state (from web IDE)
   */
  updateRemoteState(projectId: string, files: Record<string, string>): void {
    let state = this.syncState.get(projectId);

    if (!state) {
      state = {
        projectId,
        localFiles: {},
        remoteFiles: files,
        lastLocalHash: '',
        lastRemoteHash: this.computeFilesHash(files),
        conflictFiles: [],
      };
      this.syncState.set(projectId, state);
    } else {
      state.remoteFiles = files;
      state.lastRemoteHash = this.computeFilesHash(files);
    }

    // Update file hashes
    const hashes = new Map<string, string>();
    for (const [path, content] of Object.entries(files)) {
      hashes.set(path, hashContent(content));
    }
    this.fileHashes.set(projectId, hashes);

    this.emit('remote-updated', { projectId });
  }

  /**
   * Update local files state (from CLI)
   */
  updateLocalState(projectId: string, files: Record<string, string>): void {
    let state = this.syncState.get(projectId);

    if (!state) {
      state = {
        projectId,
        localFiles: files,
        remoteFiles: {},
        lastLocalHash: this.computeFilesHash(files),
        lastRemoteHash: '',
        conflictFiles: [],
      };
      this.syncState.set(projectId, state);
    } else {
      state.localFiles = files;
      state.lastLocalHash = this.computeFilesHash(files);
    }

    this.emit('local-updated', { projectId });
  }

  /**
   * Compute diff between local and remote
   */
  computeDiff(projectId: string, localFiles: Record<string, string>, remoteFiles: Record<string, string>): {
    diff: DiffResult;
    detailed: DetailedFileDiff[];
    stats: ReturnType<typeof getDiffStats>;
  } {
    const diff = diffFileSets(localFiles, remoteFiles);
    const detailed = getDetailedDiff(localFiles, remoteFiles);
    const stats = getDiffStats(diff);

    return { diff, detailed, stats };
  }

  /**
   * Execute push: Apply local files to remote
   */
  async executePush(
    projectId: string,
    localFiles: Record<string, string>,
    remoteFiles: Record<string, string>,
    applyToRemote: (files: Record<string, string>, deleted: string[]) => Promise<void>
  ): Promise<{
    success: boolean;
    applied: { added: string[]; modified: string[]; deleted: string[] };
  }> {
    const diff = diffFileSets(localFiles, remoteFiles);

    // Build the files to apply
    const filesToApply: Record<string, string> = {};

    for (const path of [...diff.added, ...diff.modified]) {
      filesToApply[path] = localFiles[path];
    }

    // Apply changes
    await applyToRemote(filesToApply, diff.deleted);

    // Update state
    this.updateRemoteState(projectId, localFiles);

    // Update link
    const link = this.links.get(projectId);
    if (link) {
      link.lastSyncAt = new Date().toISOString();
      link.syncDirection = 'push';
    }

    return {
      success: true,
      applied: {
        added: diff.added,
        modified: diff.modified,
        deleted: diff.deleted,
      },
    };
  }

  /**
   * Execute pull: Apply remote files to local
   */
  async executePull(
    projectId: string,
    localFiles: Record<string, string>,
    remoteFiles: Record<string, string>,
    applyToLocal: (files: Record<string, string>, deleted: string[]) => Promise<void>
  ): Promise<{
    success: boolean;
    applied: { added: string[]; modified: string[]; deleted: string[] };
  }> {
    const diff = diffFileSets(localFiles, remoteFiles);

    // Invert the diff - what's deleted locally needs to be added
    // What's added locally should be considered for deletion
    const filesToApply: Record<string, string> = {};

    // Files in remote but not in local -> add/update them locally
    for (const path of diff.deleted) {
      filesToApply[path] = remoteFiles[path];
    }

    // Files that differ -> use remote version
    for (const path of diff.modified) {
      filesToApply[path] = remoteFiles[path];
    }

    // Files only in local -> delete them locally
    const toDelete = diff.added;

    // Apply changes
    await applyToLocal(filesToApply, toDelete);

    // Update state
    this.updateLocalState(projectId, remoteFiles);

    // Update link
    const link = this.links.get(projectId);
    if (link) {
      link.lastSyncAt = new Date().toISOString();
      link.syncDirection = 'pull';
    }

    return {
      success: true,
      applied: {
        added: diff.deleted,  // Files from remote that were added locally
        modified: diff.modified,
        deleted: diff.added,  // Files that were only local and got deleted
      },
    };
  }

  /**
   * Broadcast a sync event to all connected clients for a project
   */
  broadcastEvent(projectId: string, event: Omit<SyncEvent, 'projectId' | 'timestamp'>): void {
    const fullEvent: SyncEvent = {
      ...event,
      projectId,
      timestamp: new Date().toISOString(),
    };

    this.emit('sync-event', fullEvent);
  }

  /**
   * Handle incoming file change from CLI
   */
  handleCliFileChange(params: {
    projectId: string;
    clientId: string;
    path: string;
    content?: string;  // undefined means deleted
  }): void {
    const { projectId, clientId, path, content } = params;

    this.updateSessionActivity(clientId, 'syncing');

    const event: Omit<SyncEvent, 'projectId' | 'timestamp'> = {
      type: content !== undefined
        ? (this.fileHashes.get(projectId)?.has(path) ? 'file-modified' : 'file-created')
        : 'file-deleted',
      path,
      source: 'cli',
    };

    this.broadcastEvent(projectId, event);

    // Update hash cache
    const hashes = this.fileHashes.get(projectId) || new Map();
    if (content !== undefined) {
      hashes.set(path, hashContent(content));
    } else {
      hashes.delete(path);
    }
    this.fileHashes.set(projectId, hashes);

    this.updateSessionActivity(clientId, 'idle');
  }

  /**
   * Handle incoming file change from web IDE
   */
  handleWebFileChange(params: {
    projectId: string;
    path: string;
    content?: string;  // undefined means deleted
  }): void {
    const { projectId, path, content } = params;

    const event: Omit<SyncEvent, 'projectId' | 'timestamp'> = {
      type: content !== undefined
        ? (this.fileHashes.get(projectId)?.has(path) ? 'file-modified' : 'file-created')
        : 'file-deleted',
      path,
      source: 'web',
    };

    this.broadcastEvent(projectId, event);

    // Update hash cache
    const hashes = this.fileHashes.get(projectId) || new Map();
    if (content !== undefined) {
      hashes.set(path, hashContent(content));
    } else {
      hashes.delete(path);
    }
    this.fileHashes.set(projectId, hashes);
  }

  /**
   * Compute a hash representing the entire file set
   */
  private computeFilesHash(files: Record<string, string>): string {
    const sortedPaths = Object.keys(files).sort();
    const combined = sortedPaths.map(p => `${p}:${hashContent(files[p])}`).join('|');
    return hashContent(combined);
  }

  /**
   * Clean up stale sessions (no activity for more than 5 minutes)
   */
  cleanupStaleSessions(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [clientId, session] of this.sessions) {
      const lastActivity = new Date(session.lastActivity).getTime();
      if (now - lastActivity > staleThreshold) {
        this.closeSession(clientId);
      }
    }
  }

  /**
   * Get all active links (for debugging/admin)
   */
  getAllLinks(): SyncLink[] {
    return Array.from(this.links.values());
  }

  /**
   * Get all active sessions (for debugging/admin)
   */
  getAllSessions(): SyncSession[] {
    return Array.from(this.sessions.values());
  }
}

// Export singleton instance
export const syncManager = new SyncManager();

// Cleanup stale sessions every minute
setInterval(() => {
  syncManager.cleanupStaleSessions();
}, 60 * 1000);
