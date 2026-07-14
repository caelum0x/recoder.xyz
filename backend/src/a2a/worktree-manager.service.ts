/**
 * @module worktree-manager.service
 *
 * Git worktree management for parallel agent work isolation.
 *
 * Each agent works in its own git worktree, enabling concurrent file changes
 * without conflicts. Uses existing docker exec patterns from git-operations.ts.
 *
 * Worktree layout: /workspace/.worktrees/agent/<agentId>/<taskId>
 * Branch naming: agent/<agentId>/<taskId>
 */

import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { createLogger } from '../logger';
import type { WorktreeInfo, WorktreeStatus } from '@recoder/shared/a2a';

const logger = createLogger('a2a-worktree-manager');
const docker = new Docker();

// ---------------------------------------------------------------------------
// Docker exec helper (mirrors git-operations.ts pattern)
// ---------------------------------------------------------------------------

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
        result += raw.slice(i).toString();
        break;
      }
      resolve(result.trim());
    });
    stream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WorktreeManagerService {
  private readonly worktrees = new Map<string, WorktreeInfo>();

  /**
   * Create a new worktree for an agent's task.
   */
  async createWorktree(
    containerId: string,
    projectId: string,
    taskId: string,
    agentId: string,
  ): Promise<WorktreeInfo> {
    const branchName = `agent/${agentId}/${taskId}`;
    const worktreePath = `/workspace/.worktrees/agent/${agentId}/${taskId}`;

    // Ensure git is initialized
    await execInContainer(containerId, 'cd /workspace && git rev-parse --is-inside-work-tree 2>/dev/null || git init');

    // Get current branch as base
    const baseBranch = await execInContainer(
      containerId,
      'cd /workspace && git branch --show-current 2>/dev/null || echo "main"',
    );

    // Ensure there's at least one commit
    await execInContainer(
      containerId,
      'cd /workspace && git log --oneline -1 2>/dev/null || (git add -A && git commit -m "initial" --allow-empty)',
    );

    // Create the worktree directory
    await execInContainer(containerId, `mkdir -p $(dirname ${worktreePath})`);

    // Create worktree with new branch
    await execInContainer(
      containerId,
      `cd /workspace && git worktree add ${worktreePath} -b "${branchName}" 2>&1`,
    );

    const info: WorktreeInfo = {
      taskId,
      agentId,
      worktreePath,
      branchName,
      baseBranch: baseBranch || 'main',
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.worktrees.set(taskId, info);

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.WorktreeCreated,
      timestamp: info.createdAt,
      data: { worktree: info },
    });

    logger.info({ taskId, agentId, branchName }, 'worktree created');
    return info;
  }

  /**
   * List all worktrees in a container.
   */
  async listWorktrees(containerId: string): Promise<WorktreeInfo[]> {
    const output = await execInContainer(
      containerId,
      'cd /workspace && git worktree list --porcelain 2>/dev/null || echo ""',
    );

    if (!output) return [...this.worktrees.values()];

    // Parse porcelain output
    const worktrees: WorktreeInfo[] = [];
    const blocks = output.split('\n\n');

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const pathLine = lines.find((l) => l.startsWith('worktree '));
      const branchLine = lines.find((l) => l.startsWith('branch '));

      if (pathLine && branchLine) {
        const path = pathLine.replace('worktree ', '');
        const branch = branchLine.replace('branch refs/heads/', '');

        // Only include agent worktrees
        if (branch.startsWith('agent/')) {
          const parts = branch.split('/');
          const agentId = parts[1];
          const taskId = parts[2];

          if (agentId && taskId) {
            const existing = this.worktrees.get(taskId);
            worktrees.push(existing ?? {
              taskId,
              agentId,
              worktreePath: path,
              branchName: branch,
              baseBranch: 'main',
              status: 'active',
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return worktrees;
  }

  /**
   * Get the diff between a worktree branch and the base branch.
   */
  async getWorktreeDiff(containerId: string, taskId: string): Promise<string> {
    const info = this.worktrees.get(taskId);
    if (!info) throw new Error(`Worktree not found for task: ${taskId}`);

    const diff = await execInContainer(
      containerId,
      `cd /workspace && git diff ${info.baseBranch}...${info.branchName} 2>/dev/null || echo ""`,
    );

    return diff;
  }

  /**
   * Merge a worktree branch back to the base branch.
   */
  async mergeWorktree(
    containerId: string,
    taskId: string,
    strategy: 'merge' | 'rebase' = 'merge',
  ): Promise<{ success: boolean; conflicts: string[] }> {
    const info = this.worktrees.get(taskId);
    if (!info) throw new Error(`Worktree not found for task: ${taskId}`);

    // Switch to base branch in main worktree
    await execInContainer(
      containerId,
      `cd /workspace && git checkout ${info.baseBranch}`,
    );

    if (strategy === 'merge') {
      const result = await execInContainer(
        containerId,
        `cd /workspace && git merge --no-ff ${info.branchName} -m "Merge ${info.branchName}" 2>&1`,
      );

      if (result.includes('CONFLICT')) {
        const conflicts = result
          .split('\n')
          .filter((l) => l.includes('CONFLICT'))
          .map((l) => l.replace(/^CONFLICT.*:\s*/, '').trim());

        info.status = 'conflict';

        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.WorktreeConflict,
          timestamp: new Date().toISOString(),
          data: { taskId, conflicts },
        });

        return { success: false, conflicts };
      }

      info.status = 'merged';

      getA2AEventBus().publish({
        id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
        type: A2AEventType.WorktreeMerged,
        timestamp: new Date().toISOString(),
        data: { taskId, branchName: info.branchName },
      });

      logger.info({ taskId, branchName: info.branchName }, 'worktree merged');
      return { success: true, conflicts: [] };
    }

    // Rebase strategy
    const result = await execInContainer(
      containerId,
      `cd /workspace && git rebase ${info.branchName} 2>&1`,
    );

    if (result.includes('CONFLICT')) {
      info.status = 'conflict';
      return { success: false, conflicts: [result] };
    }

    info.status = 'merged';
    return { success: true, conflicts: [] };
  }

  /**
   * Detect merge conflicts without actually merging (dry run).
   */
  async detectConflicts(containerId: string, taskId: string): Promise<string[]> {
    const info = this.worktrees.get(taskId);
    if (!info) throw new Error(`Worktree not found for task: ${taskId}`);

    const result = await execInContainer(
      containerId,
      `cd /workspace && git merge --no-commit --no-ff ${info.branchName} 2>&1; git merge --abort 2>/dev/null; echo "DONE"`,
    );

    if (result.includes('CONFLICT')) {
      return result
        .split('\n')
        .filter((l) => l.includes('CONFLICT'))
        .map((l) => l.replace(/^CONFLICT.*:\s*/, '').trim());
    }

    return [];
  }

  /**
   * Clean up a worktree and its branch.
   */
  async cleanupWorktree(containerId: string, taskId: string): Promise<void> {
    const info = this.worktrees.get(taskId);
    if (!info) return;

    await execInContainer(
      containerId,
      `cd /workspace && git worktree remove ${info.worktreePath} --force 2>/dev/null; git branch -d "${info.branchName}" 2>/dev/null`,
    );

    info.status = 'removed';
    this.worktrees.delete(taskId);

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.WorktreeRemoved,
      timestamp: new Date().toISOString(),
      data: { taskId, branchName: info.branchName },
    });

    logger.info({ taskId, branchName: info.branchName }, 'worktree cleaned up');
  }

  /**
   * Get info for a specific worktree.
   */
  getWorktreeInfo(taskId: string): WorktreeInfo | undefined {
    return this.worktrees.get(taskId);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: WorktreeManagerService | null = null;

export function getWorktreeManagerService(): WorktreeManagerService {
  if (!_instance) {
    _instance = new WorktreeManagerService();
  }
  return _instance;
}

export function resetWorktreeManagerService(): void {
  _instance = null;
}
