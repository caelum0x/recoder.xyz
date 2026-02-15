/**
 * Git-based Snapshot Manager
 * Handles project snapshots using Git for instant rollback/restore
 * 
 * Each snapshot is a Git commit in the project's /workspace directory.
 * This enables:
 * - Instant restore to any previous state
 * - Diff comparison between snapshots
 * - Auto-save at key moments (before AI changes, after user saves)
 */

import Docker from 'dockerode';

const docker = new Docker();

export interface Snapshot {
  id: string;           // Git commit hash (short)
  fullHash: string;     // Full commit hash
  message: string;      // Snapshot description
  timestamp: number;    // Unix timestamp
  author: string;       // 'user' | 'ai' | 'auto'
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  neonDbTimestamp?: string;  // ISO timestamp of Neon DB state at snapshot time
}

export interface SnapshotDiff {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    additions: number;
    deletions: number;
    diff?: string; // Unified diff content
  }>;
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
}

async function execInContainer(containerId: string, cmd: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const chunks: Buffer[] = [];
  
  return new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
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
export class SnapshotManager {
  private autoSaveIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private autoSaveEnabled = new Map<string, boolean>();

  /**
   * Initialize Git repository in container if not exists
   */
  async initRepo(containerId: string): Promise<void> {
    try {
      // Check if .git exists
      const hasGit = await execInContainer(containerId, 
        'cd /workspace && test -d .git && echo "yes" || echo "no"'
      );

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
    } catch (error: any) {
      console.error(`[Snapshot] Init error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new snapshot (Git commit)
   */
  async createSnapshot(
    containerId: string,
    projectId: string,
    message: string,
    author: 'user' | 'ai' | 'auto' = 'user',
    options?: { neonDbTimestamp?: string }
  ): Promise<Snapshot> {
    try {
      await this.initRepo(containerId);

      // Stage all changes
      await execInContainer(containerId, 'cd /workspace && git add -A');

      // Check if there are changes to commit
      const status = await execInContainer(containerId, 'cd /workspace && git status --porcelain');

      if (!status.trim()) {
        // No changes, return current HEAD
        const headInfo = await this.getCurrentSnapshot(containerId);
        if (headInfo) return headInfo;
        throw new Error('No changes to snapshot');
      }

      // Create commit with metadata in message
      const fullMessage = `[${author}] ${message}`;
      await execInContainer(containerId,
        `cd /workspace && git commit -m "${fullMessage.replace(/"/g, '\\"')}" --allow-empty`
      );

      // Store neonDbTimestamp in git notes if provided
      if (options?.neonDbTimestamp) {
        const noteContent = JSON.stringify({ neonDbTimestamp: options.neonDbTimestamp });
        await execInContainer(containerId,
          `cd /workspace && git notes add -m '${noteContent.replace(/'/g, "'\\''")}' HEAD 2>/dev/null || true`
        );
      }

      // Get commit info
      const commitInfo = await execInContainer(containerId,
        'cd /workspace && git log -1 --format="%H|%h|%s|%at"'
      );

      const [fullHash, shortHash, commitMessage, timestamp] = commitInfo.split('|');

      // Get diff stats
      const stats = await execInContainer(containerId,
        'cd /workspace && git diff --stat HEAD~1 HEAD 2>/dev/null | tail -1 || echo "0 files changed"'
      );

      const statsMatch = stats.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
      const filesChanged = statsMatch ? parseInt(statsMatch[1]) || 0 : 0;
      const additions = statsMatch ? parseInt(statsMatch[2]) || 0 : 0;
      const deletions = statsMatch ? parseInt(statsMatch[3]) || 0 : 0;

      const snapshot: Snapshot = {
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
    } catch (error: any) {
      console.error(`[Snapshot] Create error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current HEAD snapshot
   */
  async getCurrentSnapshot(containerId: string): Promise<Snapshot | null> {
    try {
      const commitInfo = await execInContainer(containerId,
        'cd /workspace && git log -1 --format="%H|%h|%s|%at" 2>/dev/null || echo ""'
      );

      if (!commitInfo.trim()) return null;

      const [fullHash, shortHash, message, timestamp] = commitInfo.split('|');

      // Extract author from message format: [author] message
      const authorMatch = message.match(/^\[(user|ai|auto)\]\s*/);
      const author = (authorMatch?.[1] || 'user') as 'user' | 'ai' | 'auto';
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
    } catch {
      return null;
    }
  }

  /**
   * List all snapshots (Git commits)
   */
  async listSnapshots(containerId: string, limit: number = 50): Promise<Snapshot[]> {
    try {
      await this.initRepo(containerId);

      const log = await execInContainer(containerId,
        `cd /workspace && git log --format="%H|%h|%s|%at" -n ${limit} 2>/dev/null || echo ""`
      );

      if (!log.trim()) return [];

      // Batch-read all git notes at once for efficiency
      const notesMap = await this.readAllNotes(containerId);

      const snapshots: Snapshot[] = log.split('\n').filter(Boolean).map(line => {
        const [fullHash, shortHash, message, timestamp] = line.split('|');

        // Extract author from message
        const authorMatch = message.match(/^\[(user|ai|auto)\]\s*/);
        const author = (authorMatch?.[1] || 'user') as 'user' | 'ai' | 'auto';
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
    } catch (error: any) {
      console.error(`[Snapshot] List error: ${error.message}`);
      return [];
    }
  }

  /**
   * Restore to a specific snapshot
   */
  async restoreSnapshot(containerId: string, projectId: string, snapshotId: string): Promise<boolean> {
    try {
      // Use git checkout to restore files from specific commit
      await execInContainer(containerId,
        `cd /workspace && git checkout ${snapshotId} -- .`
      );

      console.log(`[Snapshot] Restored to: ${snapshotId} for ${projectId}`);
      return true;
    } catch (error: any) {
      console.error(`[Snapshot] Restore error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get neonDbTimestamp for a specific snapshot (public, for restore route)
   */
  async getSnapshotDbTimestamp(containerId: string, snapshotId: string): Promise<string | undefined> {
    try {
      // Resolve short hash to full hash
      const fullHash = await execInContainer(containerId,
        `cd /workspace && git rev-parse ${snapshotId} 2>/dev/null || echo ""`
      );
      if (!fullHash.trim()) return undefined;
      return this.readNoteTimestamp(containerId, fullHash.trim());
    } catch {
      return undefined;
    }
  }

  /**
   * Read neonDbTimestamp from git notes for a single commit
   */
  private async readNoteTimestamp(containerId: string, commitHash: string): Promise<string | undefined> {
    try {
      const note = await execInContainer(containerId,
        `cd /workspace && git notes show ${commitHash} 2>/dev/null || echo ""`
      );
      if (!note.trim()) return undefined;
      const parsed = JSON.parse(note.trim());
      return parsed.neonDbTimestamp || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Batch-read all git notes (hash → neonDbTimestamp) for efficiency
   */
  private async readAllNotes(containerId: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const notesOutput = await execInContainer(containerId,
        'cd /workspace && git notes list 2>/dev/null || echo ""'
      );
      if (!notesOutput.trim()) return map;

      // git notes list outputs: <note-blob-hash> <commit-hash>
      const lines = notesOutput.split('\n').filter(Boolean);
      for (const line of lines) {
        const [noteBlob, commitHash] = line.split(/\s+/);
        if (!noteBlob || !commitHash) continue;
        try {
          const noteContent = await execInContainer(containerId,
            `cd /workspace && git cat-file -p ${noteBlob} 2>/dev/null || echo ""`
          );
          if (noteContent.trim()) {
            const parsed = JSON.parse(noteContent.trim());
            if (parsed.neonDbTimestamp) {
              map.set(commitHash, parsed.neonDbTimestamp);
            }
          }
        } catch {
          // Skip malformed notes
        }
      }
    } catch {
      // Notes not available
    }
    return map;
  }

  /**
   * Get diff between two snapshots
   */
  async getDiff(
    containerId: string,
    fromSnapshot: string,
    toSnapshot: string = 'HEAD'
  ): Promise<SnapshotDiff> {
    try {
      // Get file-level diff stats
      const statsOutput = await execInContainer(containerId,
        `cd /workspace && git diff --numstat ${fromSnapshot} ${toSnapshot} 2>/dev/null || echo ""`
      );

      const files: SnapshotDiff['files'] = [];
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
      const statusOutput = await execInContainer(containerId,
        `cd /workspace && git diff --name-status ${fromSnapshot} ${toSnapshot} 2>/dev/null || echo ""`
      );

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
    } catch (error: any) {
      console.error(`[Snapshot] Diff error: ${error.message}`);
      return { files: [], summary: { filesChanged: 0, additions: 0, deletions: 0 } };
    }
  }

  /**
   * Get unified diff for a specific file between snapshots
   */
  async getFileDiff(
    containerId: string,
    filePath: string,
    fromSnapshot: string,
    toSnapshot: string = 'HEAD'
  ): Promise<string> {
    try {
      const diff = await execInContainer(containerId,
        `cd /workspace && git diff ${fromSnapshot} ${toSnapshot} -- "${filePath}" 2>/dev/null || echo ""`
      );
      return diff;
    } catch {
      return '';
    }
  }

  /**
   * Enable auto-save for a project
   */
  startAutoSave(
    containerId: string,
    projectId: string,
    intervalMs: number = 5 * 60 * 1000 // Default: 5 minutes
  ): void {
    // Clear any existing interval
    this.stopAutoSave(projectId);

    this.autoSaveEnabled.set(projectId, true);

    const interval = setInterval(async () => {
      if (!this.autoSaveEnabled.get(projectId)) return;

      try {
        // Check if there are changes
        const status = await execInContainer(containerId, 
          'cd /workspace && git status --porcelain'
        );

        if (status.trim()) {
          await this.createSnapshot(containerId, projectId, 'Auto-save', 'auto');
        }
      } catch (error: any) {
        console.error(`[Snapshot] Auto-save error for ${projectId}: ${error.message}`);
      }
    }, intervalMs);

    this.autoSaveIntervals.set(projectId, interval);
    console.log(`[Snapshot] Auto-save enabled for ${projectId} (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop auto-save for a project
   */
  stopAutoSave(projectId: string): void {
    const interval = this.autoSaveIntervals.get(projectId);
    if (interval) {
      clearInterval(interval);
      this.autoSaveIntervals.delete(projectId);
    }
    this.autoSaveEnabled.set(projectId, false);
    console.log(`[Snapshot] Auto-save disabled for ${projectId}`);
  }

  /**
   * Check if there are unsaved changes
   */
  async hasUnsavedChanges(containerId: string): Promise<boolean> {
    try {
      const status = await execInContainer(containerId, 
        'cd /workspace && git status --porcelain'
      );
      return status.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get file content at a specific snapshot
   */
  async getFileAtSnapshot(
    containerId: string,
    filePath: string,
    snapshotId: string
  ): Promise<string | null> {
    try {
      const content = await execInContainer(containerId,
        `cd /workspace && git show ${snapshotId}:"${filePath}" 2>/dev/null`
      );
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Compress Git repository to save space
   * Git already compresses objects, but gc --aggressive optimizes further
   */
  async compress(containerId: string): Promise<{ before: string; after: string }> {
    try {
      // Get size before
      const before = await execInContainer(containerId,
        'cd /workspace && du -sh .git 2>/dev/null | cut -f1'
      );

      // Run aggressive garbage collection
      await execInContainer(containerId,
        'cd /workspace && git gc --aggressive --prune=now 2>/dev/null'
      );

      // Get size after
      const after = await execInContainer(containerId,
        'cd /workspace && du -sh .git 2>/dev/null | cut -f1'
      );

      console.log(`[Snapshot] Compressed: ${before.trim()} → ${after.trim()}`);
      return { before: before.trim(), after: after.trim() };
    } catch (error: any) {
      console.error(`[Snapshot] Compress error: ${error.message}`);
      return { before: 'unknown', after: 'unknown' };
    }
  }

  /**
   * Prune old snapshots, keeping only the last N
   */
  async pruneOldSnapshots(containerId: string, keepCount: number = 50): Promise<number> {
    try {
      // Get total commit count
      const countStr = await execInContainer(containerId,
        'cd /workspace && git rev-list --count HEAD 2>/dev/null || echo "0"'
      );
      const totalCount = parseInt(countStr) || 0;

      if (totalCount <= keepCount) {
        return 0;
      }

      // Get the hash of the commit to keep as new root
      const keepHash = await execInContainer(containerId,
        `cd /workspace && git rev-parse HEAD~${keepCount} 2>/dev/null`
      );

      if (!keepHash.trim()) return 0;

      // Squash old commits (rewrite history)
      await execInContainer(containerId,
        `cd /workspace && git checkout --orphan temp_branch ${keepHash.trim()} && git commit -m "[auto] Squashed old snapshots" && git checkout main && git reset --hard temp_branch && git branch -D temp_branch 2>/dev/null || true`
      );

      // Clean up
      await this.compress(containerId);

      const pruned = totalCount - keepCount;
      console.log(`[Snapshot] Pruned ${pruned} old snapshots`);
      return pruned;
    } catch (error: any) {
      console.error(`[Snapshot] Prune error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get repository stats
   */
  async getStats(containerId: string): Promise<{
    totalSnapshots: number;
    repoSize: string;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
  }> {
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
    } catch {
      return { totalSnapshots: 0, repoSize: '0', oldestSnapshot: null, newestSnapshot: null };
    }
  }
}

// Singleton instance
export const snapshotManager = new SnapshotManager();
