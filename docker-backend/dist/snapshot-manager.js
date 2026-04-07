"use strict";
/**
 * Git-based Snapshot Manager
 * Handles project snapshots using Git for instant rollback/restore
 *
 * Each snapshot is a Git commit in the project's /workspace directory.
 * This enables:
 * - Instant restore to any previous state
 * - Diff comparison between snapshots
 * - Auto-save at key moments (before AI changes, after user saves)
 *
 * Daytona sandboxes: snapshot operations are skipped for Daytona-backed
 * containers because Daytona manages its own sandbox state. All public
 * methods check isDaytonaId() and return safe no-op results.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotManager = exports.SnapshotManager = void 0;
exports.registerDaytonaId = registerDaytonaId;
exports.unregisterDaytonaId = unregisterDaytonaId;
exports.isDaytonaId = isDaytonaId;
const dockerode_1 = __importDefault(require("dockerode"));
const docker = new dockerode_1.default();
/**
 * Set of container/sandbox IDs that are Daytona-backed.
 * Populated by server.ts via registerDaytonaId / unregisterDaytonaId.
 */
const _daytonaIds = new Set();
function registerDaytonaId(id) {
    _daytonaIds.add(id);
}
function unregisterDaytonaId(id) {
    _daytonaIds.delete(id);
}
function isDaytonaId(id) {
    return _daytonaIds.has(id);
}
async function execInContainer(containerId, cmd) {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', cmd],
        AttachStdout: true,
        AttachStderr: true,
    });
    const stream = await exec.start({});
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
            // Concatenate all chunks and decode, stripping Docker mux headers
            const raw = Buffer.concat(chunks);
            let result = '';
            let i = 0;
            while (i < raw.length) {
                if (i + 8 <= raw.length) {
                    const size = raw.readUInt32BE(i + 4);
                    if (i + 8 + size <= raw.length) {
                        result += raw.slice(i + 8, i + 8 + size).toString();
                        i += 8 + size;
                        continue;
                    }
                }
                // Fallback: just use remaining bytes
                result += raw.slice(i).toString();
                break;
            }
            resolve(result.trim());
        });
        stream.on('error', reject);
    });
}
/**
 * SnapshotManager - Git-based project state management
 */
class SnapshotManager {
    autoSaveIntervals = new Map();
    autoSaveEnabled = new Map();
    /**
     * Initialize Git repository in container if not exists.
     * No-op for Daytona sandboxes.
     */
    async initRepo(containerId) {
        if (isDaytonaId(containerId))
            return;
        try {
            // Check if .git exists
            const hasGit = await execInContainer(containerId, 'cd /workspace && test -d .git && echo "yes" || echo "no"');
            if (hasGit.includes('no')) {
                // Initialize git repo
                await execInContainer(containerId, `
          cd /workspace &&
          git init --initial-branch=main &&
          git config user.email "recoder@recoder.xyz" &&
          git config user.name "Recoder" &&
          echo "node_modules/\n.next/\ndist/\n.turbo/\n*.log" > .gitignore &&
          git add -A &&
          git commit -m "Initial snapshot" --allow-empty
        `);
                console.log(`[Snapshot] Initialized Git repo in container ${containerId.slice(0, 12)}`);
            }
        }
        catch (error) {
            console.error(`[Snapshot] Init error: ${error.message}`);
            throw error;
        }
    }
    /**
     * Create a new snapshot (Git commit).
     * Returns a stub for Daytona sandboxes (Daytona manages its own state).
     */
    async createSnapshot(containerId, projectId, message, author = 'user', options) {
        if (isDaytonaId(containerId)) {
            return {
                id: 'daytona',
                fullHash: 'daytona-managed',
                message,
                timestamp: Date.now(),
                author,
                filesChanged: 0,
                additions: 0,
                deletions: 0,
            };
        }
        try {
            await this.initRepo(containerId);
            // Stage all changes
            await execInContainer(containerId, 'cd /workspace && git add -A');
            // Check if there are changes to commit
            const status = await execInContainer(containerId, 'cd /workspace && git status --porcelain');
            if (!status.trim()) {
                // No changes, return current HEAD
                const headInfo = await this.getCurrentSnapshot(containerId);
                if (headInfo)
                    return headInfo;
                throw new Error('No changes to snapshot');
            }
            // Create commit with metadata in message
            const fullMessage = `[${author}] ${message}`;
            await execInContainer(containerId, `cd /workspace && git commit -m "${fullMessage.replace(/"/g, '\\"')}" --allow-empty`);
            // Store neonDbTimestamp in git notes if provided
            if (options?.neonDbTimestamp) {
                const noteContent = JSON.stringify({ neonDbTimestamp: options.neonDbTimestamp });
                await execInContainer(containerId, `cd /workspace && git notes add -m '${noteContent.replace(/'/g, "'\\''")}' HEAD 2>/dev/null || true`);
            }
            // Get commit info
            const commitInfo = await execInContainer(containerId, 'cd /workspace && git log -1 --format="%H|%h|%s|%at"');
            const [fullHash, shortHash, commitMessage, timestamp] = commitInfo.split('|');
            // Get diff stats
            const stats = await execInContainer(containerId, 'cd /workspace && git diff --stat HEAD~1 HEAD 2>/dev/null | tail -1 || echo "0 files changed"');
            const statsMatch = stats.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
            const filesChanged = statsMatch ? parseInt(statsMatch[1]) || 0 : 0;
            const additions = statsMatch ? parseInt(statsMatch[2]) || 0 : 0;
            const deletions = statsMatch ? parseInt(statsMatch[3]) || 0 : 0;
            const snapshot = {
                id: shortHash,
                fullHash,
                message: message,
                timestamp: parseInt(timestamp) * 1000,
                author,
                filesChanged,
                additions,
                deletions,
                neonDbTimestamp: options?.neonDbTimestamp,
            };
            console.log(`[Snapshot] Created: ${snapshot.id} - ${message} for ${projectId}${options?.neonDbTimestamp ? ' (with DB state)' : ''}`);
            return snapshot;
        }
        catch (error) {
            console.error(`[Snapshot] Create error: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get current HEAD snapshot.
     * Returns null for Daytona sandboxes.
     */
    async getCurrentSnapshot(containerId) {
        if (isDaytonaId(containerId))
            return null;
        try {
            const commitInfo = await execInContainer(containerId, 'cd /workspace && git log -1 --format="%H|%h|%s|%at" 2>/dev/null || echo ""');
            if (!commitInfo.trim())
                return null;
            const [fullHash, shortHash, message, timestamp] = commitInfo.split('|');
            // Extract author from message format: [author] message
            const authorMatch = message.match(/^\[(user|ai|auto)\]\s*/);
            const author = (authorMatch?.[1] || 'user');
            const cleanMessage = message.replace(/^\[(user|ai|auto)\]\s*/, '');
            // Read neonDbTimestamp from git notes
            const neonDbTimestamp = await this.readNoteTimestamp(containerId, fullHash);
            return {
                id: shortHash,
                fullHash,
                message: cleanMessage,
                timestamp: parseInt(timestamp) * 1000,
                author,
                neonDbTimestamp,
            };
        }
        catch {
            return null;
        }
    }
    /**
     * List all snapshots (Git commits).
     * Returns empty list for Daytona sandboxes.
     */
    async listSnapshots(containerId, limit = 50) {
        if (isDaytonaId(containerId))
            return [];
        try {
            await this.initRepo(containerId);
            const log = await execInContainer(containerId, `cd /workspace && git log --format="%H|%h|%s|%at" -n ${limit} 2>/dev/null || echo ""`);
            if (!log.trim())
                return [];
            // Batch-read all git notes at once for efficiency
            const notesMap = await this.readAllNotes(containerId);
            const snapshots = log.split('\n').filter(Boolean).map(line => {
                const [fullHash, shortHash, message, timestamp] = line.split('|');
                // Extract author from message
                const authorMatch = message.match(/^\[(user|ai|auto)\]\s*/);
                const author = (authorMatch?.[1] || 'user');
                const cleanMessage = message.replace(/^\[(user|ai|auto)\]\s*/, '');
                return {
                    id: shortHash,
                    fullHash,
                    message: cleanMessage,
                    timestamp: parseInt(timestamp) * 1000,
                    author,
                    neonDbTimestamp: notesMap.get(fullHash),
                };
            });
            return snapshots;
        }
        catch (error) {
            console.error(`[Snapshot] List error: ${error.message}`);
            return [];
        }
    }
    /**
     * Restore to a specific snapshot.
     * No-op for Daytona sandboxes (Daytona manages its own state).
     */
    async restoreSnapshot(containerId, projectId, snapshotId) {
        if (isDaytonaId(containerId))
            return true;
        try {
            // Use git checkout to restore files from specific commit
            await execInContainer(containerId, `cd /workspace && git checkout ${snapshotId} -- .`);
            console.log(`[Snapshot] Restored to: ${snapshotId} for ${projectId}`);
            return true;
        }
        catch (error) {
            console.error(`[Snapshot] Restore error: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get neonDbTimestamp for a specific snapshot (public, for restore route).
     * Returns undefined for Daytona sandboxes.
     */
    async getSnapshotDbTimestamp(containerId, snapshotId) {
        if (isDaytonaId(containerId))
            return undefined;
        try {
            // Resolve short hash to full hash
            const fullHash = await execInContainer(containerId, `cd /workspace && git rev-parse ${snapshotId} 2>/dev/null || echo ""`);
            if (!fullHash.trim())
                return undefined;
            return this.readNoteTimestamp(containerId, fullHash.trim());
        }
        catch {
            return undefined;
        }
    }
    /**
     * Read neonDbTimestamp from git notes for a single commit.
     */
    async readNoteTimestamp(containerId, commitHash) {
        if (isDaytonaId(containerId))
            return undefined;
        try {
            const note = await execInContainer(containerId, `cd /workspace && git notes show ${commitHash} 2>/dev/null || echo ""`);
            if (!note.trim())
                return undefined;
            const parsed = JSON.parse(note.trim());
            return parsed.neonDbTimestamp || undefined;
        }
        catch {
            return undefined;
        }
    }
    /**
     * Batch-read all git notes (hash -> neonDbTimestamp) for efficiency.
     */
    async readAllNotes(containerId) {
        const map = new Map();
        if (isDaytonaId(containerId))
            return map;
        try {
            const notesOutput = await execInContainer(containerId, 'cd /workspace && git notes list 2>/dev/null || echo ""');
            if (!notesOutput.trim())
                return map;
            // git notes list outputs: <note-blob-hash> <commit-hash>
            const lines = notesOutput.split('\n').filter(Boolean);
            for (const line of lines) {
                const [noteBlob, commitHash] = line.split(/\s+/);
                if (!noteBlob || !commitHash)
                    continue;
                try {
                    const noteContent = await execInContainer(containerId, `cd /workspace && git cat-file -p ${noteBlob} 2>/dev/null || echo ""`);
                    if (noteContent.trim()) {
                        const parsed = JSON.parse(noteContent.trim());
                        if (parsed.neonDbTimestamp) {
                            map.set(commitHash, parsed.neonDbTimestamp);
                        }
                    }
                }
                catch {
                    // Skip malformed notes
                }
            }
        }
        catch {
            // Notes not available
        }
        return map;
    }
    /**
     * Get diff between two snapshots.
     * Returns empty diff for Daytona sandboxes.
     */
    async getDiff(containerId, fromSnapshot, toSnapshot = 'HEAD') {
        if (isDaytonaId(containerId)) {
            return { files: [], summary: { filesChanged: 0, additions: 0, deletions: 0 } };
        }
        try {
            // Get file-level diff stats
            const statsOutput = await execInContainer(containerId, `cd /workspace && git diff --numstat ${fromSnapshot} ${toSnapshot} 2>/dev/null || echo ""`);
            const files = [];
            let totalAdditions = 0;
            let totalDeletions = 0;
            if (statsOutput.trim()) {
                for (const line of statsOutput.split('\n').filter(Boolean)) {
                    const [additions, deletions, path] = line.split('\t');
                    const add = parseInt(additions) || 0;
                    const del = parseInt(deletions) || 0;
                    totalAdditions += add;
                    totalDeletions += del;
                    files.push({
                        path,
                        status: 'modified',
                        additions: add,
                        deletions: del,
                    });
                }
            }
            // Determine status of each file (added/modified/deleted)
            const statusOutput = await execInContainer(containerId, `cd /workspace && git diff --name-status ${fromSnapshot} ${toSnapshot} 2>/dev/null || echo ""`);
            if (statusOutput.trim()) {
                for (const line of statusOutput.split('\n').filter(Boolean)) {
                    const [status, path] = line.split('\t');
                    const file = files.find(f => f.path === path);
                    if (file) {
                        file.status = status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'modified';
                    }
                }
            }
            return {
                files,
                summary: {
                    filesChanged: files.length,
                    additions: totalAdditions,
                    deletions: totalDeletions,
                },
            };
        }
        catch (error) {
            console.error(`[Snapshot] Diff error: ${error.message}`);
            return { files: [], summary: { filesChanged: 0, additions: 0, deletions: 0 } };
        }
    }
    /**
     * Get unified diff for a specific file between snapshots.
     * Returns empty string for Daytona sandboxes.
     */
    async getFileDiff(containerId, filePath, fromSnapshot, toSnapshot = 'HEAD') {
        if (isDaytonaId(containerId))
            return '';
        try {
            const diff = await execInContainer(containerId, `cd /workspace && git diff ${fromSnapshot} ${toSnapshot} -- "${filePath}" 2>/dev/null || echo ""`);
            return diff;
        }
        catch {
            return '';
        }
    }
    /**
     * Enable auto-save for a project.
     * No-op for Daytona sandboxes.
     */
    startAutoSave(containerId, projectId, intervalMs = 5 * 60 * 1000 // Default: 5 minutes
    ) {
        if (isDaytonaId(containerId))
            return;
        // Clear any existing interval
        this.stopAutoSave(projectId);
        this.autoSaveEnabled.set(projectId, true);
        const interval = setInterval(async () => {
            if (!this.autoSaveEnabled.get(projectId))
                return;
            try {
                // Check if there are changes
                const status = await execInContainer(containerId, 'cd /workspace && git status --porcelain');
                if (status.trim()) {
                    await this.createSnapshot(containerId, projectId, 'Auto-save', 'auto');
                }
            }
            catch (error) {
                console.error(`[Snapshot] Auto-save error for ${projectId}: ${error.message}`);
            }
        }, intervalMs);
        this.autoSaveIntervals.set(projectId, interval);
        console.log(`[Snapshot] Auto-save enabled for ${projectId} (every ${intervalMs / 1000}s)`);
    }
    /**
     * Stop auto-save for a project
     */
    stopAutoSave(projectId) {
        const interval = this.autoSaveIntervals.get(projectId);
        if (interval) {
            clearInterval(interval);
            this.autoSaveIntervals.delete(projectId);
        }
        this.autoSaveEnabled.set(projectId, false);
        console.log(`[Snapshot] Auto-save disabled for ${projectId}`);
    }
    /**
     * Check if there are unsaved changes.
     * Returns false for Daytona sandboxes.
     */
    async hasUnsavedChanges(containerId) {
        if (isDaytonaId(containerId))
            return false;
        try {
            const status = await execInContainer(containerId, 'cd /workspace && git status --porcelain');
            return status.trim().length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Get file content at a specific snapshot.
     * Returns null for Daytona sandboxes.
     */
    async getFileAtSnapshot(containerId, filePath, snapshotId) {
        if (isDaytonaId(containerId))
            return null;
        try {
            const content = await execInContainer(containerId, `cd /workspace && git show ${snapshotId}:"${filePath}" 2>/dev/null`);
            return content;
        }
        catch {
            return null;
        }
    }
    /**
     * Compress Git repository to save space.
     * No-op for Daytona sandboxes.
     */
    async compress(containerId) {
        if (isDaytonaId(containerId))
            return { before: 'n/a', after: 'n/a' };
        try {
            // Get size before
            const before = await execInContainer(containerId, 'cd /workspace && du -sh .git 2>/dev/null | cut -f1');
            // Run aggressive garbage collection
            await execInContainer(containerId, 'cd /workspace && git gc --aggressive --prune=now 2>/dev/null');
            // Get size after
            const after = await execInContainer(containerId, 'cd /workspace && du -sh .git 2>/dev/null | cut -f1');
            console.log(`[Snapshot] Compressed: ${before.trim()} → ${after.trim()}`);
            return { before: before.trim(), after: after.trim() };
        }
        catch (error) {
            console.error(`[Snapshot] Compress error: ${error.message}`);
            return { before: 'unknown', after: 'unknown' };
        }
    }
    /**
     * Prune old snapshots, keeping only the last N.
     * No-op for Daytona sandboxes.
     */
    async pruneOldSnapshots(containerId, keepCount = 50) {
        if (isDaytonaId(containerId))
            return 0;
        try {
            // Get total commit count
            const countStr = await execInContainer(containerId, 'cd /workspace && git rev-list --count HEAD 2>/dev/null || echo "0"');
            const totalCount = parseInt(countStr) || 0;
            if (totalCount <= keepCount) {
                return 0;
            }
            // Get the hash of the commit to keep as new root
            const keepHash = await execInContainer(containerId, `cd /workspace && git rev-parse HEAD~${keepCount} 2>/dev/null`);
            if (!keepHash.trim())
                return 0;
            // Squash old commits (rewrite history)
            await execInContainer(containerId, `cd /workspace && git checkout --orphan temp_branch ${keepHash.trim()} && git commit -m "[auto] Squashed old snapshots" && git checkout main && git reset --hard temp_branch && git branch -D temp_branch 2>/dev/null || true`);
            // Clean up
            await this.compress(containerId);
            const pruned = totalCount - keepCount;
            console.log(`[Snapshot] Pruned ${pruned} old snapshots`);
            return pruned;
        }
        catch (error) {
            console.error(`[Snapshot] Prune error: ${error.message}`);
            return 0;
        }
    }
    /**
     * Get repository stats.
     * Returns zeroed stats for Daytona sandboxes.
     */
    async getStats(containerId) {
        if (isDaytonaId(containerId)) {
            return { totalSnapshots: 0, repoSize: 'n/a', oldestSnapshot: null, newestSnapshot: null };
        }
        try {
            const [countStr, size, oldest, newest] = await Promise.all([
                execInContainer(containerId, 'cd /workspace && git rev-list --count HEAD 2>/dev/null || echo "0"'),
                execInContainer(containerId, 'cd /workspace && du -sh .git 2>/dev/null | cut -f1 || echo "0"'),
                execInContainer(containerId, 'cd /workspace && git log --reverse --format="%h %s" -1 2>/dev/null || echo ""'),
                execInContainer(containerId, 'cd /workspace && git log --format="%h %s" -1 2>/dev/null || echo ""'),
            ]);
            return {
                totalSnapshots: parseInt(countStr) || 0,
                repoSize: size.trim(),
                oldestSnapshot: oldest.trim() || null,
                newestSnapshot: newest.trim() || null,
            };
        }
        catch {
            return { totalSnapshots: 0, repoSize: '0', oldestSnapshot: null, newestSnapshot: null };
        }
    }
}
exports.SnapshotManager = SnapshotManager;
// Singleton instance
exports.snapshotManager = new SnapshotManager();
