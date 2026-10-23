/**
 * Conductor HTTP edges — the `/api/conductor` router (mount base from
 * `DOMAIN_REGISTRY.conductor`). The terminal product's control-plane surface:
 *
 *   GET    /api/conductor/workspaces              list workspace records
 *   GET    /api/conductor/workspaces/:id          fetch one workspace
 *   POST   /api/conductor/workspaces              create + launch (GATED)
 *   POST   /api/conductor/workspaces/:id/steer    send-keys to a live agent (GATED)
 *   POST   /api/conductor/workspaces/:id/review-comments  line-anchored review notes → agent (steer live / new run) (GATED)
 *   POST   /api/conductor/workspaces/:id/review-findings  on-demand evidence-validated code review (GATED)
 *   POST   /api/conductor/workspaces/:id/blocker-feedback  re-probe hard blockers → agent (GATED)
 *   GET    /api/conductor/workspaces/:id/events   RunEvents (conversation + lifecycle)
 *   GET    /api/conductor/workspaces/:id/diff     reviewable diff vs base
 *   GET    /api/conductor/workspaces/:id/diff/files  per-file changed list (numstat + name-status)
 *   GET    /api/conductor/workspaces/:id/diff/file   single-file unified patch (?path=)
 *   GET    /api/conductor/workspaces/:id/tree     worktree file list
 *   GET    /api/conductor/workspaces/:id/mergeability  pre-merge conflict + base-divergence probe
 *   GET    /api/conductor/workspaces/:id/readiness  folded merge-readiness read-model (4 signals + verdict)
 *   GET    /api/conductor/workspaces/:id/evidence  exportable convergence evidence record (404 when unmerged)
 *   GET    /api/conductor/workspaces/:id/convergence-trust  "should I trust this merge?" score + factors (404 when unmerged)
 *   GET    /api/conductor/workspaces/:id/convergence-feedback durable repo decision history
 *   POST   /api/conductor/workspaces/:id/convergence-feedback explicit flag disposition
 *   PUT    /api/conductor/workspaces/:id/convergence-policy operator required-rule policy
 *   GET    /api/conductor/workspaces/:id/evidence/export  framework-mapped evidence pack (`?format=md` for text)
 *   GET    /api/conductor/workspaces/:id/dev-command  detected dev command (or null)
 *   GET    /api/conductor/workspaces/:id/run-config  committed scripts + RECODER_PORT + detected cmd
 *   GET    /api/conductor/environment  first-run import: git identity, agent configs, gh, shell
 *   GET    /api/conductor/imports/crystal  discover adoptable Crystal sessions
 *   POST   /api/conductor/imports/crystal  adopt Crystal worktrees into Recoder (GATED)
 *   GET    /api/conductor/imports/vibe-kanban  discover adoptable Vibe Kanban tasks/worktrees
 *   POST   /api/conductor/imports/vibe-kanban  adopt Vibe Kanban worktrees into Recoder (GATED)
 *   GET    /api/conductor/transcript/search?q=  search Claude session transcripts by content
 *   GET    /api/conductor/workspaces/:id/transcript  hydrate this workspace's Claude transcript (available:false when none)
 *   GET    /api/conductor/workspaces/:id/preview-verification  last preview verification summary (404 when unverified)
 *   GET    /api/conductor/workspaces/:id/view     attention-enriched view (truthful unknown)
 *   GET    /api/conductor/views                   attention-enriched views of every workspace
 *   POST   /api/conductor/workspaces/:id/stop     graceful run stop → cancelled (GATED)
 *   POST   /api/conductor/workspaces/:id/advance  lifecycle step, review→merge flow (GATED)
 *   POST   /api/conductor/workspaces/:id/message  chat → next agent run (GATED)
 *   POST   /api/conductor/workspaces/:id/pr       push branch + open PR (GATED)
 *   POST   /api/conductor/workspaces/:id/merge    merge into base, gh or local (GATED)
 *   POST   /api/conductor/workspaces/:id/files/discard  file-level reject: restore paths to review base (GATED)
 *   POST   /api/conductor/workspaces/:id/files/discard-hunks  hunk-level reject: reverse-apply selected hunks of one path (GATED)
 *   POST   /api/conductor/workspaces/:id/archive  teardown + archive (GATED)
 *   POST   /api/conductor/workspaces/:id/preview-url  persist sniffed preview URL (GATED)
 *   POST   /api/conductor/workspaces/:id/preview-verify  verify the stored preview URL (GATED)
 *   GET    /api/conductor/substrates              truthful per-substrate availability
 *   GET    /api/conductor/skills                  verified + pinned governed skills
 *   GET    /api/conductor/skills/trust            operator publisher/manifest trust ledger
 *   POST   /api/conductor/skills/publishers       persist a trusted public publisher key (ADMIN)
 *   DELETE /api/conductor/skills/publishers/:keyId  revoke an operator publisher and its skills (ADMIN)
 *   POST   /api/conductor/skills/manifests        verify, pin, and admit a signed skill manifest (ADMIN)
 *   POST   /api/conductor/workspaces/:id/skills/:skillId/actions/:actionId  invoke a typed governed skill action
 *   GET    /api/conductor/workspaces/:id/skills/invocations  durable governed-skill evidence
 *   GET    /api/conductor/workspaces/:id/policy   effective governed-action policy profile
 *   PUT    /api/conductor/workspaces/:id/policy   revision-checked policy update (GATED)
 *   POST   /api/conductor/remote/sessions         mint an owned remote-continuity session
 *   GET    /api/conductor/remote/sessions/:sessionId  read its owner-bound session contract
 *   GET    /api/conductor/remote/sessions/:sessionId/snapshot  monitor its live owned scope
 *   GET    /api/conductor/remote/sessions/:sessionId/stream  stream its live owned scope
 *   POST   /api/conductor/remote/sessions/:sessionId/workspaces/:workspaceId/steer  governed remote input
 *   DELETE /api/conductor/remote/sessions/:sessionId  revoke remote continuity
 *   DELETE /api/conductor/remote/sessions            revoke all caller sessions
 *   GET    /api/conductor/runtimes                installed agent CLIs (PATH-probed)
 *   GET    /api/conductor/github/status           GitHub connection + identity (token-free)
 *   GET    /api/conductor/github/repos            detected account's repos via gh (empty when gh absent)
 *   POST   /api/conductor/repos/clone             clone a GitHub repo (gh-first, git fallback)
 *   GET    /api/conductor/workspaces/:id/checks   per-check PR + Recoder rollup
 *   GET    /api/conductor/workspaces/:id/diagnostics base-versus-head LSP delta
 *   POST   /api/conductor/workspaces/:id/checks/remediate governed named-check agent fix
 *   GET    /api/conductor/health                  readiness + substrate tmux identity + durable-project code-network coverage
 *   GET    /api/conductor/reconcile/findings      reconcile findings (operator review)
 *   GET    /api/conductor/sessions                live recoder-* tmux sessions (read-only attach list)
 *   POST   /api/conductor/reconcile               run a reconcile pass (GATED)
 *
 * Security posture:
 *  - Mutating routes use `authenticateMutating` (a real, non-anonymous principal);
 *    the ACTOR is taken from the resolved `Principal`, never the request body.
 *  - Every write goes through the module, which runs the governance gate BEFORE
 *    the mutation. A gate deny is a truthful 403 (`AUTHZ_PROJECT_ACCESS_DENIED`
 *    with the verdict reason), never a faked 200.
 *  - Bodies validated fail-fast with the uniform `sendError` envelope.
 */
import nodePath from 'node:path';
import { Router, type RequestHandler } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { WorkspaceState, WorkspaceSubstrate } from '@recoder/agent-os';
import type { ConductorModule } from '../index.js';
import type {
  CreateConductorWorkspaceInput,
  ConductorWriteResult,
} from '../conductor-module.js';
import type { PreviewVerifyOptions } from '../services/preview-verify.service.js';
import type { CloneRepoErrorCode } from '../services/repo-clone.service.js';
import type { SkillManifest } from '../skill/skill.types.js';
import { parseWorkspacePolicyUpdate } from '../policy/workspace-policy.js';
import type { PreviewVerifyAssertion } from '../ports/preview-verify.port.js';
import { parseReviewComments } from '../review/review-comments.js';
import { resolveConductorTmuxSocket } from '../tmux-socket.js';
import { createRecoderSessionLister } from '../adapters/recoder-session-lister.adapter.js';
import {
  requireWorkspaceAccess,
  filterAccessibleWorkspaces,
  type WorkspaceAccessOptions,
} from './workspace-access.js';

export interface ConductorRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
  /**
   * Resolve THIS backend's default tmux socket for the `/health` shared-server
   * mirror (durable-shell unify §A1b). Injectable so tests never read the real
   * process; defaults to {@link resolveConductorTmuxSocket} (live process env +
   * effective uid). `null` ⇒ a truthful "unknown" socket, never a guess.
   */
  readonly resolveTmuxSocket?: () => string | null;
  /**
   * List the live `recoder-*` tmux sessions for the read-only `/sessions` attach
   * bridge (durable-shell unify §A2). Injectable so tests mock the exec seam;
   * defaults to {@link createRecoderSessionLister} over the SAME pinned binary the
   * conductor drives. Read-only + degrade-truthful (tmux absent ⇒ `[]`).
   */
  readonly listRecoderSessions?: () => Promise<readonly string[]>;
  /**
   * Solo/desktop single-user mode (bootstrap-injected from `RECODER_SOLO_MODE` via
   * `cfg.soloMode`). When true the workspace-ownership guard FAILS OPEN — there is
   * one local owner and the desktop user must never be locked out of their own
   * workspaces. A cloud deploy leaves this false, so ownership is enforced.
   */
  readonly soloMode?: boolean;
  /**
   * OPTIONAL `Idempotency-Key` replay guard (BE-10.3), mounted on exactly the
   * duplicate-spawning `POST /workspaces` edge AFTER `authenticateMutating` so a
   * client retry replays the original create instead of spawning a second
   * worktree+agent. Absent ⇒ identity (no behavior change).
   */
  readonly idempotency?: RequestHandler;
}

// Must match the full WorkspaceSubstrate union. `'acp'` is opt-in and degrades
// truthfully downstream (its adapter's available()/launch() throw `acp unavailable`
// when `claude-code-acp` is absent), so allowing selection here loses no gating.
const SUBSTRATES: readonly WorkspaceSubstrate[] = ['tmux_worktree', 'daytona', 'in_process', 'ssh', 'acp'];

/** Every canonical workspace state (validation surface for `/advance` bodies). */
const WORKSPACE_STATES: readonly WorkspaceState[] = [
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
  'merging',
  'merged',
  'failed',
  'cancelled',
  'archived',
];

function isWorkspaceState(value: unknown): value is WorkspaceState {
  return typeof value === 'string' && (WORKSPACE_STATES as readonly string[]).includes(value);
}

/** Build the `/api/conductor` router. */
export function buildConductorRoutes(deps: ConductorRouterDeps): Router {
  const router = Router();
  const { module, middleware } = deps;
  const resolveTmuxSocket = deps.resolveTmuxSocket ?? resolveConductorTmuxSocket;
  const listRecoderSessions = deps.listRecoderSessions ?? createRecoderSessionLister();

  // The single ownership seam applied to EVERY `:id`-scoped edge below (recoder-tf68):
  // a caller may only reach a workspace it owns (or, when privileged/solo, any). An
  // inaccessible workspace is a 404 identical to a missing one (no existence oracle).
  const accessOpts: WorkspaceAccessOptions = { soloMode: deps.soloMode === true };
  const access = requireWorkspaceAccess(module, accessOpts);
  // Optional Idempotency-Key replay seam (BE-10.3): absent ⇒ identity passthrough.
  const idempotency: RequestHandler = deps.idempotency ?? ((_req, _res, next) => next());

  // --- reads -----------------------------------------------------------------

  router.get(
    '/workspaces',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspaces = await module.listWorkspaces();
      sendSuccess(res, {
        workspaces: filterAccessibleWorkspaces(workspaces, req.principal!, accessOpts),
      });
    }),
  );

  router.get(
    '/workspaces/:id',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const workspace = await module.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { workspace });
    }),
  );

  router.get(
    '/substrates',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { substrates: await module.substrates() });
    }),
  );

  // Product surface for the governed skill registry. The composer projects only
  // manifests that passed signature verification + version pinning at bootstrap;
  // an unwired deployment returns SERVICE_UNAVAILABLE, never a fake empty catalog.
  router.get(
    '/skills',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { skills: await module.listVerifiedSkills() });
    }),
  );

  router.get(
    '/skills/trust',
    middleware.authenticate,
    middleware.requireAdmin,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { trust: await module.skillTrustView() });
    }),
  );

  router.post(
    '/skills/publishers',
    middleware.authenticateMutating,
    middleware.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const publisher = await module.trustSkillPublisher({
        keyId: requireString(body, 'keyId'),
        publicKey: requireString(body, 'publicKey'),
        actorId: req.principal!.userId,
      });
      sendSuccess(res, { publisher }, { statusCode: 201 });
    }),
  );

  router.delete(
    '/skills/publishers/:keyId',
    middleware.authenticateMutating,
    middleware.requireAdmin,
    asyncHandler(async (req, res) => {
      const removedSkills = await module.revokeSkillPublisher(req.params.keyId);
      sendSuccess(res, { revoked: true, removedSkills });
    }),
  );

  router.post(
    '/skills/manifests',
    middleware.authenticateMutating,
    middleware.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const rawManifest = body.manifest;
      if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
        throw createError(ErrorCode.VALIDATION_ERROR, '`manifest` must be a signed skill manifest object');
      }
      const outcome = await module.admitSkillManifest({
        manifest: rawManifest as SkillManifest,
        actorId: req.principal!.userId,
      });
      sendSuccess(res, { outcome }, { statusCode: outcome.ok ? 201 : 200 });
    }),
  );

  router.get(
    '/remote/sessions/:sessionId',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const session = await module.remoteSession({
        sessionId: req.params.sessionId,
        principal: req.principal!,
      });
      sendSuccess(res, { session });
    }),
  );

  router.get(
    '/remote/sessions/:sessionId/snapshot',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const snapshot = await module.remoteSnapshot({
        sessionId: req.params.sessionId,
        principal: req.principal!,
      });
      sendSuccess(res, { snapshot });
    }),
  );

  router.get(
    '/remote/sessions/:sessionId/stream',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const sessionId = req.params.sessionId;
      const principal = req.principal!;
      // Authorize before committing SSE headers so a bad/expired session still
      // receives the normal typed HTTP refusal instead of a misleading 200 stream.
      const initialWorkspaceIds = await module.remoteWorkspaceIds({ sessionId, principal });

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let closed = false;
      let emitting = false;
      let pending = false;
      let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
      const subscriptions = new Map<string, () => void>();

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        if (coalesceTimer != null) clearTimeout(coalesceTimer);
        clearInterval(heartbeat);
        for (const unsubscribe of subscriptions.values()) unsubscribe();
        subscriptions.clear();
      };

      const write = (frame: unknown): void => {
        if (closed || res.writableEnded || res.destroyed) return;
        // This stream carries bounded snapshots, never terminal logs. A client
        // that stopped draining is closed instead of accumulating memory.
        if (res.writableLength > 1024 * 1024) {
          cleanup();
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
      };

      const syncSubscriptions = (workspaceIds: readonly string[]): void => {
        const desired = new Set(workspaceIds);
        for (const [workspaceId, unsubscribe] of subscriptions) {
          if (desired.has(workspaceId)) continue;
          unsubscribe();
          subscriptions.delete(workspaceId);
        }
        for (const workspaceId of desired) {
          if (subscriptions.has(workspaceId)) continue;
          subscriptions.set(
            workspaceId,
            module.terminal().subscribeSync(workspaceId, event => {
              if (event.kind === 'state' || event.kind === 'attention') scheduleSnapshot();
            }),
          );
        }
      };

      const emitSnapshot = async (): Promise<void> => {
        if (closed) return;
        if (emitting) {
          pending = true;
          return;
        }
        emitting = true;
        try {
          const [snapshot, workspaceIds] = await Promise.all([
            module.remoteSnapshot({ sessionId, principal }),
            module.remoteWorkspaceIds({ sessionId, principal }),
          ]);
          if (closed) return;
          syncSubscriptions(workspaceIds);
          write({ type: 'snapshot', snapshot, at: new Date().toISOString() });
        } catch (error) {
          write({
            type: 'closed',
            reason: error instanceof Error ? error.message : 'Remote session closed',
          });
          cleanup();
          res.end();
        } finally {
          emitting = false;
          if (pending && !closed) {
            pending = false;
            void emitSnapshot();
          }
        }
      };

      function scheduleSnapshot(): void {
        if (closed || coalesceTimer != null) return;
        coalesceTimer = setTimeout(() => {
          coalesceTimer = null;
          void emitSnapshot();
        }, 120);
      }

      syncSubscriptions(initialWorkspaceIds);
      const heartbeat = setInterval(() => {
        if (!closed) void emitSnapshot();
      }, 15_000);
      if (typeof heartbeat.unref === 'function') heartbeat.unref();
      req.on('close', cleanup);
      await emitSnapshot();
    }),
  );

  // --- workspace detail (the run screen): reads --------------------------------
  // "not found" maps to a truthful 404; any other failure surfaces as-is.

  router.get(
    '/workspaces/:id/events',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      sendSuccess(res, { events: await module.listWorkspaceEvents(req.params.id) });
    }),
  );

  router.get(
    '/workspaces/:id/diff',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        sendSuccess(res, await module.workspaceDiff(req.params.id));
      } catch (err) {
        sendError(res, toReadError(err, 'diff failed'));
      }
    }),
  );

  router.get(
    '/workspaces/:id/tree',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        sendSuccess(res, await module.workspaceTree(req.params.id));
      } catch (err) {
        sendError(res, toReadError(err, 'tree failed'));
      }
    }),
  );

  // Per-file changed list — a faithful slice of the `/diff` blob (working tree vs
  // base). Read-only, never mutates. "not found" → 404, else → 503; a non-repo /
  // no-worktree tree is a truthful `available:false, files:[]`, never a fabrication.
  router.get(
    '/workspaces/:id/diff/files',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        sendSuccess(res, await module.workspaceDiffFiles(req.params.id));
      } catch (err) {
        sendError(res, toReadError(err, 'diff files failed'));
      }
    }),
  );

  // A single file's unified patch (working tree vs base). The `?path=` query is the
  // ONLY user input: it is required (400 when absent) and rejected when it begins
  // with `-` (400) — the canonical option-injection reject BEFORE the module/spawn,
  // where it is passed EXCLUSIVELY as a pathspec after the `--` fence. Read-only.
  router.get(
    '/workspaces/:id/diff/file',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const p = optionalString(req.query.path);
      if (!p) throw createError(ErrorCode.VALIDATION_ERROR, '`path` query param is required');
      if (p.startsWith('-')) {
        throw createError(ErrorCode.VALIDATION_ERROR, '`path` must not begin with "-"');
      }
      try {
        sendSuccess(res, await module.workspaceFilePatch(req.params.id, p));
      } catch (err) {
        sendError(res, toReadError(err, 'file diff failed'));
      }
    }),
  );

  // Read-only merge preflight: a git-native trial merge + base-divergence probe.
  // Never mutates, never a fabricated clean — a git-too-old / faulted probe is a
  // truthful `available:false`. "not found" → 404, else → 503.
  router.get(
    '/workspaces/:id/mergeability',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        sendSuccess(res, await module.workspaceMergeability(req.params.id));
      } catch (err) {
        sendError(res, toReadError(err, 'mergeability failed'));
      }
    }),
  );

  // Merge-readiness read-model: fold the four merge-decision signals (lifecycle,
  // mergeability, PR checks, preview verification) into one truthful verdict.
  // PURE read (no gate). Each signal degrades INDEPENDENTLY to 'unknown' — never a
  // fabricated pass — and 'ready' is the hardest gate. "not found" → 404, else → 503.
  router.get(
    '/workspaces/:id/readiness',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        sendSuccess(res, await module.workspaceReadiness(req.params.id));
      } catch (err) {
        sendError(res, toReadError(err, 'readiness failed'));
      }
    }),
  );

  // Durable governance-audit trail for one workspace — the sealed control-plane
  // events (merge/pr/advance/stop) whose payload carries this `workspaceId`,
  // ascending by chain `seq`. PURE read (no gate). The READ half of the
  // merge→audit seam: `POST …/merge` returns the sealed `auditId` and this edge
  // returns the queryable trail (each entry: id/seq/prevHash/entryHash/action/
  // effect/riskTier/degraded/createdAt). No reader wired ⇒ a truthful empty
  // trail, never a fabricated record.
  router.get(
    '/workspaces/:id/audit',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        const limit = readPositiveIntQuery(req.query.limit);
        const audit = await module.workspaceAudit(req.params.id, limit);
        sendSuccess(res, { audit });
      } catch (err) {
        sendError(res, toReadError(err, 'audit read failed'));
      }
    }),
  );

  // The exportable convergence evidence record a governed merge produced — the
  // step-3 headline artifact (task + N candidate diff hashes + chosen + governance
  // verdict/approval + pre-merge verification + provenance, sealed with a SHA-256
  // `contentHash` pointing at its durable Merkle audit leaf). PURE read (no gate).
  // A never-merged / evidence-less workspace is a truthful 404, never a fabrication.
  router.get(
    '/workspaces/:id/evidence',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        const evidence = await module.getConvergenceEvidence(req.params.id);
        if (evidence) {
          sendSuccess(res, { evidence });
          return;
        }
        const workspace = await module.getWorkspace(req.params.id);
        sendError(
          res,
          createError(
            ErrorCode.NOT_FOUND,
            workspace ? 'no convergence evidence (not merged)' : 'workspace not found',
          ),
        );
      } catch (err) {
        sendError(res, toReadError(err, 'evidence read failed'));
      }
    }),
  );

  // The CONVERGENCE TRUST assessment — the single "should I trust this merge?"
  // signal folded PURELY from the sealed evidence (0-100 score + tier + weighted
  // factors + the specific things to review). Read-only (no gate). A never-merged /
  // evidence-less workspace is a truthful 404, never a fabricated score.
  router.get(
    '/workspaces/:id/convergence-trust',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        const trust = await module.getConvergenceTrust(req.params.id);
        if (trust) {
          sendSuccess(res, { trust });
          return;
        }
        const workspace = await module.getWorkspace(req.params.id);
        sendError(
          res,
          createError(
            ErrorCode.NOT_FOUND,
            workspace ? 'no convergence evidence to score (not merged)' : 'workspace not found',
          ),
        );
      } catch (err) {
        sendError(res, toReadError(err, 'convergence-trust read failed'));
      }
    }),
  );

  router.get(
    '/workspaces/:id/convergence-feedback',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        const profile = await module.getConvergenceDecisionProfile(req.params.id);
        if (profile) {
          sendSuccess(res, { profile });
          return;
        }
        const workspace = await module.getWorkspace(req.params.id);
        sendError(res, createError(
          ErrorCode.NOT_FOUND,
          workspace ? 'convergence decision history unavailable' : 'workspace not found',
        ));
      } catch (err) {
        sendError(res, toReadError(err, 'convergence-feedback read failed'));
      }
    }),
  );

  // Explicit calibration for one trust flag that was actually carried through a
  // delivered convergence. The store rejects invented flags. Accept/Dismiss/Clear
  // are audited human decisions; delivery alone never creates a disposition.
  router.post(
    '/workspaces/:id/convergence-feedback',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const flag = requireString(body, 'flag');
      const disposition = requireString(body, 'disposition');
      if (disposition !== 'accepted' && disposition !== 'dismissed' && disposition !== 'clear') {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          '`disposition` must be accepted, dismissed, or clear',
        );
      }
      const result = await module.setConvergenceFlagFeedback(
        req.params.id,
        { flag, disposition },
        req.principal!,
      );
      finishWrite(res, result, { key: 'profile' });
    }),
  );

  router.put(
    '/workspaces/:id/convergence-policy',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const mode = requireString(body, 'mode');
      if (mode !== 'off' && mode !== 'warn' && mode !== 'block') {
        throw createError(ErrorCode.VALIDATION_ERROR, '`mode` must be off, warn, or block');
      }
      const result = await module.setConvergenceRequiredRulePolicy(
        req.params.id,
        { mode },
        req.principal!,
      );
      finishWrite(res, result, { key: 'profile' });
    }),
  );

  // The framework-mapped, exportable evidence PACK rendered from that record — a
  // control-mapped artifact (SOC 2 / EU AI Act / DORA / Recoder) an auditor/CI can
  // read. PURE read (no gate). `?format=md` returns the human-readable markdown
  // summary as text; default `json` returns the structured pack. Every control
  // status is DERIVED from the record's fields (never a fabricated `met`). A
  // never-merged / evidence-less workspace is a truthful 404.
  router.get(
    '/workspaces/:id/evidence/export',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        const pack = await module.getConvergenceEvidenceExport(req.params.id);
        if (pack) {
          if (String(req.query.format).toLowerCase() === 'md') {
            res.type('text/markdown').send(pack.summary);
            return;
          }
          sendSuccess(res, { export: pack });
          return;
        }
        const workspace = await module.getWorkspace(req.params.id);
        sendError(
          res,
          createError(
            ErrorCode.NOT_FOUND,
            workspace ? 'no convergence evidence (not merged)' : 'workspace not found',
          ),
        );
      } catch (err) {
        sendError(res, toReadError(err, 'evidence export failed'));
      }
    }),
  );

  router.get(
    '/workspaces/:id/dev-command',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      sendSuccess(res, await module.workspaceDevCommand(req.params.id));
    }),
  );

  router.get(
    '/workspaces/:id/run-config',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      sendSuccess(res, await module.workspaceRunConfig(req.params.id));
    }),
  );

  router.get(
    '/environment',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await module.environmentImport());
    }),
  );

  router.get(
    '/imports/crystal',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await module.crystalMigration());
    }),
  );

  router.get(
    '/imports/vibe-kanban',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await module.vibeKanbanMigration());
    }),
  );

  router.get(
    '/transcript/search',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      sendSuccess(res, await module.searchTranscripts(q));
    }),
  );

  // Hydrate this workspace's Claude transcript for the Session view (the durable
  // per-workspace read edge). Gated identically to its siblings (authenticate +
  // access). A missing/inaccessible workspace is a truthful 404; a real workspace
  // with no session file yet is a 200 `{ available:false }` — never a fabricated
  // history.
  router.get(
    '/workspaces/:id/transcript',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const view = await module.workspaceTranscript(req.params.id);
      if (view) {
        sendSuccess(res, view);
        return;
      }
      sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
    }),
  );

  // Last preview verification summary — a PURE projection over the workspace's
  // persisted `metadata.previewVerification` (written back by the awaited
  // `verifyPreview` and the `setPreviewUrl` auto-verify). Read-only (no gate). A
  // 404 is TRUTHFUL: the workspace is missing OR was never verified — never a
  // fabricated pass. `screenshotRef` is always `null` (the screenshot PNG is not
  // retained — only an opaque artifact id was sealed), so the cockpit shows
  // "screenshot not retained", never a broken image.
  router.get(
    '/workspaces/:id/preview-verification',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const view = await module.getPreviewVerification(req.params.id);
      if (view) {
        sendSuccess(res, { verification: view });
        return;
      }
      // Distinguish a missing workspace from an unverified one — both truthful 404s.
      const workspace = await module.getWorkspace(req.params.id);
      sendError(
        res,
        createError(
          ErrorCode.NOT_FOUND,
          workspace ? 'preview not verified' : 'workspace not found',
        ),
      );
    }),
  );

  // Captured pane text — the stream client's poll fallback (`?lines=`).
  router.get(
    '/workspaces/:id/output',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        const lines = Number.parseInt(String(req.query.lines ?? ''), 10);
        sendSuccess(
          res,
          await module.workspaceOutput(req.params.id, Number.isFinite(lines) ? lines : undefined),
        );
      } catch (err) {
        sendError(res, toReadError(err, 'output failed'));
      }
    }),
  );

  // Live agent status: alive + exit code + recent output + persisted state.
  router.get(
    '/workspaces/:id/status',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      try {
        sendSuccess(res, await module.workspaceStatus(req.params.id));
      } catch (err) {
        sendError(res, toReadError(err, 'status failed'));
      }
    }),
  );

  // Attention-enriched read model: durable state + run events + terminal tail →
  // truthful `attention` ('unknown' when nothing signals — never a guess).
  router.get(
    '/workspaces/:id/view',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const view = await module.workspaceView(req.params.id);
      if (!view) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { workspace: view });
    }),
  );

  router.get(
    '/views',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspaces = await module.listWorkspaceViews();
      sendSuccess(res, {
        workspaces: filterAccessibleWorkspaces(workspaces, req.principal!, accessOpts),
      });
    }),
  );

  // --- workspace detail: governed writes ---------------------------------------

  // Graceful stop: substrate session kill (worktree kept for review) + a
  // truthful `cancelled` transition + audit. A kill fault is a truthful 503
  // with the state UNCHANGED — never a faked stop.
  router.post(
    '/workspaces/:id/stop',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const result = await module.stopWorkspace(req.params.id, req.principal!);
      finishWrite(res, result, { key: 'workspace' });
    }),
  );

  // Advance one lifecycle step (review → merge flow). Pure transitions only —
  // merge/archive/stop own their evidence-bearing transitions; the agent-os
  // state machine enforces from→to legality.
  router.post(
    '/workspaces/:id/advance',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const to = requireString(body, 'to');
      if (!isWorkspaceState(to)) {
        throw createError(ErrorCode.VALIDATION_ERROR, `\`to\` must be one of: ${WORKSPACE_STATES.join(', ')}`);
      }
      const result = await module.advanceWorkspaceState(req.params.id, to, req.principal!);
      finishWrite(res, result, { key: 'workspace' });
    }),
  );

  router.post(
    '/workspaces/:id/message',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.sendWorkspaceMessage(
        req.params.id,
        {
          text: requireString(body, 'text'),
          ...(typeof body.model === 'string' ? { model: body.model } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { statusCode: 201, key: 'message' });
    }),
  );

  router.post(
    '/workspaces/:id/pr',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.createWorkspacePr(
        req.params.id,
        {
          title: requireString(body, 'title'),
          ...(typeof body.body === 'string' ? { body: body.body } : {}),
          ...(typeof body.base === 'string' ? { base: body.base } : {}),
          ...(typeof body.draft === 'boolean' ? { draft: body.draft } : {}),
          ...(typeof body.remote === 'string' ? { remote: body.remote } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { statusCode: 201, key: 'pr' });
    }),
  );

  router.post(
    '/workspaces/:id/merge',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.mergeWorkspace(
        req.params.id,
        {
          ...(isMergeStrategy(body.strategy) ? { strategy: body.strategy } : {}),
          ...(typeof body.deleteBranch === 'boolean' ? { deleteBranch: body.deleteBranch } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { key: 'merge' });
    }),
  );

  // FILE-LEVEL REJECT in review: restore the selected paths to the review base so
  // Apply (= merge) delivers only the accepted set. Body `{paths: string[]}` is
  // validated fail-fast BEFORE the module is touched — a non-empty string array of
  // SAFE repo-relative paths (no absolute, no `..`, no leading `-`, no NUL — the
  // canonical option-injection reject; the op re-guards per path as defense in
  // depth). GATED (`workspace.discard`); a missing workspace is a truthful 404
  // from the ownership guard above.
  router.post(
    '/workspaces/:id/files/discard',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const paths = readDiscardPaths(body.paths);
      const result = await module.discardWorkspaceFiles(
        req.params.id,
        paths,
        req.principal!,
      );
      finishWrite(res, result, { key: 'discard' });
    }),
  );

  // HUNK-LEVEL REJECT in review: reverse-apply the selected hunks of ONE path
  // against the review base so Apply (= merge) delivers only the accepted edits.
  // Body `{path: string, hunkIndexes: number[]}` is validated fail-fast BEFORE
  // the module is touched — `path` under the same safe-path guard as
  // `/files/discard` (the op re-guards as defense in depth), `hunkIndexes` a
  // non-empty bounded array of non-negative integers. GATED (`workspace.discard`);
  // a missing workspace is a truthful 404 from the ownership guard above.
  router.post(
    '/workspaces/:id/files/discard-hunks',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const filePath = readDiscardHunkPath(body.path);
      const hunkIndexes = readDiscardHunkIndexes(body.hunkIndexes);
      const result = await module.discardWorkspaceHunks(
        req.params.id,
        filePath,
        hunkIndexes,
        req.principal!,
      );
      finishWrite(res, result, { key: 'discard' });
    }),
  );

  router.post(
    '/workspaces/:id/archive',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const result = await module.archiveWorkspace(req.params.id, req.principal!);
      finishWrite(res, result, { key: 'workspace' });
    }),
  );

  router.post(
    '/workspaces/:id/preview-url',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.setPreviewUrl(req.params.id, body.url, req.principal!);
      finishWrite(res, result, { key: 'workspace' });
    }),
  );

  // VERIFY the persisted preview URL — GATED (`workspace.preview_verify`, a SECOND
  // gate independent of the `workspace.preview_url` write). The awaited twin of the
  // fire-and-forget auto-verify `setPreviewUrl` fires: one bounded browser run
  // navigates the preview, asserts expected text, captures an evidence screenshot,
  // and seals the summary + screenshot artifact ids into the durable audit chain.
  // Degrade-truthful: no driver / no stored preview URL ⇒ a truthful `skipped` or
  // `ok:false` verification — never a fabricated pass. A gate deny is a truthful 403.
  router.post(
    '/workspaces/:id/preview-verify',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const options = readPreviewVerifyOptions(asObject(req.body ?? {}));
      const result = await module.verifyPreview(req.params.id, req.principal!, options);
      finishWrite(res, result, { key: 'verification' });
    }),
  );

  // Selectable runtimes: installed agent CLIs (fresh PATH probe per request so
  // the cockpit's "N agents ready" is truthful, never a cached assumption) PLUS
  // the native in-process openfang runtime with its live engine availability.
  router.get(
    '/runtimes',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { runtimes: await module.runtimes() });
    }),
  );

  // GitHub connection + detected identity for zero-config onboarding. TOKEN-FREE
  // by contract: only { connected, source, account? } — never a token value.
  router.get(
    '/github/status',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await module.githubStatus());
    }),
  );

  // Local-clonable repo list from the detected GitHub account (product F2):
  // `gh repo list` when the user's gh CLI is authenticated. Degrade-safe: an
  // absent/signed-out/failed gh is a truthful EMPTY list, never an error.
  router.get(
    '/github/repos',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { repos: await module.githubRepos() });
    }),
  );

  // Clone a GitHub repo onto the box ("New from GitHub"): `gh repo clone` when
  // gh is present (inherits gh auth for private repos), plain `git clone`
  // fallback. Only GitHub https/SSH urls pass validation (400 INVALID_INPUT);
  // an existing non-empty target dir is a truthful 409; neither tool on PATH
  // is a truthful 503; a clone failure surfaces the tool's stderr tail
  // (credential fragments scrubbed) — never a fabricated clone.
  router.post(
    '/repos/clone',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const url = requireString(body, 'url');
      const destDir =
        typeof body.destDir === 'string' && body.destDir.length > 0 ? body.destDir : undefined;
      const result = await module.cloneRepo({ url, ...(destDir ? { destDir } : {}) });
      if (result.ok) {
        sendSuccess(res, { repoPath: result.repoPath, clonedWith: result.clonedWith });
        return;
      }
      sendError(res, createError(CLONE_ERROR_CODE[result.code], result.message));
    }),
  );

  // Per-check PR rollup via `gh pr view --json statusCheckRollup,mergeable,
  // reviewDecision` run in the workspace worktree (gh resolves the branch's PR
  // itself). Degrade-truthful: gh missing / unauthenticated / no PR / not a
  // GitHub remote is a 200 with `available:false` + a truthful reason — NEVER
  // fabricated. A missing workspace is a truthful 404.
  router.get(
    '/workspaces/:id/checks',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const view = await module.workspaceChecks(req.params.id);
      if (!view) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, view);
    }),
  );

  router.get(
    '/workspaces/:id/diagnostics',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const diagnostics = await module.workspaceDiagnostics(req.params.id);
      if (!diagnostics) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { diagnostics });
    }),
  );

  router.post(
    '/workspaces/:id/checks/remediate',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.remediateWorkspaceCheck(
        req.params.id,
        requireString(body, 'checkName'),
        req.principal!,
      );
      finishWrite(res, result, { statusCode: 201, key: 'remediation' });
    }),
  );

  // Conductor readiness summary the cockpit polls: can work be launched here.
  // Also carries `substrate.tmuxBin` — the effective pinned tmux binary (config
  // pin, else PATH `tmux`; durable-shell unify §A1a) — and `substrate.tmuxSocket`
  // — this backend's DEFAULT tmux socket (`${TMUX_TMPDIR:-/tmp}/tmux-<uid>/default`,
  // §A1b) — so the wave-side attach can source AND assert the SAME tmux server the
  // conductor drives instead of silently falling back to PATH `tmux` / a guessed
  // socket. Both are `null` when unknown (no tmux entry / no effective uid).
  // Behavior-preserving: additive fields that only MIRROR today's default socket;
  // no socket is selected, no launch/lifecycle changes.
  router.get(
    '/health',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      const substrates = await module.substrates();
      const tmux = substrates.find((s) => s.id === 'tmux_worktree');
      const available = substrates.some((s) => s.available);
      sendSuccess(res, {
        available,
        tmux: tmux?.available === true,
        codeNetwork: module.codeNetworkCoverage(),
        substrate: {
          tmuxBin: tmux?.tmuxBin ?? null,
          // Only meaningful when a tmux substrate exists; otherwise `null` so the
          // caller never asserts a shared server that is not configured here.
          tmuxSocket: tmux ? resolveTmuxSocket() : null,
        },
        ...(available ? {} : { reason: tmux?.reason ?? 'no substrate available' }),
      });
    }),
  );

  router.get(
    '/reconcile/findings',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspaceId = optionalString(req.query.workspaceId);
      sendSuccess(res, { findings: await module.listReconcileFindings(workspaceId) });
    }),
  );

  // READ-ONLY attach list (durable-shell unify §A2): the live `recoder-*` tmux
  // sessions the conductor drives, so the wave-side attach can SEE them without
  // owning a competing durability engine. Reuses the reconcile scan seam
  // (`list-sessions` through the engines introspect port, prefix-filtered to the
  // conductor's own namespace) — pure read, no spawn/kill, and it changes no
  // session's lifecycle. Degrade-truthful: tmux absent/unrunnable ⇒ a truthful
  // empty list, never a fabricated session.
  router.get(
    '/sessions',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { sessions: await listRecoderSessions() });
    }),
  );

  // --- writes (gated) --------------------------------------------------------

  // Mint a short-lived remote-continuity session. Scope ids are untrusted input;
  // the service resolves and ownership-checks every one at mint and every use.
  router.post(
    '/remote/sessions',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const workspaceIds = Array.isArray(body.workspaceIds)
        ? [...new Set(body.workspaceIds
            .filter((value): value is string => typeof value === 'string')
            .map(value => value.trim())
            .filter(Boolean))]
        : [];
      const taskGroup = optionalString(body.taskGroup);
      const capabilities = parseRemoteCapabilities(body.capabilities);
      const session = await module.remoteAttach({
        principal: req.principal!,
        scope: {
          ...(workspaceIds.length > 0 ? { workspaceIds } : {}),
          ...(taskGroup ? { taskGroup } : {}),
        },
        capabilities,
      });
      sendSuccess(res, { session }, { statusCode: 201 });
    }),
  );

  router.delete(
    '/remote/sessions',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const revoked = await module.remoteRevokeAll({ principal: req.principal! });
      sendSuccess(res, { revoked });
    }),
  );

  router.post(
    '/remote/sessions/:sessionId/workspaces/:workspaceId/steer',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.remoteSteer({
        sessionId: req.params.sessionId,
        principal: req.principal!,
        workspaceId: req.params.workspaceId,
        input: requireString(body, 'input'),
      });
      sendSuccess(res, { result });
    }),
  );

  router.delete(
    '/remote/sessions/:sessionId',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      await module.remoteRevoke({
        sessionId: req.params.sessionId,
        principal: req.principal!,
      });
      sendSuccess(res, { revoked: true });
    }),
  );

  router.post(
    '/imports/crystal',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const sessionIds = Array.isArray(body.sessionIds)
        ? [...new Set(body.sessionIds
            .filter((value): value is string => typeof value === 'string')
            .map(value => value.trim())
            .filter(Boolean))]
        : [];
      if (sessionIds.length === 0) {
        throw createError(ErrorCode.VALIDATION_ERROR, '`sessionIds` must contain a Crystal session id');
      }
      const result = await module.importCrystalSessions(sessionIds, req.principal!);
      finishWrite(res, result, { statusCode: 201, key: 'migration' });
    }),
  );

  router.post(
    '/imports/vibe-kanban',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const workspaceIds = Array.isArray(body.workspaceIds)
        ? [...new Set(body.workspaceIds
            .filter((value): value is string => typeof value === 'string')
            .map(value => value.trim())
            .filter(Boolean))]
        : [];
      if (workspaceIds.length === 0) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          '`workspaceIds` must contain a Vibe Kanban workspace id',
        );
      }
      const result = await module.importVibeKanbanSessions(workspaceIds, req.principal!);
      finishWrite(res, result, { statusCode: 201, key: 'migration' });
    }),
  );

  router.post(
    '/workspaces',
    middleware.authenticateMutating,
    idempotency,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const input: CreateConductorWorkspaceInput = {
        spaceId: requireString(body, 'spaceId'),
        projectId: requireString(body, 'projectId'),
        taskId: requireString(body, 'taskId'),
        repoPath: requireString(body, 'repoPath'),
        runtimeId: requireString(body, 'runtimeId'),
        ...(isSubstrate(body.substrate) ? { substrate: body.substrate } : {}),
        ...(typeof body.prompt === 'string' ? { prompt: body.prompt } : {}),
        ...(typeof body.command === 'string' ? { command: body.command } : {}),
        ...(typeof body.model === 'string' ? { model: body.model } : {}),
        ...(typeof body.branch === 'string' ? { branch: body.branch } : {}),
        ...(typeof body.baseRef === 'string' ? { baseRef: body.baseRef } : {}),
        ...(typeof body.interactive === 'boolean' ? { interactive: body.interactive } : {}),
        // Mid-run sibling-awareness opt-out (recoder-i499): forward ONLY a real
        // boolean; anything else is dropped so the module's taskGroup default
        // applies (never trusts arbitrary input).
        ...(typeof body.sibling_awareness === 'boolean'
          ? { siblingAwareness: body.sibling_awareness }
          : {}),
        // F3 parallel-run tag: persist the shared group id into metadata so the
        // compare board can aggregate siblings. Only a non-empty string is forwarded.
        ...(typeof body.taskGroup === 'string' && body.taskGroup.trim()
          ? { metadata: { taskGroup: body.taskGroup.trim() } }
          : {}),
      };
      const result = await module.createWorkspace(input, req.principal!);
      finishWrite(res, result, { statusCode: 201, key: 'workspace' });
    }),
  );

  router.post(
    '/workspaces/:id/steer',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.steerWorkspace(
        {
          workspaceId: req.params.id,
          keys: requireString(body, 'keys'),
          ...(typeof body.submit === 'boolean' ? { submit: body.submit } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { key: 'steered' });
    }),
  );

  // Invoke one closed-schema action in THIS owned workspace. The actor always
  // comes from the authenticated Principal and `workspace` is the durable id;
  // the skill service resolves its real server-side worktree before policy and
  // capability dispatch. Refused / needs_approval / executed are all truthful
  // product outcomes, so each is returned as data rather than flattened into an
  // HTTP transport error.
  router.post(
    '/workspaces/:id/skills/:skillId/actions/:actionId',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const invocation = await module.invokeSkillAction({
        skillId: req.params.skillId,
        actionId: req.params.actionId,
        params: body.params ?? {},
        actorId: req.principal!.userId,
        workspace: req.params.id,
      });
      sendSuccess(res, { invocation });
    }),
  );

  // Newest-first, content-hashed invocation evidence for this owned workspace.
  // The shared access middleware keeps the target tenant-scoped; the record is a
  // read projection and never re-runs a capability.
  router.get(
    '/workspaces/:id/skills/invocations',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const requested = Number(req.query.limit);
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(200, Math.floor(requested))) : 50;
      sendSuccess(res, { evidence: await module.skillInvocationEvidence(req.params.id, limit) });
    }),
  );

  router.get(
    '/workspaces/:id/policy',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      sendSuccess(res, { policy: await module.workspacePolicy(req.params.id) });
    }),
  );

  router.put(
    '/workspaces/:id/policy',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const update = parseWorkspacePolicyUpdate(asObject(req.body));
      const result = await module.setWorkspacePolicy(req.params.id, update, req.principal!);
      finishWrite(res, result, { key: 'policy' });
    }),
  );

  router.post(
    '/workspaces/:id/review-comments',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      // Pre-validate for a clean 400 BEFORE the gated steer: a payload with no
      // usable comments would otherwise compose to an empty prompt and be refused
      // post-gate with an opaque reason.
      const comments = parseReviewComments(body.comments);
      if (comments.length === 0) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          '`comments` must be a non-empty array of { file, body, line? }',
        );
      }
      const result = await module.sendReviewComments(
        { workspaceId: req.params.id, comments },
        req.principal!,
      );
      // `review.delivery` tells the client whether the comments steered a live turn
      // or kicked a new follow-up run — truthful either way, never a fake steer.
      finishWrite(res, result, { key: 'review' });
    }),
  );

  router.post(
    '/workspaces/:id/review-findings',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const findings = await module.generateReviewFindings(req.params.id, req.principal!);
      sendSuccess(res, { findings });
    }),
  );

  router.post(
    '/workspaces/:id/blocker-feedback',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const result = await module.sendBlockerFeedback(req.params.id, req.principal!);
      finishWrite(res, result, { key: 'feedback' });
    }),
  );

  router.post(
    '/reconcile',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const result = await module.reconcile(req.principal!);
      finishWrite(res, result, { key: 'report' });
    }),
  );

  return router;
}

/** Map a governed write result onto the response envelope (deny ⇒ truthful 403). */
function finishWrite<T>(
  res: import('express').Response,
  result: ConductorWriteResult<T>,
  opts: { key: string; statusCode?: number },
): void {
  if (result.ok) {
    sendSuccess(res, { [opts.key]: result.value ?? null, verdict: verdictView(result) }, {
      ...(opts.statusCode ? { statusCode: opts.statusCode } : {}),
    });
    return;
  }
  if (result.code === 'escalated' || result.code === 'trust_blocked') {
    sendError(res, createError(ErrorCode.CONFLICT, result.reason ?? 'merge requires review', {
      details: {
        outcome: result.code,
        verdict: verdictView(result),
      },
    }));
    return;
  }
  if (result.verdict.effect === 'allow') {
    // Gate allowed but execution could not complete — truthful 503, not a fake 200.
    sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'operation failed'));
    return;
  }
  sendError(
    res,
    createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, result.reason ?? 'blocked by governance gate'),
  );
}

function verdictView<T>(result: ConductorWriteResult<T>): Record<string, unknown> {
  const v = result.verdict;
  return { effect: v.effect, tier: v.tier, degraded: v.degraded, engine: v.engine };
}

// --- validation helpers (fail-fast, uniform error envelope) ------------------

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function parseRemoteCapabilities(value: unknown): readonly ('monitor' | 'steer')[] {
  if (!Array.isArray(value)) return ['monitor'];
  const requested = new Set(value.filter((entry): entry is string => typeof entry === 'string'));
  const capabilities = (['monitor', 'steer'] as const).filter(capability => requested.has(capability));
  return capabilities.length > 0 ? capabilities : ['monitor'];
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`${key}\` is required`);
  }
  return value;
}

/**
 * Parse the OPTIONAL preview-verify options off a request body. Every field is
 * optional (a bare `POST` verifies with the adapter's bounded defaults); only
 * well-typed entries are forwarded, everything else is dropped (never trusted).
 */
function readPreviewVerifyOptions(body: Record<string, unknown>): PreviewVerifyOptions {
  const assertions: PreviewVerifyAssertion[] = Array.isArray(body.assertions)
    ? body.assertions.flatMap((entry) => {
        if (entry === null || typeof entry !== 'object') return [];
        const expected = (entry as { expected?: unknown }).expected;
        if (typeof expected !== 'string' || expected.length === 0) return [];
        const target = (entry as { target?: unknown }).target;
        return [{ expected, ...(typeof target === 'string' ? { target } : {}) }];
      })
    : [];
  return {
    ...(assertions.length > 0 ? { assertions } : {}),
    ...(typeof body.screenshot === 'boolean' ? { screenshot: body.screenshot } : {}),
    ...(typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs) && body.timeoutMs > 0
      ? { timeoutMs: body.timeoutMs }
      : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSubstrate(value: unknown): value is WorkspaceSubstrate {
  return typeof value === 'string' && (SUBSTRATES as readonly string[]).includes(value);
}

/** Clone outcome → the contract's error code (400 / 409 / 503). */
const CLONE_ERROR_CODE: Readonly<Record<CloneRepoErrorCode, ErrorCode>> = {
  invalid_input: ErrorCode.INVALID_INPUT,
  dest_exists: ErrorCode.CONFLICT,
  no_tool: ErrorCode.SERVICE_UNAVAILABLE,
  clone_failed: ErrorCode.SERVICE_UNAVAILABLE,
};

const MERGE_STRATEGIES = ['squash', 'merge', 'rebase'] as const;

function isMergeStrategy(value: unknown): value is (typeof MERGE_STRATEGIES)[number] {
  return typeof value === 'string' && (MERGE_STRATEGIES as readonly string[]).includes(value);
}

/** Bound one discard batch — each path costs a bounded number of git spawns. */
const MAX_DISCARD_PATHS = 500;

/**
 * A discard path that can never escape the worktree or become a git option (the
 * `isSafeRelPath` pattern from `converge.ops.ts`): no absolute path, no `..`
 * segment, no leading `-`, no NUL.
 */
function isSafeDiscardPath(p: string): boolean {
  if (!p || p.startsWith('-') || p.includes('\0')) return false;
  if (nodePath.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..');
}

/** Validate the `{paths}` body of `/files/discard` fail-fast (400 on any bad entry). */
function readDiscardPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, '`paths` must be a non-empty string array');
  }
  if (value.length > MAX_DISCARD_PATHS) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`paths\` must contain at most ${MAX_DISCARD_PATHS} entries`);
  }
  for (const p of value) {
    if (typeof p !== 'string' || p.length === 0) {
      throw createError(ErrorCode.VALIDATION_ERROR, '`paths` must be a non-empty string array');
    }
    if (!isSafeDiscardPath(p)) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        '`paths` entries must be safe repo-relative paths (no absolute, no "..", no leading "-")',
      );
    }
  }
  return value as string[];
}

/** Bound one hunk-reject batch — each request costs one diff + one apply + one commit. */
const MAX_DISCARD_HUNKS = 200;

/** Validate the `path` body of `/files/discard-hunks` fail-fast (same safe-path law as `/files/discard`). */
function readDiscardHunkPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || !isSafeDiscardPath(value)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      '`path` must be a safe repo-relative path (no absolute, no "..", no leading "-")',
    );
  }
  return value;
}

/** Validate the `hunkIndexes` body of `/files/discard-hunks` fail-fast (400 on any bad entry). */
function readDiscardHunkIndexes(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, '`hunkIndexes` must be a non-empty array of non-negative integers');
  }
  if (value.length > MAX_DISCARD_HUNKS) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`hunkIndexes\` must contain at most ${MAX_DISCARD_HUNKS} entries`);
  }
  for (const index of value) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      throw createError(ErrorCode.VALIDATION_ERROR, '`hunkIndexes` must be a non-empty array of non-negative integers');
    }
  }
  return value as number[];
}

/** A positive-integer query param (e.g. `?limit=50`), or `undefined` when absent/invalid. */
function readPositiveIntQuery(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Map a read-op failure to the truthful error: "not found" → 404, else 503. */
function toReadError(err: unknown, fallback: string): ReturnType<typeof createError> {
  const message = err instanceof Error ? err.message : fallback;
  if (message.includes('not found')) return createError(ErrorCode.NOT_FOUND, message);
  return createError(ErrorCode.SERVICE_UNAVAILABLE, message);
}
