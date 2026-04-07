"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorktreeManagerService = void 0;
exports.getWorktreeManagerService = getWorktreeManagerService;
exports.resetWorktreeManagerService = resetWorktreeManagerService;
const uuid_1 = require("uuid");
const dockerode_1 = __importDefault(require("dockerode"));
const a2a_event_bus_1 = require("./a2a-event-bus");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-worktree-manager');
const docker = new dockerode_1.default();
// ---------------------------------------------------------------------------
// Docker exec helper (mirrors git-operations.ts pattern)
// ---------------------------------------------------------------------------
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
class WorktreeManagerService {
    worktrees = new Map();
    /**
     * Create a new worktree for an agent's task.
     */
    async createWorktree(containerId, projectId, taskId, agentId) {
        const branchName = `agent/${agentId}/${taskId}`;
        const worktreePath = `/workspace/.worktrees/agent/${agentId}/${taskId}`;
        // Ensure git is initialized
        await execInContainer(containerId, 'cd /workspace && git rev-parse --is-inside-work-tree 2>/dev/null || git init');
        // Get current branch as base
        const baseBranch = await execInContainer(containerId, 'cd /workspace && git branch --show-current 2>/dev/null || echo "main"');
        // Ensure there's at least one commit
        await execInContainer(containerId, 'cd /workspace && git log --oneline -1 2>/dev/null || (git add -A && git commit -m "initial" --allow-empty)');
        // Create the worktree directory
        await execInContainer(containerId, `mkdir -p $(dirname ${worktreePath})`);
        // Create worktree with new branch
        await execInContainer(containerId, `cd /workspace && git worktree add ${worktreePath} -b "${branchName}" 2>&1`);
        const info = {
            taskId,
            agentId,
            worktreePath,
            branchName,
            baseBranch: baseBranch || 'main',
            status: 'active',
            createdAt: new Date().toISOString(),
        };
        this.worktrees.set(taskId, info);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.WorktreeCreated,
            timestamp: info.createdAt,
            data: { worktree: info },
        });
        logger.info({ taskId, agentId, branchName }, 'worktree created');
        return info;
    }
    /**
     * List all worktrees in a container.
     */
    async listWorktrees(containerId) {
        const output = await execInContainer(containerId, 'cd /workspace && git worktree list --porcelain 2>/dev/null || echo ""');
        if (!output)
            return [...this.worktrees.values()];
        // Parse porcelain output
        const worktrees = [];
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
    async getWorktreeDiff(containerId, taskId) {
        const info = this.worktrees.get(taskId);
        if (!info)
            throw new Error(`Worktree not found for task: ${taskId}`);
        const diff = await execInContainer(containerId, `cd /workspace && git diff ${info.baseBranch}...${info.branchName} 2>/dev/null || echo ""`);
        return diff;
    }
    /**
     * Merge a worktree branch back to the base branch.
     */
    async mergeWorktree(containerId, taskId, strategy = 'merge') {
        const info = this.worktrees.get(taskId);
        if (!info)
            throw new Error(`Worktree not found for task: ${taskId}`);
        // Switch to base branch in main worktree
        await execInContainer(containerId, `cd /workspace && git checkout ${info.baseBranch}`);
        if (strategy === 'merge') {
            const result = await execInContainer(containerId, `cd /workspace && git merge --no-ff ${info.branchName} -m "Merge ${info.branchName}" 2>&1`);
            if (result.includes('CONFLICT')) {
                const conflicts = result
                    .split('\n')
                    .filter((l) => l.includes('CONFLICT'))
                    .map((l) => l.replace(/^CONFLICT.*:\s*/, '').trim());
                info.status = 'conflict';
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.WorktreeConflict,
                    timestamp: new Date().toISOString(),
                    data: { taskId, conflicts },
                });
                return { success: false, conflicts };
            }
            info.status = 'merged';
            (0, a2a_event_bus_1.getA2AEventBus)().publish({
                id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                type: a2a_event_bus_1.A2AEventType.WorktreeMerged,
                timestamp: new Date().toISOString(),
                data: { taskId, branchName: info.branchName },
            });
            logger.info({ taskId, branchName: info.branchName }, 'worktree merged');
            return { success: true, conflicts: [] };
        }
        // Rebase strategy
        const result = await execInContainer(containerId, `cd /workspace && git rebase ${info.branchName} 2>&1`);
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
    async detectConflicts(containerId, taskId) {
        const info = this.worktrees.get(taskId);
        if (!info)
            throw new Error(`Worktree not found for task: ${taskId}`);
        const result = await execInContainer(containerId, `cd /workspace && git merge --no-commit --no-ff ${info.branchName} 2>&1; git merge --abort 2>/dev/null; echo "DONE"`);
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
    async cleanupWorktree(containerId, taskId) {
        const info = this.worktrees.get(taskId);
        if (!info)
            return;
        await execInContainer(containerId, `cd /workspace && git worktree remove ${info.worktreePath} --force 2>/dev/null; git branch -d "${info.branchName}" 2>/dev/null`);
        info.status = 'removed';
        this.worktrees.delete(taskId);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.WorktreeRemoved,
            timestamp: new Date().toISOString(),
            data: { taskId, branchName: info.branchName },
        });
        logger.info({ taskId, branchName: info.branchName }, 'worktree cleaned up');
    }
    /**
     * Get info for a specific worktree.
     */
    getWorktreeInfo(taskId) {
        return this.worktrees.get(taskId);
    }
}
exports.WorktreeManagerService = WorktreeManagerService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getWorktreeManagerService() {
    if (!_instance) {
        _instance = new WorktreeManagerService();
    }
    return _instance;
}
function resetWorktreeManagerService() {
    _instance = null;
}
