"use strict";
/**
 * @module git-adapter
 *
 * Git-based protocol adapter for the A2A layer.
 *
 * Enables agent communication via git operations: branch-based task handoff,
 * commit-based result delivery, and PR-based code review workflows.
 * Used by VS Code+Copilot, JetBrains, and any agent that operates on
 * git repositories.
 *
 * Communication pattern:
 * 1. Orchestrator creates a task branch: `a2a/<taskId>`
 * 2. Task description written to `.a2a/task.json` on the branch
 * 3. Agent picks up the branch, does work, commits results
 * 4. Agent writes result to `.a2a/result.json` and pushes
 * 5. Orchestrator polls or receives webhook, reads result
 *
 * P17-002: Git Protocol Adapter
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitAdapter = exports.DefaultGitExecutor = exports.DEFAULT_GIT_ADAPTER_CONFIG = void 0;
exports.registerGitAdapter = registerGitAdapter;
exports.getGitAdapter = getGitAdapter;
exports.listGitAdapters = listGitAdapters;
exports.unregisterGitAdapter = unregisterGitAdapter;
exports.resetGitAdapters = resetGitAdapters;
const events_1 = require("events");
const logger_1 = require("../../logger");
const a2a_1 = require("@recoder/shared/a2a");
const task_lifecycle_service_1 = require("../task-lifecycle.service");
const logger = (0, logger_1.createLogger)('a2a-git-adapter');
/** Default configuration values. */
exports.DEFAULT_GIT_ADAPTER_CONFIG = {
    remoteName: 'origin',
    baseBranch: 'main',
    branchPrefix: 'a2a/',
    metadataDir: '.a2a',
    pollIntervalMs: 10_000,
    maxPollAttempts: 60,
    auth: { type: 'none' },
};
// ---------------------------------------------------------------------------
// Default Git executor (shells out to git CLI)
// ---------------------------------------------------------------------------
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class DefaultGitExecutor {
    async exec(args, cwd) {
        const cmd = `git ${args.join(' ')}`;
        const { stdout } = await execAsync(cmd, { cwd, timeout: 30_000 });
        return stdout.trim();
    }
    async readFileFromBranch(branch, filePath, cwd) {
        try {
            return await this.exec(['show', `${branch}:${filePath}`], cwd);
        }
        catch {
            return null;
        }
    }
    async writeFileOnBranch(branch, filePath, content, commitMessage, cwd) {
        // Ensure we're on the right branch
        await this.exec(['checkout', branch], cwd);
        // Write file
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const fullPath = path.join(cwd, filePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        // Stage and commit
        await this.exec(['add', filePath], cwd);
        const hash = await this.exec(['commit', '-m', commitMessage], cwd);
        return hash;
    }
    async branchExists(branch, cwd) {
        try {
            await this.exec(['rev-parse', '--verify', branch], cwd);
            return true;
        }
        catch {
            return false;
        }
    }
    async listBranches(prefix, cwd) {
        try {
            const output = await this.exec(['branch', '--list', `${prefix}*`, '--format=%(refname:short)'], cwd);
            return output.split('\n').filter(Boolean);
        }
        catch {
            return [];
        }
    }
}
exports.DefaultGitExecutor = DefaultGitExecutor;
// ---------------------------------------------------------------------------
// Git Adapter
// ---------------------------------------------------------------------------
class GitAdapter extends events_1.EventEmitter {
    config;
    git;
    activeTasks = new Map();
    totalTasksCreated = 0;
    totalTasksCompleted = 0;
    totalTasksFailed = 0;
    lastActivityAt = null;
    _status = 'idle';
    constructor(config, gitExecutor) {
        super();
        this.config = { ...exports.DEFAULT_GIT_ADAPTER_CONFIG, ...config };
        this.git = gitExecutor ?? new DefaultGitExecutor();
        logger.info({ adapterId: config.adapterId, repoPath: config.repoPath }, 'Git adapter created');
    }
    /** Adapter ID. */
    get adapterId() {
        return this.config.adapterId;
    }
    /** Current status. */
    get status() {
        return this._status;
    }
    // -----------------------------------------------------------------------
    // Create task branch
    // -----------------------------------------------------------------------
    /**
     * Create a new task branch with the task descriptor.
     * The branch is created from the configured base branch.
     */
    async createTaskBranch(input) {
        const branchName = `${this.config.branchPrefix}${input.taskId}`;
        const cwd = this.config.repoPath;
        try {
            this._status = 'active';
            this.lastActivityAt = new Date().toISOString();
            // Build envelope
            const envelope = {
                envelopeVersion: a2a_1.RECODER_A2A_ENVELOPE_VERSION,
                protocolVersion: a2a_1.RECODER_A2A_PROTOCOL_VERSION,
                messageId: (0, task_lifecycle_service_1.generateId)('msg'),
                threadId: (0, task_lifecycle_service_1.generateId)('thread'),
                createdAt: new Date().toISOString(),
                from: this.config.localIdentity,
                to: input.targetAgent,
                intent: input.intent ?? 'execute',
                payload: [{ kind: 'text', text: input.prompt }],
                metadata: { ...input.metadata, taskId: input.taskId },
            };
            // Build task descriptor
            const descriptor = {
                taskId: input.taskId,
                envelope,
                createdAt: new Date().toISOString(),
                assignedTo: input.targetAgent,
                status: 'pending',
            };
            // Create branch from base
            const baseBranch = this.config.baseBranch;
            await this.git.exec(['checkout', '-b', branchName, baseBranch], cwd);
            // Write task descriptor
            const metadataDir = this.config.metadataDir;
            await this.git.writeFileOnBranch(branchName, `${metadataDir}/task.json`, JSON.stringify(descriptor, null, 2), `a2a: create task ${input.taskId}`, cwd);
            // Track the branch
            this.activeTasks.set(input.taskId, {
                branchName,
                taskId: input.taskId,
                descriptor,
                result: null,
                lastCommitHash: null,
                lastCommitAt: null,
            });
            this.totalTasksCreated++;
            this._status = 'idle';
            this.emit('task.branch-created', {
                adapterId: this.config.adapterId,
                branchName,
                taskId: input.taskId,
                timestamp: new Date().toISOString(),
            });
            logger.info({ adapterId: this.config.adapterId, branchName, taskId: input.taskId }, 'task branch created');
            return { success: true, branchName, taskId: input.taskId };
        }
        catch (err) {
            this._status = 'error';
            const error = err.message ?? 'Failed to create task branch';
            logger.error({ adapterId: this.config.adapterId, taskId: input.taskId, error }, 'task branch creation failed');
            this.emit('error', {
                adapterId: this.config.adapterId,
                error,
                timestamp: new Date().toISOString(),
            });
            return { success: false, branchName, taskId: input.taskId, error };
        }
    }
    // -----------------------------------------------------------------------
    // Poll for task result
    // -----------------------------------------------------------------------
    /**
     * Poll the task branch for a result.json file indicating completion.
     * Returns when the result is found or maxPollAttempts is reached.
     */
    async pollTaskResult(taskId) {
        const branch = this.activeTasks.get(taskId);
        if (!branch) {
            return { found: false, attempts: 0, error: `No active task branch for taskId: ${taskId}` };
        }
        const cwd = this.config.repoPath;
        const metadataDir = this.config.metadataDir;
        const maxAttempts = this.config.maxPollAttempts;
        const interval = this.config.pollIntervalMs;
        this._status = 'polling';
        let attempts = 0;
        while (attempts < maxAttempts) {
            attempts++;
            try {
                // Fetch latest from remote
                await this.git.exec(['fetch', this.config.remoteName, branch.branchName], cwd).catch(() => { });
                // Try to read result.json from the branch
                const resultJson = await this.git.readFileFromBranch(branch.branchName, `${metadataDir}/result.json`, cwd);
                if (resultJson) {
                    const result = JSON.parse(resultJson);
                    branch.result = result;
                    if (result.status === 'completed') {
                        this.totalTasksCompleted++;
                    }
                    else if (result.status === 'failed') {
                        this.totalTasksFailed++;
                    }
                    this._status = 'idle';
                    this.lastActivityAt = new Date().toISOString();
                    this.emit('task.result-detected', {
                        adapterId: this.config.adapterId,
                        taskId,
                        result,
                        timestamp: new Date().toISOString(),
                    });
                    return { found: true, result, attempts };
                }
            }
            catch (err) {
                logger.debug({ taskId, attempt: attempts, error: err.message }, 'poll attempt failed');
            }
            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
        // Timed out
        this._status = 'idle';
        this.emit('task.poll-timeout', {
            adapterId: this.config.adapterId,
            taskId,
            attempts,
            timestamp: new Date().toISOString(),
        });
        return { found: false, attempts, error: `Poll timed out after ${attempts} attempts` };
    }
    // -----------------------------------------------------------------------
    // List task branches
    // -----------------------------------------------------------------------
    /**
     * List all A2A task branches in the repository.
     */
    async listTaskBranches() {
        const cwd = this.config.repoPath;
        const prefix = this.config.branchPrefix;
        const branches = await this.git.listBranches(prefix, cwd);
        const results = [];
        for (const branchName of branches) {
            const taskId = branchName.replace(prefix, '');
            const existing = this.activeTasks.get(taskId);
            if (existing) {
                results.push(existing);
                continue;
            }
            // Try to read metadata from the branch
            const metadataDir = this.config.metadataDir;
            let descriptor = null;
            let result = null;
            const taskJson = await this.git.readFileFromBranch(branchName, `${metadataDir}/task.json`, cwd);
            if (taskJson) {
                try {
                    descriptor = JSON.parse(taskJson);
                }
                catch { /* skip */ }
            }
            const resultJson = await this.git.readFileFromBranch(branchName, `${metadataDir}/result.json`, cwd);
            if (resultJson) {
                try {
                    result = JSON.parse(resultJson);
                }
                catch { /* skip */ }
            }
            results.push({
                branchName,
                taskId,
                descriptor,
                result,
                lastCommitHash: null,
                lastCommitAt: null,
            });
        }
        return results;
    }
    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    /**
     * Remove a completed task branch (local only by default).
     */
    async cleanupTaskBranch(taskId, deleteRemote = false) {
        const branch = this.activeTasks.get(taskId);
        if (!branch)
            return false;
        const cwd = this.config.repoPath;
        try {
            // Switch to base branch first
            await this.git.exec(['checkout', this.config.baseBranch], cwd);
            // Delete local branch
            await this.git.exec(['branch', '-D', branch.branchName], cwd);
            if (deleteRemote) {
                await this.git.exec(['push', this.config.remoteName, '--delete', branch.branchName], cwd).catch(() => { });
            }
            this.activeTasks.delete(taskId);
            return true;
        }
        catch (err) {
            logger.error({ adapterId: this.config.adapterId, taskId, error: err.message }, 'branch cleanup failed');
            return false;
        }
    }
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    getState() {
        return {
            adapterId: this.config.adapterId,
            status: this._status,
            repoPath: this.config.repoPath,
            activeBranches: this.activeTasks.size,
            totalTasksCreated: this.totalTasksCreated,
            totalTasksCompleted: this.totalTasksCompleted,
            totalTasksFailed: this.totalTasksFailed,
            lastActivityAt: this.lastActivityAt,
        };
    }
}
exports.GitAdapter = GitAdapter;
// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------
const gitAdapterRegistry = new Map();
function registerGitAdapter(adapter) {
    gitAdapterRegistry.set(adapter.adapterId, adapter);
    logger.info({ adapterId: adapter.adapterId }, 'Git adapter registered');
}
function getGitAdapter(adapterId) {
    return gitAdapterRegistry.get(adapterId);
}
function listGitAdapters() {
    return [...gitAdapterRegistry.values()];
}
function unregisterGitAdapter(adapterId) {
    return gitAdapterRegistry.delete(adapterId);
}
function resetGitAdapters() {
    gitAdapterRegistry.clear();
}
