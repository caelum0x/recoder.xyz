/**
 * Recoder Conductor routes — manage parallel agent sessions (tmux + git worktrees).
 * The pivot product surface: start/observe/steer/stop many isolated agents.
 */
import { Router, type Request, type Response } from 'express';
import {
  conductorAvailability,
  startSession,
  listSessions,
  capturePane,
  sendKeys,
  killSession,
  paneExitCode,
} from './tmux-orchestrator.js';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  listWorkspaceEvents,
  reconcile,
  ADMISSION_REJECTED_PREFIX,
  type CreateWorkspaceInput,
} from './workspace-service.js';
import { normalizeCreateBody } from './create-defaults.js';
import { runtimeAvailability } from './runtime-commands.js';
import { listSubstrates, getSubstrate } from './substrate.js';
import { workspaceDiff, archiveWorkspace } from './review.js';
import { createWorkspacePr, mergeWorkspace } from './review-publish.js';
import { continueWorkspace } from './continue-workspace.js';
import {
  DeliveryApprovalRequiredError,
  type DeliveryIntent,
} from './delivery-approval.js';
import {
  dmuxAvailability,
  launchDmuxConsole,
  dmuxAttachCommand,
  dmuxVisibleSessions,
} from './dmux-adapter.js';
import {
  executeWorkflow,
  type WorkflowPattern,
  type WorkflowStep,
} from './workflow-runner.js';
import { conductorHealth } from './conductor-health.js';
import { resourceSnapshot } from './resource-governor.js';
import { steerRuntime, runtimeStatus } from './runtime-driver.js';
import type { SubstrateHandle } from './substrate.js';
import { isTerminalWorkspaceState, type Workspace } from '@recoder/agent-os';
import { attachWorkspaceStream } from './live-events.js';
import {
  generateDeliverySummary,
  generateMemoryCandidate,
} from './delivery-summary.js';
import { metrics } from './conductor-metrics.js';
import { governanceAuditEntries, verifyGovernanceAudit } from './governance-gate.js';
import {
  requireWorkspaceAccess,
  stampOwner,
  scopeBatchFilter,
} from './workspace-access.js';
import { bulkCancel, bulkArchive, listByState } from './batch-ops.js';
import { cleanupStaleWorktrees } from './worktree-cleanup.js';
import { planConductorRun, effectiveRuntimeId } from './conductor-planner.js';
import { agentOsContainer } from '../agent-os/service-container.js';
import { validateBody } from '../agent-os/middleware/schema-guard.middleware.js';
import { taskSpecSchema } from '@recoder/agent-schemas';
import type { Artifact, TaskSpec } from '@recoder/agent-os';
import {
  beadsAvailability,
  importReadyBeadsTasks,
  exportTaskToBeads,
} from './beads-sync.js';
import {
  parseWorkSignal,
  ingestWorkSignal,
  listWorkSignals,
} from './work-signals.js';

/**
 * Build the user-initiated delivery intent for a merge/PR POST. A merge/PR
 * request to this control plane is, by definition, the human operator initiating
 * the delivery, so we mark it `approve: true`. In solo mode (single-user desktop)
 * that click records the required approval automatically; for team/cloud
 * (RECODER_SOLO_MODE off) the intent is inert and the standard approval gate runs.
 *
 * `decidedBy` is the actor recorded as the approver in the audited Approval
 * record — taken from the request body (`decidedBy`/`createdBy`), defaulting to
 * `desktop-user` for the embedded single-user backend. An explicit
 * `approve: false` in the body opts out (treat as a non-user-initiated call).
 */
function buildDeliveryIntent(req: Request): DeliveryIntent {
  const body = (req.body ?? {}) as {
    approve?: unknown;
    decidedBy?: unknown;
    createdBy?: unknown;
    intentReason?: unknown;
  };
  const approve = body.approve === false ? false : true;
  const decidedBy =
    typeof body.decidedBy === 'string' && body.decidedBy.trim()
      ? body.decidedBy.trim()
      : typeof body.createdBy === 'string' && body.createdBy.trim()
        ? body.createdBy.trim()
        : undefined;
  const reason =
    typeof body.intentReason === 'string' && body.intentReason.trim()
      ? body.intentReason.trim()
      : undefined;
  return { approve, decidedBy, reason };
}

export function createConductorRouter(): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await conductorAvailability() });
  });

  router.get('/sessions', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await listSessions() });
  });

  router.post('/sessions', async (req: Request, res: Response) => {
    try {
      const { sessionId, repoPath, command, branch, baseRef } = req.body ?? {};
      if (!sessionId || !repoPath || !command) {
        res
          .status(400)
          .json({
            success: false,
            error: 'sessionId, repoPath, and command are required',
          });
        return;
      }
      const session = await startSession({
        sessionId,
        repoPath,
        command,
        branch,
        baseRef,
      });
      res.status(201).json({ success: true, data: session });
    } catch (err) {
      res
        .status(409)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'start failed',
        });
    }
  });

  router.get(
    '/sessions/:sessionId/output',
    async (req: Request, res: Response) => {
      try {
        const lines = Number(req.query?.lines ?? '200') || 200;
        res.json({
          success: true,
          data: { output: await capturePane(req.params.sessionId, lines) },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'capture failed';
        res
          .status(msg.includes('not found') ? 404 : 500)
          .json({ success: false, error: msg });
      }
    }
  );

  router.post(
    '/sessions/:sessionId/keys',
    async (req: Request, res: Response) => {
      try {
        const keys = String(req.body?.keys ?? '');
        if (!keys) {
          res.status(400).json({ success: false, error: 'keys is required' });
          return;
        }
        await sendKeys(req.params.sessionId, keys);
        res.json({ success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'send failed';
        res
          .status(msg.includes('not found') ? 404 : 500)
          .json({ success: false, error: msg });
      }
    }
  );

  router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
    await killSession(req.params.sessionId, {
      removeWorktree: req.query?.keepWorktree !== 'true',
    });
    res.json({ success: true });
  });

  // True exit code of a completed session's pane (distinguishes success from crash).
  router.get(
    '/sessions/:sessionId/exit-code',
    async (req: Request, res: Response) => {
      try {
        const code = await paneExitCode(
          `recoder-${req.params.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        );
        res.json({ success: true, data: { exitCode: code } });
      } catch (err) {
        res
          .status(500)
          .json({
            success: false,
            error:
              err instanceof Error ? err.message : 'exit-code check failed',
          });
      }
    }
  );

  // Which installed agent CLIs Conductor can actually launch (truthful availability).
  router.get('/runtimes', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await runtimeAvailability() });
  });

  // Registered execution substrates + their availability (tmux_worktree, daytona…).
  router.get('/substrates', async (_req: Request, res: Response) => {
    const data = await Promise.all(
      listSubstrates().map(async id => ({
        id,
        ...(await getSubstrate(id).available()),
      }))
    );
    res.json({ success: true, data });
  });

  // --- dmux operator console (OPTIONAL view layer over the tmux substrate) ---
  // dmux is never on the critical path; if absent, conductor works via tmux alone.

  router.get('/dmux', async (_req: Request, res: Response) => {
    const [availability, visibleSessions] = await Promise.all([
      dmuxAvailability(),
      dmuxVisibleSessions(),
    ]);
    res.json({ success: true, data: { ...availability, visibleSessions } });
  });

  router.post('/dmux/launch', async (req: Request, res: Response) => {
    try {
      const { repoPath, extraArgs } = req.body ?? {};
      if (!repoPath) {
        res.status(400).json({ success: false, error: 'repoPath is required' });
        return;
      }
      const availability = await dmuxAvailability();
      if (!availability.available) {
        res
          .status(409)
          .json({
            success: false,
            error: availability.reason ?? 'dmux unavailable',
          });
        return;
      }
      const result = launchDmuxConsole({ repoPath, extraArgs });
      res.status(201).json({
        success: true,
        data: {
          ...result,
          attachHint: `Run in your terminal: ${dmuxAttachCommand(repoPath)}`,
        },
      });
    } catch (err) {
      res
        .status(400)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'dmux launch failed',
        });
    }
  });

  // --- Workspaces: the persisted, restart-survivable unit of parallel work ---

  router.get('/workspaces', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await listWorkspaces() });
  });

  // PRE-LAUNCH PLAN (advisory): run @recoder/pal's planner over a TaskSpec to
  // recommend the runtime team + substrate + skills + tool grants + approval gates
  // + risk for a workspace BEFORE one is created. Resolve the canonical TaskSpec by
  // `taskId` from the agent-os repository (real control-plane state), or accept an
  // inline `task` body for spaces not yet persisted. This route does NOT launch
  // anything — it returns a recommendation the caller can act on (or override) when
  // calling POST /workspaces. The proven create path is unchanged.
  // An INLINE `task` (TaskSpec) is guarded at ingress against the canonical
  // @recoder/agent-schemas TaskSpec shape; a `taskId`-only body (resolved from
  // the repository below) skips the guard via the `select` returning undefined.
  router.post(
    '/workspaces/plan',
    validateBody(taskSpecSchema, {
      select: body => (body as { task?: unknown })?.task,
    }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body ?? {};
        let task: TaskSpec | undefined = body.task as TaskSpec | undefined;

        if (!task && body.taskId) {
          const tasks = await Promise.resolve(
            agentOsContainer.repository.listTasks()
          );
          task = tasks.find(t => t.taskId === body.taskId);
          if (!task) {
            res
              .status(404)
              .json({
                success: false,
                error: `task not found: ${body.taskId}`,
              });
            return;
          }
        }

        if (!task || !task.taskId) {
          res.status(400).json({
            success: false,
            error:
              'a persisted `taskId` or an inline `task` (TaskSpec) is required',
          });
          return;
        }

        const plan = planConductorRun(task);
        res.json({
          success: true,
          data: {
            ...plan,
            // The runtime the caller should actually launch given Conductor support.
            effectiveRuntimeId: effectiveRuntimeId(plan),
          },
        });
      } catch (err) {
        res
          .status(400)
          .json({
            success: false,
            error: err instanceof Error ? err.message : 'plan failed',
          });
      }
    }
  );

  router.post('/workspaces', async (req: Request, res: Response) => {
    try {
      // SIMPLE LOCAL CREATE: the embedded desktop cockpit form only sends
      // `{ repoPath, prompt?, runtimeId?, substrate? }`. Default the missing
      // canonical identity fields (spaceId/projectId/taskId/createdBy) BEFORE
      // validation so that minimal body succeeds. Full-payload callers are
      // untouched — any caller-provided value always wins (normalize is additive).
      const body = normalizeCreateBody<CreateWorkspaceInput>(req.body ?? {});
      const {
        spaceId,
        projectId,
        taskId,
        repoPath,
        runtimeId,
        substrate,
        command,
        prompt,
        model,
        createdBy,
        branch,
        baseRef,
        env,
        metadata,
      } = body;
      // After normalization, the only fields that carry REAL caller intent (and so
      // are never invented) are `repoPath` and one of `command|prompt`. The four
      // identity fields are guaranteed present by the normalizer when repoPath is.
      // `runtimeId` is OPTIONAL: when omitted, the conductor resolves the task's
      // canonical TaskSpec and lets @recoder/pal DEFAULT the runtime team +
      // substrate on the real create path. A caller-provided runtimeId still wins.
      if (!repoPath || (!command && !prompt)) {
        res.status(400).json({
          success: false,
          error:
            'repoPath and one of (command|prompt) are required (spaceId/projectId/taskId/createdBy default for a simple local create; runtimeId optional — pal will default it)',
        });
        return;
      }
      // The VERIFIED launching user (set by `authenticateRequest` upstream of this
      // router). Threaded ONLY as the entitlement subject for the remote-substrate
      // gate inside `createWorkspace`; it is distinct from the free-text `createdBy`
      // and is never forwarded to the engine. Absent ⇒ solo/internal create path.
      const userId = (req as Request & { userId?: string }).userId;
      const workspace = await createWorkspace({
        spaceId,
        projectId,
        taskId,
        repoPath,
        runtimeId,
        substrate,
        command,
        prompt,
        model,
        // Ownership becomes real here: under strict auth the VERIFIED caller
        // owns the workspace (a client cannot squat another user's name or
        // create a record it could not later access).
        createdBy: stampOwner(req, createdBy),
        branch,
        baseRef,
        env,
        metadata,
        userId,
      });
      // Resource-governor rejection maps to 429 (over budget, retry later);
      // any other failed launch (lock conflict, provisioning error) stays 409.
      if (workspace.state === 'failed') {
        const reason =
          typeof workspace.metadata?.error === 'string'
            ? workspace.metadata.error
            : '';
        const status = reason.startsWith(ADMISSION_REJECTED_PREFIX) ? 429 : 409;
        res
          .status(status)
          .json({
            success: false,
            error: reason || 'workspace launch failed',
            data: workspace,
          });
        return;
      }
      res.status(201).json({ success: true, data: workspace });
    } catch (err) {
      res
        .status(400)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'create failed',
        });
    }
  });

  router.get(
    '/workspaces/:workspaceId',
    async (req: Request, res: Response) => {
      const workspace = await getWorkspace(req.params.workspaceId);
      if (!workspace) {
        res.status(404).json({ success: false, error: 'workspace not found' });
        return;
      }
      res.json({ success: true, data: workspace });
    }
  );

  // Streamed RunEvents for the workspace's run (live terminal + lifecycle log).
  router.get(
    '/workspaces/:workspaceId/events',
    async (req: Request, res: Response) => {
      res.json({
        success: true,
        data: await listWorkspaceEvents(req.params.workspaceId),
      });
    }
  );

  // Reviewable diff of the workspace's worktree against its base ref.
  router.get(
    '/workspaces/:workspaceId/diff',
    async (req: Request, res: Response) => {
      try {
        res.json({
          success: true,
          data: await workspaceDiff(req.params.workspaceId),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'diff failed';
        res
          .status(msg.includes('not found') ? 404 : 500)
          .json({ success: false, error: msg });
      }
    }
  );

  // Open a PR for the workspace branch. Approval-gated: when no approval record
  // exists the workspace is moved to awaiting_approval and a 409 is returned (the
  // branch is not pushed and no PR is opened).
  router.post(
    '/workspaces/:workspaceId/pr',
    async (req: Request, res: Response) => {
      try {
        if (!(await requireWorkspaceAccess(req, res, req.params.workspaceId))) return;
        const { title, body, base, draft, remote } = req.body ?? {};
        const intent = buildDeliveryIntent(req);
        res.status(201).json({
          success: true,
          data: await createWorkspacePr(req.params.workspaceId, {
            title,
            body,
            base,
            draft,
            remote,
            intent,
          }),
        });
      } catch (err) {
        if (err instanceof DeliveryApprovalRequiredError) {
          res.status(409).json({
            success: false,
            error: err.message,
            data: {
              state: err.state,
              action: err.action,
              approvalId: err.approvalId,
              transitioned: err.transitioned,
              // Surface the @recoder/governance verdict so the cockpit can show the risk tier
              // + Merkle audit hash (truthful: nulls when governance is degraded/unavailable).
              governance: {
                tier: err.governanceTier ?? null,
                effect: err.governanceEffect ?? null,
                auditHash: err.governanceAuditHash ?? null,
                hardDeny: err.governanceHardDeny,
                degraded: err.governanceDegraded ?? false,
              },
            },
          });
          return;
        }
        const msg = err instanceof Error ? err.message : 'pr failed';
        res
          .status(msg.includes('not found') ? 404 : 400)
          .json({ success: false, error: msg });
      }
    }
  );

  // Merge the workspace PR. Approval-gated: a merge is a customer-visible delivery
  // and requires an approval record. Absent one, the workspace is moved to
  // awaiting_approval and a 409 is returned instead of silently merging.
  router.post(
    '/workspaces/:workspaceId/merge',
    async (req: Request, res: Response) => {
      try {
        if (!(await requireWorkspaceAccess(req, res, req.params.workspaceId))) return;
        const { strategy, deleteBranch } = req.body ?? {};
        // A merge POST is a user-initiated delivery: in solo mode (single-user
        // desktop) this click IS the approval, so carry an explicit approve intent.
        // Ignored for team/cloud (RECODER_SOLO_MODE off): the standard gate applies.
        const intent = buildDeliveryIntent(req);
        res.json({
          success: true,
          data: await mergeWorkspace(req.params.workspaceId, {
            strategy,
            deleteBranch,
            intent,
          }),
        });
      } catch (err) {
        if (err instanceof DeliveryApprovalRequiredError) {
          res.status(409).json({
            success: false,
            error: err.message,
            data: {
              state: err.state,
              action: err.action,
              approvalId: err.approvalId,
              transitioned: err.transitioned,
              // Surface the @recoder/governance verdict so the cockpit can show the risk tier
              // + Merkle audit hash (truthful: nulls when governance is degraded/unavailable).
              governance: {
                tier: err.governanceTier ?? null,
                effect: err.governanceEffect ?? null,
                auditHash: err.governanceAuditHash ?? null,
                hardDeny: err.governanceHardDeny,
                degraded: err.governanceDegraded ?? false,
              },
            },
          });
          return;
        }
        const msg = err instanceof Error ? err.message : 'merge failed';
        res
          .status(msg.includes('not found') ? 404 : 400)
          .json({ success: false, error: msg });
      }
    }
  );

  // CONTINUE / CHAT: send a NEW message to an existing workspace, starting another
  // agent run in the SAME worktree (the agent sees the prior changes). Each user
  // message is a new run — this is how the local chat keeps directing the agent.
  // Degrade-safe: a missing worktree, a running agent, a terminal state, or a
  // substrate without in-place relaunch returns a clear 4xx instead of guessing.
  router.post(
    '/workspaces/:workspaceId/message',
    async (req: Request, res: Response) => {
      try {
        if (!(await requireWorkspaceAccess(req, res, req.params.workspaceId))) return;
        const { text, model, createdBy } = req.body ?? {};
        if (typeof text !== 'string' || !text.trim()) {
          res.status(400).json({ success: false, error: 'text is required' });
          return;
        }
        const result = await continueWorkspace(req.params.workspaceId, {
          text,
          model,
          createdBy,
        });
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'message failed';
        const status = msg.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: msg });
      }
    }
  );

  // Archive a finished workspace: stop session, remove worktree, mark archived.
  router.post(
    '/workspaces/:workspaceId/archive',
    async (req: Request, res: Response) => {
      try {
        if (!(await requireWorkspaceAccess(req, res, req.params.workspaceId))) return;
        res.json({
          success: true,
          data: await archiveWorkspace(req.params.workspaceId),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'archive failed';
        res
          .status(msg.includes('not found') ? 404 : 500)
          .json({ success: false, error: msg });
      }
    }
  );

  // Reconcile persisted workspaces against the real tmux + git substrate.
  router.post('/reconcile', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await reconcile() });
  });

  // --- Capability surfaces: multi-agent workflows, rich health, resources, ---
  // --- live workspace status, and steering. These drive the headline ---
  // --- "many parallel agents" product on top of the proven tmux substrate. ---

  // Unified production health: substrate + runtimes + resources + tails + dmux.
  router.get('/health/full', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await conductorHealth() });
  });

  // Prometheus-style metrics snapshot (counters, gauges, histograms).
  router.get('/metrics', (_req: Request, res: Response) => {
    res.json({ success: true, data: metrics.snapshot() });
  });

  // Tamper-evident governance audit trail: every delivery decision is sealed
  // into the SHA-256 Merkle chain; `verified` is a GENUINE full-chain check
  // (ok:false when governance is unavailable — never a fabricated green).
  // Entries are newest-first, capped by ?limit= (default 100, max 500).
  router.get('/governance/audit', async (req: Request, res: Response) => {
    const rawLimit = Number.parseInt(String(req.query.limit ?? '100'), 10);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
    const [verified, entries] = await Promise.all([
      verifyGovernanceAudit(),
      governanceAuditEntries(),
    ]);
    res.json({
      success: true,
      data: { verified, entries: [...entries].reverse().slice(0, limit) },
    });
  });

  // Current resource-governor utilization vs. limits (truthful capacity view).
  router.get('/resources', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await resourceSnapshot() });
  });

  // Launch a multi-agent workflow (direct | fan_out | pipeline | competitive).
  // Each step is isolated in its own worktree; admission is resource-governed.
  router.post('/workflows', async (req: Request, res: Response) => {
    try {
      const {
        spaceId,
        projectId,
        taskId,
        repoPath,
        createdBy,
        pattern,
        steps,
        baseRef,
        env,
        limits,
      } = req.body ?? {};
      if (
        !spaceId ||
        !projectId ||
        !taskId ||
        !repoPath ||
        !createdBy ||
        !pattern ||
        !Array.isArray(steps)
      ) {
        res.status(400).json({
          success: false,
          error:
            'spaceId, projectId, taskId, repoPath, createdBy, pattern, and steps[] are required',
        });
        return;
      }
      const validPatterns: WorkflowPattern[] = [
        'direct',
        'fan_out',
        'pipeline',
        'competitive',
      ];
      if (!validPatterns.includes(pattern)) {
        res
          .status(400)
          .json({
            success: false,
            error: `pattern must be one of: ${validPatterns.join(', ')}`,
          });
        return;
      }
      if (steps.length === 0) {
        res
          .status(400)
          .json({
            success: false,
            error: 'steps[] must contain at least one step',
          });
        return;
      }
      for (const step of steps as WorkflowStep[]) {
        if (!step?.runtimeId || !step?.prompt) {
          res
            .status(400)
            .json({
              success: false,
              error: 'each step requires runtimeId and prompt',
            });
          return;
        }
      }
      const result = await executeWorkflow({
        spaceId,
        projectId,
        taskId,
        repoPath,
        createdBy,
        pattern,
        steps,
        baseRef,
        env,
        limits,
      });
      // Resource rejection (over budget) is a 429, not a 5xx or generic 4xx.
      if (result.state === 'rejected') {
        res
          .status(429)
          .json({
            success: false,
            error: result.reason ?? 'resource limit reached',
            data: result,
          });
        return;
      }
      res
        .status(result.state === 'failed' ? 502 : 201)
        .json({ success: true, data: result });
    } catch (err) {
      res
        .status(400)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'workflow failed',
        });
    }
  });

  // Live status of a running workspace's agent (alive + exit code + recent output),
  // resolved through the workspace's own substrate handle.
  router.get(
    '/workspaces/:workspaceId/status',
    async (req: Request, res: Response) => {
      try {
        const workspace = await getWorkspace(req.params.workspaceId);
        if (!workspace) {
          res
            .status(404)
            .json({ success: false, error: 'workspace not found' });
          return;
        }
        const handle = workspaceHandle(workspace);
        if (!handle) {
          res.json({
            success: true,
            data: {
              alive: false,
              exitCode: null,
              recentOutput: null,
              state: workspace.state,
              reason: 'no live substrate handle',
            },
          });
          return;
        }
        const status = await runtimeStatus(workspace.substrate, handle);
        res.json({
          success: true,
          data: { ...status, state: workspace.state },
        });
      } catch (err) {
        res
          .status(500)
          .json({
            success: false,
            error: err instanceof Error ? err.message : 'status failed',
          });
      }
    }
  );

  // Steer a running workspace's agent: send keys/input (approval, interrupt,
  // instruction). Only interactive substrates (tmux) support steering.
  router.post(
    '/workspaces/:workspaceId/steer',
    async (req: Request, res: Response) => {
      try {
        const keys = String(req.body?.keys ?? '');
        if (!keys) {
          res.status(400).json({ success: false, error: 'keys is required' });
          return;
        }
        const workspace = await requireWorkspaceAccess(req, res, req.params.workspaceId);
        if (!workspace) return;
        if (isTerminalWorkspaceState(workspace.state)) {
          res
            .status(409)
            .json({
              success: false,
              error: `workspace is ${workspace.state} (cannot steer a terminal workspace)`,
            });
          return;
        }
        const handle = workspaceHandle(workspace);
        if (!handle) {
          res
            .status(409)
            .json({
              success: false,
              error: 'workspace has no live substrate handle to steer',
            });
          return;
        }
        await steerRuntime(workspace.substrate, handle, keys);
        res.json({ success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'steer failed';
        res
          .status(msg.includes('not supported') ? 400 : 500)
          .json({ success: false, error: msg });
      }
    }
  );

  // Delivery summary for a completed workspace (diff + logs + exit code).
  router.get(
    '/workspaces/:workspaceId/delivery',
    async (req: Request, res: Response) => {
      try {
        res.json({
          success: true,
          data: await generateDeliverySummary(req.params.workspaceId),
        });
      } catch (err) {
        res
          .status(404)
          .json({
            success: false,
            error:
              err instanceof Error ? err.message : 'delivery summary failed',
          });
      }
    }
  );

  // Memory candidate proposed by a completed workspace (review-gated, not durable).
  router.get(
    '/workspaces/:workspaceId/memory-candidate',
    async (req: Request, res: Response) => {
      try {
        const candidate = await generateMemoryCandidate(req.params.workspaceId);
        if (!candidate) {
          res.status(204).end();
          return;
        }
        res.json({ success: true, data: candidate });
      } catch (err) {
        res
          .status(404)
          .json({
            success: false,
            error:
              err instanceof Error ? err.message : 'memory candidate failed',
          });
      }
    }
  );

  // Batch: cancel all non-terminal workspaces (filter by projectId/createdBy).
  router.post('/batch/cancel', async (req: Request, res: Response) => {
    try {
      const { projectId, createdBy } = req.body ?? {};
      // Scope to the verified caller under strict auth: a client cannot
      // batch-cancel across users by supplying (or omitting) a filter.
      res.json({
        success: true,
        data: await bulkCancel(scopeBatchFilter(req, { projectId, createdBy })),
      });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'batch cancel failed',
        });
    }
  });

  // Batch: archive all terminal workspaces (frees disk).
  router.post('/batch/archive', async (req: Request, res: Response) => {
    try {
      const { projectId, states } = req.body ?? {};
      const archiveFilter: { projectId?: string; states?: string[]; createdBy?: string } = {
        projectId,
        states,
      };
      res.json({
        success: true,
        data: await bulkArchive(scopeBatchFilter(req, archiveFilter)),
      });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'batch archive failed',
        });
    }
  });

  // Worktree disk cleanup: prune stale worktrees + kill orphaned sessions.
  router.post('/cleanup', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await cleanupStaleWorktrees() });
  });

  // --- Beads issue-tracker sync (subprocess `bd` CLI, degrade-safe) -----------
  // Promotes the Agent OS IssueTrackerPort seam (BeadsIssueTracker via
  // @recoder/beads-adapter, driven by IssueTrackerSyncService from @recoder/agent-os)
  // onto the real product path. `bd` is invoked as a subprocess; when the binary is
  // absent every route cleanly skips (200 with skipped reason) rather than failing.

  // Truthful availability of the `bd` CLI Conductor would shell to.
  router.get('/issues/availability', (_req: Request, res: Response) => {
    res.json({ success: true, data: beadsAvailability() });
  });

  // Import ready beads issues into the canonical Agent OS task store. The adapter
  // translates each `bd` issue to a TaskSpec through the port; the resulting specs
  // are upserted into the live agent-os repository (Recoder owns canonical state).
  router.post('/issues/import', async (req: Request, res: Response) => {
    try {
      const { spaceId, repo, cwd } = req.body ?? {};
      if (!spaceId) {
        res.status(400).json({ success: false, error: 'spaceId is required' });
        return;
      }
      const result = await importReadyBeadsTasks({ spaceId, repo }, { cwd });
      res.json({ success: true, data: result });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'beads import failed',
        });
    }
  });

  // Export one canonical task back to beads through the seam. Resolves the
  // TaskSpec from the agent-os repository by `taskId` (canonical state of record).
  router.post('/issues/export', async (req: Request, res: Response) => {
    try {
      const { taskId, artifacts, cwd } = req.body ?? {};
      if (!taskId) {
        res.status(400).json({ success: false, error: 'taskId is required' });
        return;
      }
      const tasks = await Promise.resolve(
        agentOsContainer.repository.listTasks()
      );
      const task = tasks.find(t => t.taskId === taskId);
      if (!task) {
        res
          .status(404)
          .json({ success: false, error: `task not found: ${taskId}` });
        return;
      }
      const result = await exportTaskToBeads(
        { task, artifacts: artifacts as Artifact[] | undefined },
        { cwd }
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'beads export failed',
        });
    }
  });

  // RAG/context ingest on the product path: hand a raw doc to the shared,
  // flag-gated Brain (agentOsContainer.brain), which preprocesses it through the
  // owned @recoder/document-preprocessor and remembers the clean text via mem0 so
  // a later assemble()/recall() (e.g. the conductor instruction bundle) can surface
  // it. In-process; degrade-safe end to end: brain disabled -> { enabled:false };
  // no preprocessor/memory -> empty/not-remembered. Never blocks, never throws.
  router.post('/context/ingest', async (req: Request, res: Response) => {
    try {
      const { title, content, base64, format } = req.body ?? {};
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }
      let data: Uint8Array;
      if (typeof base64 === 'string' && base64.length > 0) {
        data = new Uint8Array(Buffer.from(base64, 'base64'));
      } else if (typeof content === 'string') {
        data = new Uint8Array(Buffer.from(content, 'utf8'));
      } else {
        res
          .status(400)
          .json({
            success: false,
            error: 'content (utf8 text) or base64 (bytes) is required',
          });
        return;
      }
      const allowed = new Set(['text', 'markdown', 'pdf']);
      const docFormat = allowed.has(format) ? format : 'text';
      const result = await agentOsContainer.brain.ingestDocument({
        title,
        data,
        format: docFormat as 'text' | 'markdown' | 'pdf',
      });
      res.json({ success: true, data: result });
    } catch (err) {
      // Belt-and-suspenders: BrainService already degrades fail-safe, but never
      // let a malformed body crash the request path.
      res
        .status(500)
        .json({
          success: false,
          error: err instanceof Error ? err.message : 'context ingest failed',
        });
    }
  });

  // --- Work signals: thin in-process ingest for stuck/blocked/needs-handoff ---
  // INTEGRATION-PLAN §d.4: py/ops-recorder stays the richer DETECTOR; this is the
  // lightweight TS INGEST it posts to. A signal is recorded to canonical agent-os
  // state (as a `handoff` RunEvent on the task's run) and triggers a coordination
  // pickup handoff so a stuck workspace can be re-dispatched. Degrade-safe end to
  // end: coordination unavailable -> recorded only (handoff skipped), never throws.

  // Ingest one work signal. Returns the recorded signal incl. whether it was
  // persisted to agent-os state and the handoff outcome (emitted/duplicate/skipped).
  router.post('/work-signals', async (req: Request, res: Response) => {
    const parsed = parseWorkSignal(req.body);
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    try {
      const signal = await ingestWorkSignal(parsed.value);
      res.status(201).json({ success: true, data: signal });
    } catch (err) {
      // ingestWorkSignal is degrade-safe and should not throw; belt-and-suspenders.
      res
        .status(500)
        .json({
          success: false,
          error:
            err instanceof Error ? err.message : 'work-signal ingest failed',
        });
    }
  });

  // Recently-ingested work signals (newest first), filterable by task/workspace.
  router.get('/work-signals', (req: Request, res: Response) => {
    const taskId =
      typeof req.query?.taskId === 'string' ? req.query.taskId : undefined;
    const workspaceId =
      typeof req.query?.workspaceId === 'string'
        ? req.query.workspaceId
        : undefined;
    const limitRaw = Number(req.query?.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    res.json({
      success: true,
      data: listWorkSignals({ taskId, workspaceId, limit }),
    });
  });

  // WebSocket upgrade for live workspace events (operator console live terminal).
  // The express-ws middleware injects the `ws` method onto the router; if the
  // server doesn't have express-ws enabled (e.g. an isolated unit test building
  // the router directly), `.ws` is absent — skip registering rather than throw,
  // so the rest of the router (the REST product surface) still mounts.
  if (typeof (router as unknown as { ws?: unknown }).ws === 'function') {
    (router as any).ws(
      '/workspaces/:workspaceId/stream',
      (ws: any, req: { params: { workspaceId: string } }) => {
        const cleanup = attachWorkspaceStream(ws, req.params.workspaceId);
        ws.on('close', cleanup);
      }
    );
  }

  return router;
}

/**
 * Resolve a substrate handle from a persisted workspace record. The handle is
 * reconstructed from the record's deterministic identifiers (workspaceId →
 * substrate `ref`, plus persisted sessionName/worktreePath), so status/steer
 * work even after a backend restart cleared the orchestrator's in-memory map.
 * Returns `undefined` when the workspace was never provisioned (no session).
 */
function workspaceHandle(workspace: Workspace): SubstrateHandle | undefined {
  if (!workspace.sessionName && !workspace.worktreePath) return undefined;
  return {
    ref: workspace.workspaceId,
    sessionName: workspace.sessionName,
    worktreePath: workspace.worktreePath,
  };
}
