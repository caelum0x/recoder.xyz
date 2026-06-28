/**
 * Conductor coordination integration — DISPATCH (claim-before-launch) + HANDOFF
 * (on review) over `@recoder/coordination`'s `CoordinationEngine`.
 *
 * This is the ADDITIVE second coordination layer for the conductor. The work-LOCK
 * layer (`conductor-locks.ts`) is already wired and is left untouched; this module
 * adds the two not-yet-live capabilities of the same package:
 *
 *   1. DISPATCH CLAIM — an idempotent, exactly-one-winner claim of a `taskId`
 *      taken BEFORE a workspace provisions/launches. Two workspaces for the SAME
 *      task can never both win the claim, so a duplicate agent is never launched.
 *      The claim is released on teardown/failure, which lets a later workspace
 *      re-claim the task (e.g. a retry after the first run ended).
 *
 *   2. REVIEW HANDOFF — when a workspace moves to `awaiting_review` / opens a PR,
 *      we initiate a `review` handoff transferring ownership of the task/run to a
 *      reviewer role, recorded on the real A2A handoff bus and deduplicated via
 *      the durable dedup ledger (so the same review transition emits exactly one
 *      handoff even if `advanceWorkspace` is called repeatedly).
 *
 * Composition mirrors `conductor-locks.ts`: one process-shared engine, built from
 * the real in-memory adapters by DEFAULT, graduating the lock/claim/fence stores
 * to the Postgres adapters when `AGENT_OS_DATABASE_URL` is set. The dispatch
 * engine keeps its OWN lock store (separate from the work-lock engine) so this
 * layer is strictly additive — it never perturbs the proven work-lock behavior.
 *
 * DEGRADE-SAFE: any construction/runtime failure flips `degraded` and the public
 * helpers return `skipped` (claim) / a no-op (release/handoff). The conductor
 * keeps launching — never fake-claimed, never fake-handed-off. This mirrors the
 * lock layer 1:1 so callers treat "coordination unavailable" identically.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md.
 */
import {
  buildCoordinationEngine,
  DEFAULT_COORDINATION_CONFIG,
  memory,
  postgres,
  isOk,
  InProcEventBus,
  CoordinationErrorCode,
  type CoordinationEngine,
  type CoordinationConfig,
  type DirectoryAgent,
  type AgentDirectoryPort,
  type PolicyGatePort,
  type ApprovalGatePort,
  type LockStorePort,
  type ClaimStorePort,
  type LeaseFencerPort,
  type HandoffStorePort,
} from '@recoder/coordination';
import { createLogger } from '../logger';

const logger = createLogger('conductor:coordination');

/** A claim is idempotent over this window; a released claim re-claims freely. */
const CLAIM_RECOVERY_WINDOW_MS = DEFAULT_COORDINATION_CONFIG.claim.recoveryWindowMs;

/**
 * The reviewer role a review handoff transfers ownership to. A logical role id
 * (not a concrete agent) registered in the directory so the handoff target
 * resolves; the real reviewer agent binds to it downstream on the A2A bus.
 */
export const REVIEWER_AGENT_ID = 'recoder-reviewer';

/** The conductor's logical dispatch source agent (the launcher/control plane). */
const CONDUCTOR_AGENT_ID = 'recoder-conductor';

/**
 * AgentDirectory for dispatch + handoff. The conductor does not route across a
 * fleet here — it claims the task FOR the launching workspace's own agent and
 * hands review off to the reviewer role. So the directory answers with a single
 * permissive agent for whatever id is asked (the workspace agent on dispatch,
 * the reviewer on handoff). This keeps dispatch from ever spuriously blocking on
 * "no eligible agent" while the EXACTLY-ONE-WINNER guarantee still comes from the
 * claim store CAS keyed by taskId (not from routing).
 */
const directory: AgentDirectoryPort = {
  async get(agentId: string): Promise<DirectoryAgent | undefined> {
    return permissiveAgent(agentId);
  },
  async listForSpace(): Promise<DirectoryAgent[]> {
    // Routing reads this; the requested-assignee bonus + claim CAS pick the winner.
    return [permissiveAgent(CONDUCTOR_AGENT_ID)];
  },
};

/** A fully-permissive directory agent so routing is never the gate (claim CAS is). */
function permissiveAgent(agentId: string): DirectoryAgent {
  return {
    agentId,
    displayName: agentId,
    vendorSurface: 'recoder',
    runtimeKind: 'remote',
    health: 'healthy',
    capabilityIds: [],
    // '*' supports every task intent so routing never disqualifies on intent.
    supportedIntents: ['*'],
    permissions: { allowGitWrite: true, allowNetwork: true, allowShell: true },
  };
}

/**
 * Policy gate for the dispatch/handoff layer. Coordination is the ASKER, not the
 * owner of policy: the canonical approval/policy gates live in the Recoder
 * control plane (governance-gate / delivery-approval). This in-process gate
 * allows the coordination action through to the claim/handoff so the real gates
 * keep their authority; it never fabricates a denial it cannot justify.
 */
const policyGate: PolicyGatePort = {
  async evaluate() {
    return { allowed: true };
  },
};

/**
 * Approval gate. With `handoffApprovalGate` disabled (below) this is never
 * consulted for review handoffs — review is read-only in spirit and the real
 * approval gate is the control-plane delivery-approval, not this layer. The port
 * is still provided (the engine requires it) and would auto-resolve a granted
 * record rather than block on a human, keeping the layer degrade-safe.
 */
const approvalGate: ApprovalGatePort = {
  async open(request) {
    return { approvalId: `auto-${request.action}`, status: 'granted', openedAt: nowIso() };
  },
  async await(approvalId) {
    return { approvalId, status: 'granted', openedAt: nowIso(), resolvedAt: nowIso() };
  },
  async get(approvalId) {
    return { approvalId, status: 'granted', openedAt: nowIso() };
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Build the dispatch/handoff config: real defaults, approval gate OFF for this layer. */
function buildConfig(): CoordinationConfig {
  return {
    ...DEFAULT_COORDINATION_CONFIG,
    flags: {
      ...DEFAULT_COORDINATION_CONFIG.flags,
      // The control-plane approval gates own approval; this layer records the
      // handoff without blocking on a human gate (review is read-only in spirit).
      handoffApprovalGate: false,
    },
  };
}

/**
 * The owned engine plus the store handles the integration layer drives directly:
 *  - `claimStore` to release a claim by id on teardown,
 *  - `handoffStore` dedup ledger to make a review handoff idempotent on a STABLE
 *    key (the engine mints a fresh handoffId per call, so its envelope dedup key
 *    is not stable across review transitions — we key on `review:taskId:runId`).
 */
type DispatchEngine = {
  engine: CoordinationEngine;
  claimStore: ClaimStorePort;
  handoffStore: HandoffStorePort;
};

/** Lazily-built shared engine. `null` until first init; stays usable thereafter. */
let engine: DispatchEngine | null = null;
/** True once we have decided coordination is unavailable (load failed). */
let degraded = false;

/**
 * Which workspace currently holds the dispatch claim for a task, recorded on a
 * successful claim and cleared on release. The claim's `agentId` is the logical
 * conductor agent (all dispatches share it), so this map lets a conflicting
 * second workspace name the REAL holding workspace truthfully. In-process only;
 * the durable exactly-one-winner state is the claim store itself.
 */
const claimHolderByTask = new Map<string, string>();

/**
 * Build (or return) the shared dispatch/handoff engine. Degrade-safe: any
 * construction failure flips `degraded` and returns `null`, so callers skip the
 * claim/handoff instead of crashing the conductor.
 *
 * Stores: in-memory by DEFAULT; the lock/claim/fence stores graduate to Postgres
 * when `AGENT_OS_DATABASE_URL` is set (durable, cross-process exactly-once). The
 * Postgres pool is created lazily and only when that env var is present.
 */
function getEngine(): DispatchEngine | null {
  if (engine) return engine;
  if (degraded) return null;
  try {
    const config = buildConfig();
    const stores = buildStores(config);
    const handoffStore = new memory.MemoryHandoffStore();
    const built = buildCoordinationEngine({
      config,
      ports: {
        lockStore: stores.lockStore,
        claimStore: stores.claimStore,
        // Both memory + postgres claim stores implement the (unexported)
        // ClaimSnapshotPort; the structural cast satisfies the engine builder.
        claimSnapshot: stores.claimSnapshot as never,
        dependencyStore: new memory.MemoryDependencyStore(),
        handoffStore,
        presenceStore: new memory.MemoryPresenceStore(),
        signalSink: new memory.MemorySignalSink(),
        eventBus: new InProcEventBus(),
        agentDirectory: directory,
        policyGate,
        approvalGate,
        clock: new memory.SystemClock(),
        ids: new memory.UuidIdGenerator(),
        fencer: stores.fencer,
        metrics: new memory.NoopMetrics(),
      },
    });
    engine = { engine: built, claimStore: stores.claimStore, handoffStore };
    logger.info(
      { backend: stores.backend },
      'conductor dispatch/handoff engine ready (@recoder/coordination)',
    );
    return engine;
  } catch (err) {
    degraded = true;
    logger.warn(
      { err },
      'dispatch/handoff engine unavailable — claim-before-launch + review handoff disabled (degraded)',
    );
    return null;
  }
}

/**
 * The store bundle the engine needs, plus which backend was selected.
 *
 * `claimSnapshot` must satisfy the package's (non-exported) `ClaimSnapshotPort`
 * (`listClaims`). Both `MemoryClaimStore` and `PostgresClaimStore` implement it,
 * so we type the field from their shared structural shape rather than the
 * unexported interface name.
 */
type ClaimSnapshotLike = {
  listClaims(spaceIds?: string[]): Promise<unknown[]>;
};
type Stores = {
  lockStore: LockStorePort;
  claimStore: ClaimStorePort;
  claimSnapshot: ClaimSnapshotLike;
  fencer: LeaseFencerPort;
  backend: 'memory' | 'postgres';
};

/**
 * Build the lock/claim/fence stores. Defaults to in-memory; when
 * `AGENT_OS_DATABASE_URL` is set, graduates them to the Postgres adapters over a
 * lazily-created `pg.Pool` so claims/locks survive restart and are exactly-once
 * across processes. A memory claim store is always kept for the snapshot port.
 */
function buildStores(config: CoordinationConfig): Stores {
  const memoryClaim = new memory.MemoryClaimStore({
    recoveryWindowMs: config.claim.recoveryWindowMs,
  });
  const dbUrl = process.env.AGENT_OS_DATABASE_URL;
  if (!dbUrl) {
    return {
      lockStore: new memory.MemoryLockStore(),
      claimStore: memoryClaim,
      claimSnapshot: memoryClaim,
      fencer: new memory.MemoryLeaseFencer(),
      backend: 'memory',
    };
  }

  // Lazy `pg` import: the pure core takes no hard dependency on `pg`; only the
  // composition root does, and only when a DB URL is configured.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pg = require('pg') as { Pool: new (config: { connectionString: string }) => unknown };
  const pool = new pg.Pool({ connectionString: dbUrl });
  const pgClaim = new postgres.PostgresClaimStore(pool as never, {
    recoveryWindowMs: config.claim.recoveryWindowMs,
  });
  return {
    lockStore: new postgres.PostgresLockStore(pool as never),
    claimStore: pgClaim,
    // PostgresClaimStore implements ClaimSnapshotPort too; keep memory as the
    // snapshot fallback type only — postgres serves both at runtime.
    claimSnapshot: pgClaim as never,
    fencer: new postgres.PostgresLeaseFencer(pool as never),
    backend: 'postgres',
  };
}

/** A claim was already held by another active workspace — launch must be refused. */
export type ClaimConflictInfo = {
  /** The agent/workspace whose claim already holds the task. */
  heldByAgentId: string;
  /** The existing claim id. */
  claimId: string;
};

export type ClaimTaskResult =
  | { status: 'claimed'; claimId: string }
  | { status: 'conflict'; conflict: ClaimConflictInfo }
  | { status: 'skipped'; reason: string };

export type ClaimTaskInput = {
  /** The launching workspace — recorded as the claim's requested assignee/owner. */
  workspaceId: string;
  spaceId: string;
  taskId: string;
  /** Declared write surface; informs the claim's lock reservations (isolated layer). */
  targetPaths?: readonly string[];
};

/**
 * Claim a task FOR a workspace BEFORE launch (idempotent, exactly-one-winner).
 *
 * Runs a `DispatchTask` command keyed by `taskId`. If the task is not yet
 * claimed, the claim commits and we return `claimed` with the claim id (kept so
 * teardown can release it). If a live claim already exists for the task (another
 * ACTIVE workspace won), the engine returns a `CLAIM_CONFLICT` error and we
 * return `conflict` naming the holder — the caller must NOT launch a duplicate.
 *
 * Degrade-safe: returns `skipped` (never a fake claim) when coordination is
 * unavailable, so the launch proceeds exactly as it does today.
 */
export async function claimTaskForWorkspace(input: ClaimTaskInput): Promise<ClaimTaskResult> {
  const eng = getEngine();
  if (!eng) {
    return { status: 'skipped', reason: 'coordination-unavailable' };
  }

  const { workspaceId, spaceId, taskId } = input;
  const targetPaths = [...(input.targetPaths ?? [])];

  try {
    const result = await eng.engine.execute({
      kind: 'DispatchTask',
      task: {
        taskId,
        spaceId,
        intent: 'feature',
        targetPaths,
        forbiddenPaths: [],
        // No required capabilities so the permissive workspace agent is eligible;
        // the claim CAS (per taskId) is the real exactly-one-winner gate.
        requiredCapabilityIds: [],
      },
      // No requested assignee: the lone permissive conductor agent is selected so
      // routing never blocks. The EXACTLY-ONE-WINNER guarantee is the claim store
      // CAS keyed by taskId (not routing) — two workspaces for one task still
      // yield exactly one claim; the second gets CLAIM_CONFLICT.
    });

    if (isOk(result)) {
      const value = result.value;
      if (value.kind === 'DispatchTask') {
        const decision = value.decision;
        if (decision.route.blocked || !decision.route.selectedAgentId) {
          // Should not happen with the permissive directory; treated as skip so
          // we never block a launch on a routing quirk (truthful, not a claim).
          logger.warn(
            { workspaceId, taskId, reasons: decision.route.policyFindings },
            'dispatch route blocked — skipping claim (launch proceeds)',
          );
          return { status: 'skipped', reason: 'route-blocked' };
        }
        claimHolderByTask.set(taskId, workspaceId);
        logger.info(
          { workspaceId, taskId, claimId: decision.claim.claimId },
          'task dispatch-claimed for workspace (claim-before-launch)',
        );
        return { status: 'claimed', claimId: decision.claim.claimId };
      }
      return { status: 'skipped', reason: 'unexpected-result' };
    }

    // A claim conflict means the task is already held by another active workspace.
    if (result.error.code === CoordinationErrorCode.CLAIM_CONFLICT) {
      const ctx = (result.error.context ?? {}) as Record<string, unknown>;
      // Prefer the real holding workspace recorded at claim time; fall back to
      // the claim's logical agent id from the error context.
      const heldByAgentId =
        claimHolderByTask.get(taskId) ?? String(ctx.heldByAgentId ?? ctx.agentId ?? 'unknown');
      const claimId = String(ctx.existingClaimId ?? ctx.claimId ?? 'unknown');
      logger.warn(
        { workspaceId, taskId, heldByAgentId, claimId },
        'workspace launch refused — task already claimed by another active workspace',
      );
      return { status: 'conflict', conflict: { heldByAgentId, claimId } };
    }

    // Any other coordination error is degrade-safe: skip the claim, launch proceeds.
    logger.warn(
      { workspaceId, taskId, code: result.error.code, message: result.error.message },
      'dispatch claim errored — skipping claim (launch proceeds)',
    );
    return { status: 'skipped', reason: `dispatch-error:${result.error.code}` };
  } catch (err) {
    logger.warn({ workspaceId, taskId, err }, 'dispatch claim threw — skipping claim (degraded)');
    return { status: 'skipped', reason: 'dispatch-threw' };
  }
}

/**
 * Release the dispatch claim a workspace holds for a task (teardown / launch
 * failure). Idempotent and degrade-safe: a no-op when coordination is
 * unavailable or no live claim is held. Releasing frees the task so a later
 * workspace can re-claim it.
 */
export async function releaseTaskClaim(input: {
  workspaceId: string;
  taskId: string;
}): Promise<{ released: boolean }> {
  const eng = getEngine();
  if (!eng) return { released: false };

  const { workspaceId, taskId } = input;
  try {
    const existing = await eng.claimStore.getByTask(taskId);
    if (!existing) {
      claimHolderByTask.delete(taskId);
      return { released: false };
    }
    await eng.claimStore.release(existing.claimId);
    claimHolderByTask.delete(taskId);
    logger.info(
      { workspaceId, taskId, claimId: existing.claimId },
      'task dispatch-claim released (teardown/failure) — task is re-claimable',
    );
    return { released: true };
  } catch (err) {
    logger.warn({ workspaceId, taskId, err }, 'dispatch claim release failed');
    return { released: false };
  }
}

export type ReviewHandoffResult =
  | { status: 'emitted'; handoffId: string }
  | { status: 'duplicate' }
  | { status: 'skipped'; reason: string };

export type ReviewHandoffInput = {
  /** The workspace whose work is being handed to review (the source agent). */
  workspaceId: string;
  spaceId: string;
  taskId: string;
  /** The run id under review, if known — part of the idempotency key. */
  runId?: string;
  /** Optional human-facing prompt for the reviewer. */
  prompt?: string;
};

/**
 * Emit a `review` handoff transferring ownership of the task/run to the reviewer
 * role, recorded on the real A2A handoff bus via the engine's `InitiateHandoff`
 * command. Idempotent via the durable dedup ledger: the same review transition
 * (keyed by `taskId` + `runId`) emits EXACTLY ONE handoff even if
 * `advanceWorkspace(awaiting_review)` runs more than once.
 *
 * Degrade-safe: returns `skipped` (never a fake handoff) when coordination is
 * unavailable, so a review transition never fails on this layer.
 */
export async function emitReviewHandoff(input: ReviewHandoffInput): Promise<ReviewHandoffResult> {
  const eng = getEngine();
  if (!eng) {
    return { status: 'skipped', reason: 'coordination-unavailable' };
  }

  const { workspaceId, spaceId, taskId, runId } = input;
  // STABLE idempotency key for this review transition. The engine mints a fresh
  // handoffId per call (so its own envelope dedup key differs every call); we key
  // on the transition identity instead, recording it in the SAME durable dedup
  // ledger so a repeated review transition emits exactly one handoff.
  const reviewDedupKey = `review:${taskId}:${runId ?? 'no-run'}`;
  const prompt =
    input.prompt ??
    `Review the work completed for task ${taskId} (workspace ${workspaceId}). ` +
      `Ownership is transferred to the reviewer for approval/merge.`;

  try {
    // Idempotency check FIRST against the durable ledger (the at-least-once →
    // effectively-once anchor). If this review transition was already handed off,
    // do not emit a second handoff.
    if (await eng.handoffStore.hasDedupKey(reviewDedupKey)) {
      logger.info(
        { workspaceId, taskId, runId, reviewDedupKey },
        'review handoff deduplicated — already emitted for this review transition',
      );
      return { status: 'duplicate' };
    }

    const result = await eng.engine.execute({
      kind: 'InitiateHandoff',
      intent: 'review',
      fromAgentId: workspaceId,
      targetAgentId: REVIEWER_AGENT_ID,
      prompt,
      spaceId,
      sourceTaskId: taskId,
    });

    if (isOk(result)) {
      const value = result.value;
      if (value.kind === 'InitiateHandoff') {
        // Record the STABLE transition key so a subsequent identical review
        // transition is recognized as a duplicate above.
        await eng.handoffStore.recordDedupKey(reviewDedupKey);
        const handoffId = value.handoff.handoff.handoffId;
        logger.info(
          { workspaceId, taskId, runId, handoffId },
          'review handoff emitted — task/run ownership transferred to reviewer',
        );
        return { status: 'emitted', handoffId };
      }
      return { status: 'skipped', reason: 'unexpected-result' };
    }

    logger.warn(
      { workspaceId, taskId, code: result.error.code, message: result.error.message },
      'review handoff errored — skipping (review transition proceeds)',
    );
    return { status: 'skipped', reason: `handoff-error:${result.error.code}` };
  } catch (err) {
    logger.warn({ workspaceId, taskId, err }, 'review handoff threw — skipping (degraded)');
    return { status: 'skipped', reason: 'handoff-threw' };
  }
}

/** True when the dispatch/handoff engine is degraded (coordination unavailable). */
export function isDispatchDegraded(): boolean {
  return getEngine() === null;
}
