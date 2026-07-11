/**
 * WorkspaceEngine — the orchestration brain (substrate-agnostic lifecycle).
 *
 * Ported VERBATIM (behavior-preserving) from
 * docker-backend/src/conductor/workspace-service.ts's lifecycle. Owns the
 * persisted Workspace lifecycle (control-plane state of record) and drives the
 * selected execution substrate through injected ports. Every state change is
 * written to the repository BEFORE/AFTER the substrate action, so a backend
 * restart never loses a workspace.
 *
 * NON-NEGOTIABLE ORDERING (preserved exactly): persist the Workspace record
 * FIRST (state of record), then admit → lock → provision/launch, persisting
 * every transition. A crash mid-provision leaves a recoverable `failed` record,
 * never a ghost session.
 *
 * The reconciler lives in ../reconcile (its own module). See
 * docs/CONDUCTOR-ARCHITECTURE.md and docs/subsystems/substrate.md §4.5/§4.6.
 */
import {
  transitionWorkspace,
  type TaskRun,
  type Workspace,
  type WorkspaceState,
  type WorkspaceSubstrate,
} from '@recoder/agent-os';
import { resolveRuntimeCommand } from '../command/index.js';
import type { WorkspaceEngineDeps } from './deps.js';
import type { CreateWorkspaceInput } from './types.js';

/** Marker prefixed onto an admission-rejection error so routes can map it to 429. */
export const ADMISSION_REJECTED_PREFIX = 'admission rejected: ';

export class WorkspaceEngine {
  readonly #deps: WorkspaceEngineDeps;

  constructor(deps: WorkspaceEngineDeps) {
    this.#deps = deps;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.#deps.repository.listWorkspaces();
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.#deps.repository.getWorkspace(workspaceId);
  }

  /** RunEvents streamed for a workspace's run (the live terminal + lifecycle log). */
  async listWorkspaceEvents(workspaceId: string) {
    const runId = `run_${workspaceId}`;
    const events = await this.#deps.repository.listEvents();
    return events.filter((e) => e.runId === runId);
  }

  /** Transition a persisted workspace to `to` (enforced state machine) and save it. */
  async advanceWorkspace(
    workspaceId: string,
    to: WorkspaceState,
    patch?: Partial<Workspace>,
    metadata?: Record<string, unknown>,
  ): Promise<Workspace> {
    const current = await this.#deps.repository.getWorkspace(workspaceId);
    if (!current) throw new Error(`workspace not found: ${workspaceId}`);
    const transitioned = transitionWorkspace({ ...current, ...patch }, to, { metadata });
    return this.#deps.repository.upsertWorkspace(transitioned);
  }

  /**
   * Create a workspace: persist the record first (state of record), then provision
   * the isolated worktree + launch the agent session, persisting each transition.
   *
   * v1 couples provisioning and launch (the substrate `launch` does both), so we
   * step created → setting_up → ready → running around that single call.
   */
  async createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    const { repository, registry, brain, lock, admission, runTailer, logger, clock, id } =
      this.#deps;

    const now = clock.now();
    const workspaceId = `ws_${id.newId()}`;
    const branch = input.branch || `recoder/${workspaceId}`;

    // Enrich the prompt with owned knowledge (task constraints, git-nexus repo
    // context, context7 docs) and record provenance, then resolve the real headless
    // CLI invocation. An explicit command bypasses enrichment. Fails fast (no stub)
    // if neither command nor a usable prompt is given.
    let knowledgeSources: string[] = [];
    let command = input.command;
    if (!command) {
      const enriched = brain
        ? await brain.enrichPrompt({
            prompt: input.prompt ?? '',
            taskId: input.taskId,
            repoPath: input.repoPath,
            library: input.library,
            userId: input.createdBy,
          })
        : { prompt: input.prompt ?? '', sources: [] };
      knowledgeSources = enriched.sources.map((s) => (typeof s === 'string' ? s : s.ref));
      command = resolveRuntimeCommand(input.runtimeId, {
        prompt: enriched.prompt,
        model: input.model,
      }).commandLine;
    }

    // Honor the requested substrate when it is registered; otherwise default to the
    // local tmux+worktree substrate. Never launch on an unknown substrate id.
    const requestedSubstrate = input.substrate;
    const substrate: WorkspaceSubstrate =
      requestedSubstrate && registry.list().includes(requestedSubstrate)
        ? requestedSubstrate
        : 'tmux_worktree';

    let workspace: Workspace = {
      workspaceId,
      spaceId: input.spaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      runtimeId: input.runtimeId,
      substrate,
      branch,
      baseRef: input.baseRef || 'HEAD',
      state: 'created',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...(input.metadata ?? {}),
        // Persist the ORIGINAL prompt (not the enriched one) so UIs can label
        // the workspace by its goal instead of the opaque branch/workspace id.
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(knowledgeSources.length ? { knowledgeSources } : {}),
      },
    };
    // State of record FIRST — survives a crash mid-provision.
    workspace = await repository.upsertWorkspace(workspace);

    // Resource governor: enforce per-project/user parallelism caps + disk/session
    // limits on the PRIMARY path (not just the multi-agent workflow runner). If
    // admission is refused, short-circuit to `failed` with the truthful reason and
    // do NOT launch — never silently over-admit and exhaust the box.
    if (admission) {
      const decision = await admission.admit(input.projectId, input.createdBy);
      if (!decision.admitted) {
        const message = `${ADMISSION_REJECTED_PREFIX}${decision.reason ?? 'resource limit reached'}`;
        workspace = await repository.upsertWorkspace(
          transitionWorkspace(workspace, 'failed', {
            metadata: {
              error: message,
              admission: { reason: decision.reason, current: decision.current },
            },
          }),
        );
        logger.warn('workspace launch refused — resource admission rejected', {
          workspaceId,
          projectId: input.projectId,
          createdBy: input.createdBy,
          reason: decision.reason,
        });
        return workspace;
      }
    }

    // Collision-prevention moat: claim an exclusive write-lock over this
    // workspace's scope BEFORE launching the agent. If another active workspace
    // already holds an overlapping path in the same repo, do NOT launch — fail the
    // workspace with a truthful conflict naming the holder. Degrade-safe: when the
    // coordination engine is unavailable, locking is skipped (workspace launches).
    const targetPaths = await this.#resolveTargetPaths(input.taskId);

    // Persist the lock scope (origin repo + declared write surface) into the record
    // so reconcile() can re-acquire the EXACT same lock after a backend restart
    // (the in-memory lock store is empty on restart). Without this, a surviving
    // live workspace would no longer hold its scope and a peer could over-claim it.
    workspace = await repository.upsertWorkspace({
      ...workspace,
      updatedAt: clock.now(),
      metadata: {
        ...(workspace.metadata ?? {}),
        lockScope: { repo: input.repoPath, ...(targetPaths ? { targetPaths } : {}) },
      },
    });

    const lockResult = lock
      ? await lock.acquire({
          workspaceId,
          spaceId: input.spaceId,
          taskId: input.taskId,
          repo: input.repoPath,
          targetPaths,
        })
      : ({ status: 'skipped', reason: 'no-lock-port' } as const);
    if (lockResult.status === 'conflict') {
      const detail = lockResult.conflicts
        .map((c) => `${c.pathGlob} held by workspace ${c.ownerAgentId} (task ${c.taskId})`)
        .join('; ');
      const message = `write-lock conflict: ${detail}`;
      workspace = await repository.upsertWorkspace(
        transitionWorkspace(workspace, 'failed', {
          metadata: { error: message, lockConflicts: lockResult.conflicts },
        }),
      );
      logger.warn('workspace launch refused — lock conflict', {
        workspaceId,
        repo: input.repoPath,
        conflicts: lockResult.conflicts,
      });
      return workspace;
    }

    let lockHeld = lockResult.status === 'acquired';

    try {
      workspace = await repository.upsertWorkspace(transitionWorkspace(workspace, 'setting_up'));

      const handle = await registry.get(workspace.substrate).launch({
        workspaceId,
        command,
        repoPath: input.repoPath,
        branch,
        baseRef: input.baseRef || 'HEAD',
        env: input.env,
      });

      workspace = await repository.upsertWorkspace(
        transitionWorkspace(
          { ...workspace, worktreePath: handle.worktreePath, sessionName: handle.sessionName },
          'ready',
        ),
      );
      // Create the control-plane run and start streaming terminal output into the
      // RunEvent log (the audit trail + UI/A2A source).
      const runId = `run_${workspaceId}`;
      const run: TaskRun = {
        runId,
        taskId: input.taskId,
        spaceId: input.spaceId,
        state: 'running',
        startedAt: clock.now(),
        updatedAt: clock.now(),
        metadata: { workspaceId, runtimeId: input.runtimeId },
      };
      await repository.upsertRun(run);

      workspace = await repository.upsertWorkspace(
        transitionWorkspace({ ...workspace, runId }, 'running'),
      );

      runTailer.start({
        workspaceId,
        taskId: input.taskId,
        runId,
        substrate: workspace.substrate,
        sessionName: handle.sessionName ?? handle.ref,
        worktreePath: handle.worktreePath,
      });

      logger.info('workspace created + running', {
        workspaceId,
        runId,
        branch,
        session: handle.sessionName ?? handle.ref,
      });
      return workspace;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Provisioning/launch failed — release the write-lock so the scope is freed
      // for another workspace (a held lock with no live agent would block forever).
      if (lockHeld && lock) {
        try {
          await lock.release({
            workspaceId,
            spaceId: input.spaceId,
            taskId: input.taskId,
            repo: input.repoPath,
          });
        } catch (releaseErr) {
          logger.warn('lock release after launch failure failed', { workspaceId, releaseErr });
        }
        lockHeld = false;
      }
      workspace = await repository.upsertWorkspace(
        transitionWorkspace(workspace, 'failed', { metadata: { error: message } }),
      );
      logger.error('workspace provisioning failed', { workspaceId, err });
      return workspace;
    }
  }

  /**
   * Resolve a task's declared write surface (`TaskSpec.targetPaths`) for lock
   * scoping. Returns `undefined` when the task is unknown — the lock layer then
   * falls back to a repo-wide claim. Never throws: a lookup failure degrades to an
   * undeclared scope rather than blocking workspace creation.
   */
  async #resolveTargetPaths(taskId: string): Promise<string[] | undefined> {
    try {
      const tasks = await this.#deps.repository.listTasks();
      const task = tasks.find((t) => t.taskId === taskId);
      return task?.targetPaths;
    } catch (err) {
      this.#deps.logger.warn('resolveTargetPaths failed; using repo-wide lock scope', {
        taskId,
        err,
      });
      return undefined;
    }
  }
}
