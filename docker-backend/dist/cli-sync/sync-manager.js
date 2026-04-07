"use strict";
/**
 * CLI-Web Sync Manager
 * Manages synchronization state and operations between CLI and web IDE
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncManager = void 0;
const events_1 = require("events");
const file_diff_js_1 = require("./file-diff.js");
class SyncManager extends events_1.EventEmitter {
    // Active sync links: projectId -> SyncLink
    links = new Map();
    // Active sync sessions (WebSocket connections): clientId -> SyncSession
    sessions = new Map();
    // Sync state per project: projectId -> SyncState
    syncState = new Map();
    // File hashes cache for quick comparison: projectId -> { path: hash }
    fileHashes = new Map();
    constructor() {
        super();
    }
    /**
     * Link a CLI client to a project
     */
    linkProject(params) {
        const { projectId, userId, clientId, cliVersion } = params;
        const link = {
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
    unlinkProject(projectId) {
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
    isLinked(projectId) {
        return this.links.has(projectId);
    }
    /**
     * Get link info for a project
     */
    getLink(projectId) {
        return this.links.get(projectId);
    }
    /**
     * Register a new sync session (WebSocket connection)
     */
    registerSession(params) {
        const { projectId, userId, clientId } = params;
        const session = {
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
    updateSessionActivity(clientId, status) {
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
    closeSession(clientId) {
        const session = this.sessions.get(clientId);
        if (session) {
            this.sessions.delete(clientId);
            this.emit('session-closed', { projectId: session.projectId, clientId });
        }
    }
    /**
     * Get active sessions for a project
     */
    getProjectSessions(projectId) {
        const sessions = [];
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
    getSyncStatus(projectId, currentFiles) {
        const link = this.links.get(projectId);
        const sessions = this.getProjectSessions(projectId);
        const state = this.syncState.get(projectId);
        const result = {
            isLinked: !!link,
            link,
            activeSessions: sessions.length,
        };
        // If we have current files and sync state, compute diff
        if (currentFiles && state) {
            result.diff = (0, file_diff_js_1.diffFileSets)(currentFiles, state.remoteFiles);
            result.stats = (0, file_diff_js_1.getDiffStats)(result.diff);
        }
        return result;
    }
    /**
     * Update remote files state (from web IDE)
     */
    updateRemoteState(projectId, files) {
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
        }
        else {
            state.remoteFiles = files;
            state.lastRemoteHash = this.computeFilesHash(files);
        }
        // Update file hashes
        const hashes = new Map();
        for (const [path, content] of Object.entries(files)) {
            hashes.set(path, (0, file_diff_js_1.hashContent)(content));
        }
        this.fileHashes.set(projectId, hashes);
        this.emit('remote-updated', { projectId });
    }
    /**
     * Update local files state (from CLI)
     */
    updateLocalState(projectId, files) {
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
        }
        else {
            state.localFiles = files;
            state.lastLocalHash = this.computeFilesHash(files);
        }
        this.emit('local-updated', { projectId });
    }
    /**
     * Compute diff between local and remote
     */
    computeDiff(projectId, localFiles, remoteFiles) {
        const diff = (0, file_diff_js_1.diffFileSets)(localFiles, remoteFiles);
        const detailed = (0, file_diff_js_1.getDetailedDiff)(localFiles, remoteFiles);
        const stats = (0, file_diff_js_1.getDiffStats)(diff);
        return { diff, detailed, stats };
    }
    /**
     * Execute push: Apply local files to remote
     */
    async executePush(projectId, localFiles, remoteFiles, applyToRemote) {
        const diff = (0, file_diff_js_1.diffFileSets)(localFiles, remoteFiles);
        // Build the files to apply
        const filesToApply = {};
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
    async executePull(projectId, localFiles, remoteFiles, applyToLocal) {
        const diff = (0, file_diff_js_1.diffFileSets)(localFiles, remoteFiles);
        // Invert the diff - what's deleted locally needs to be added
        // What's added locally should be considered for deletion
        const filesToApply = {};
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
                added: diff.deleted, // Files from remote that were added locally
                modified: diff.modified,
                deleted: diff.added, // Files that were only local and got deleted
            },
        };
    }
    /**
     * Broadcast a sync event to all connected clients for a project
     */
    broadcastEvent(projectId, event) {
        const fullEvent = {
            ...event,
            projectId,
            timestamp: new Date().toISOString(),
        };
        this.emit('sync-event', fullEvent);
    }
    /**
     * Handle incoming file change from CLI
     */
    handleCliFileChange(params) {
        const { projectId, clientId, path, content } = params;
        this.updateSessionActivity(clientId, 'syncing');
        const event = {
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
            hashes.set(path, (0, file_diff_js_1.hashContent)(content));
        }
        else {
            hashes.delete(path);
        }
        this.fileHashes.set(projectId, hashes);
        this.updateSessionActivity(clientId, 'idle');
    }
    /**
     * Handle incoming file change from web IDE
     */
    handleWebFileChange(params) {
        const { projectId, path, content } = params;
        const event = {
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
            hashes.set(path, (0, file_diff_js_1.hashContent)(content));
        }
        else {
            hashes.delete(path);
        }
        this.fileHashes.set(projectId, hashes);
    }
    /**
     * Compute a hash representing the entire file set
     */
    computeFilesHash(files) {
        const sortedPaths = Object.keys(files).sort();
        const combined = sortedPaths.map(p => `${p}:${(0, file_diff_js_1.hashContent)(files[p])}`).join('|');
        return (0, file_diff_js_1.hashContent)(combined);
    }
    /**
     * Clean up stale sessions (no activity for more than 5 minutes)
     */
    cleanupStaleSessions() {
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
    getAllLinks() {
        return Array.from(this.links.values());
    }
    /**
     * Get all active sessions (for debugging/admin)
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
}
// Export singleton instance
exports.syncManager = new SyncManager();
// Cleanup stale sessions every minute
setInterval(() => {
    exports.syncManager.cleanupStaleSessions();
}, 60 * 1000);
