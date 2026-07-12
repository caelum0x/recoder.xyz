/**
 * docker-backend's concrete engine bindings for the runtime-agnostic
 * `@recoder/agent-mcp` in-proc servers.
 *
 * The `git_nexus`, `tasks`, and `runs` MCP servers in `@recoder/agent-mcp` are
 * REAL but injected behind ports (GitNexusPort, TaskRepositoryPort,
 * RunRepositoryPort). They never assume a filesystem layout or own task/run
 * state. This module supplies the CONCRETE engines so those tools are live in
 * the product:
 *
 *  - GitNexusPort resolves the workspace/project repo path the same way the
 *    conductor does (absolute repoPath, else relative to CONDUCTOR_REPO_ROOT /
 *    process.cwd()), then the `@recoder/recodergit` indexer walks it.
 *  - TaskRepositoryPort + RunRepositoryPort are backed by the canonical agent-os
 *    store (`AgentOsRepository`) — the same store the rest of the control plane
 *    reads and writes — so task/run reads/writes are real canonical state.
 *
 * Nothing here fakes success: an unresolvable repo root throws a truthful error
 * (degrade-safe), and a missing task/run surfaces a not-found from the package
 * handlers rather than a fabricated result.
 */
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  McpRegistry,
  McpToolRouter,
  registerGitNexusMcpTools,
  registerRunsMcpTools,
  registerTasksMcpTools,
  registerMemoryMcpTools,
  gitNexusMcpServer,
  tasksMcpServer,
  runsMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  repoMcpServer,
  browserMcpServer,
  approvalsMcpServer,
  artifactsMcpServer,
  githubMcpServer,
  logsMcpServer,
  previewMcpServer,
  type GitNexusPort,
  type TaskRepositoryPort,
  type RunRepositoryPort,
} from '@recoder/agent-mcp';
import type { RunEvent, TaskRun, TaskSpec } from '@recoder/agent-os';
import type { AgentOsRepository } from '../repositories/agent-os.repository';
import { createRepositoryMemoryStore } from './memory-store-adapter.js';
import { registerBeadsMcpTools } from './beads-engine.js';
import { registerRepoMcpTools } from './repo-engine.js';
import { registerBrowserMcpTools } from './browser-engine.js';
import { registerApprovalsMcpTools, registerArtifactsMcpTools } from './store-engines.js';
import { registerGithubMcpTools } from './github-engine.js';
import { registerLogsMcpTools } from './logs-engine.js';
import { registerPreviewMcpTools, type PreviewEngineDeps } from './preview-engine.js';
import { getWorkspace, listWorkspaces } from '../../conductor/workspace-service.js';
import { runBrowserCheck } from '../../conductor/browser-check.js';

/**
 * Resolve a repo root to an absolute, scannable directory using the SAME source
 * the conductor uses for `repoPath`: an absolute path is taken as-is; a relative
 * `repo` (or `spaceId` fallback) is resolved against the conductor repo base
 * (`CONDUCTOR_REPO_ROOT`, else `process.cwd()`). The resolved path must exist and
 * be a directory; otherwise we throw a truthful error so the tool degrades
 * instead of scanning a phantom path.
 */
export function createGitNexusPort(
  options: { baseRepoRoot?: string } = {},
): GitNexusPort {
  const base =
    options.baseRepoRoot ?? process.env.CONDUCTOR_REPO_ROOT ?? process.cwd();
  return {
    resolveRepoRoot({ repo, spaceId }): string {
      const candidate = (repo ?? spaceId ?? '').trim();
      if (!candidate) {
        // No repo on the call/task -> default to the conductor base repo (the
        // monorepo checkout docker-backend runs from), the same root the
        // conductor's `git worktree list` operates over.
        return assertRepoDir(base);
      }
      const resolved = isAbsolute(candidate)
        ? candidate
        : resolve(base, candidate);
      return assertRepoDir(resolved);
    },
  };
}

function assertRepoDir(path: string): string {
  if (!path || !path.trim()) {
    throw new Error('git_nexus: repository root could not be resolved (empty path).');
  }
  if (!existsSync(path)) {
    throw new Error(`git_nexus: repository root does not exist on disk: ${path}`);
  }
  if (!statSync(path).isDirectory()) {
    throw new Error(`git_nexus: repository root is not a directory: ${path}`);
  }
  return path;
}

/**
 * Adapt the canonical `AgentOsRepository` (the control-plane store of record)
 * onto the `@recoder/agent-mcp` task + run repository ports. Reads filter the
 * canonical list; writes upsert into the canonical store. This is the SAME store
 * the rest of Agent OS uses, so MCP task/run mutations are real canonical state,
 * not a side mirror.
 */
export function createAgentOsRepositoryPorts(
  repository: AgentOsRepository,
): TaskRepositoryPort & RunRepositoryPort {
  return {
    async listTasks(filter): Promise<TaskSpec[]> {
      const tasks = await repository.listTasks();
      return tasks.filter((task) => {
        if (filter.spaceId && task.spaceId !== filter.spaceId) return false;
        if (filter.intent && task.intent !== filter.intent) return false;
        return true;
      });
    },
    async getTask(taskId): Promise<TaskSpec | null> {
      const tasks = await repository.listTasks();
      return tasks.find((task) => task.taskId === taskId) ?? null;
    },
    async saveTask(task): Promise<TaskSpec> {
      return repository.upsertTask(task);
    },
    async getRunForTask(taskId): Promise<TaskRun | null> {
      const runs = await repository.listRuns();
      // Most recent run for the task wins, mirroring control-plane read order.
      const forTask = runs.filter((run) => run.taskId === taskId);
      return forTask.length > 0 ? forTask[forTask.length - 1] : null;
    },
    async listRuns(filter): Promise<TaskRun[]> {
      const runs = await repository.listRuns();
      return runs.filter((run) => {
        if (filter.spaceId && run.spaceId !== filter.spaceId) return false;
        if (filter.taskId && run.taskId !== filter.taskId) return false;
        return true;
      });
    },
    async getRun(runId): Promise<TaskRun | null> {
      const runs = await repository.listRuns();
      return runs.find((run) => run.runId === runId) ?? null;
    },
    async saveRun(run): Promise<TaskRun> {
      return repository.upsertRun(run);
    },
    async appendRunEvent(_runId: string, event: RunEvent): Promise<void> {
      await repository.appendEvent(event);
    },
  };
}

/**
 * Build a real `McpToolRouter` populated with the git_nexus/tasks/runs handlers,
 * each backed by the concrete engines above. The router holds the package's REAL
 * handlers; the interop bundle delegates authorized in-proc calls into it (see
 * {@link forEachInProcEngineTool}).
 */
export function buildInProcEngineRouter(
  repository: AgentOsRepository,
  options: { baseRepoRoot?: string } = {},
): McpToolRouter {
  const router = new McpToolRouter(new McpRegistry());
  const gitNexusPort = createGitNexusPort(options);
  const repoPorts = createAgentOsRepositoryPorts(repository);

  registerGitNexusMcpTools(router, gitNexusPort);
  registerTasksMcpTools(router, repoPorts);
  registerRunsMcpTools(router, repoPorts);
  // Memory: an agent can search accepted durable memory and PROPOSE new memory
  // candidates with evidence (reviewed-memory model) — the compounding moat.
  registerMemoryMcpTools(router, createRepositoryMemoryStore(repository));
  // Beads: the issue graph — an agent reads ready work, inspects/creates/
  // updates/closes issues, checks sync. Shells to `bd` in the repo (degrade-safe).
  registerBeadsMcpTools(router, { cwd: options.baseRepoRoot });
  // Repo: governed, audited read-only repository inspection — read a file,
  // search the tree (git grep or GitHub), see the working diff. Traversal-guarded.
  registerRepoMcpTools(router, { baseRepoRoot: options.baseRepoRoot });
  // Browser: a real page an agent can VERIFY its own work in — open, snapshot
  // the text, assert content is present. Backed by the puppeteer automation.
  registerBrowserMcpTools(router);
  // Governance loop from the agent's side: request approval before a sensitive
  // action; attach output artifacts to the task's audit trail.
  registerApprovalsMcpTools(router, repository);
  registerArtifactsMcpTools(router, repository);
  // GitHub: find repos, open PRs, comment — via the gh CLI (writes are gated).
  registerGithubMcpTools(router, { baseRepoRoot: options.baseRepoRoot });
  // Logs: search / read the run event log so an agent can inspect what happened.
  registerLogsMcpTools(router, repository);
  // Preview: close the verify-your-own-work loop on a live preview of the agent's
  // OWN workspace — resolve the conductor-owned preview URL, probe health, run the
  // richer headless browser-check, attach evidence to the audit trail.
  registerPreviewMcpTools(router, repository, createPreviewEngineDeps());

  return router;
}

/**
 * Real preview-engine deps, wired onto the conductor's workspace service +
 * browser-check. The conductor OWNS the preview URL (on workspace metadata); this
 * only reads it. `runBrowserCheck` is degrade-safe by construction (skips when no
 * preview / no browser driver), so exposing it to an agent never fabricates health.
 */
export function createPreviewEngineDeps(): PreviewEngineDeps {
  return {
    getWorkspace: (id) => getWorkspace(id),
    listWorkspaces: () => listWorkspaces(),
    runBrowserCheck: (workspaceId) => runBrowserCheck(workspaceId),
  };
}

/** The in-proc servers whose tools this module owns the concrete engines for. */
export const ENGINE_SERVERS = [
  gitNexusMcpServer,
  tasksMcpServer,
  runsMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  repoMcpServer,
  browserMcpServer,
  approvalsMcpServer,
  artifactsMcpServer,
  githubMcpServer,
  logsMcpServer,
  previewMcpServer,
] as const;

/**
 * Iterate every `(serverId, toolName)` the engine router can execute, so the
 * interop bundle can register a delegating in-proc handler per tool that routes
 * authorized calls into the real router.
 */
export function forEachInProcEngineTool(
  callback: (serverId: string, toolName: string) => void,
): void {
  for (const server of ENGINE_SERVERS) {
    for (const toolName of server.toolNames) {
      callback(server.serverId, toolName);
    }
  }
}
