/**
 * `RemoteAttachService` — the GOVERNED REMOTE ATTACH core (LOOM Bigger Bet C).
 *
 * It mints short-lived, owner-scoped sessions and serves two verbs over the caller's
 * OWN live agents: MONITOR (`snapshot`) and STEER (`steer`). It REUSES the shipped
 * Recoder governance — ownership (`getWorkspace` + `createdBy`/org), the status-board
 * read (the monitor projection), `evaluatePolicy` + the approval gate (the steer
 * gate), and the audit sink — rather than inventing a new auth system.
 *
 * DEFENSE IN DEPTH (every call, no exceptions):
 *  1. The session id is a SCOPE LIMITER, never the sole authority. Every call
 *     RE-DERIVES identity from the authenticated `principal` and REFUSES when
 *     `session.principalId !== principal.userId` (wrong-principal forgery).
 *  2. A session is refused once EXPIRED (hard TTL) — a stale token grants nothing.
 *  3. Ownership is RE-VERIFIED on every call via `getWorkspace`: a workspace whose
 *     ownership changed after mint is refused (never trusted from the minted scope).
 *  4. A call can never reach a workspace OUTSIDE the session's minted scope, and a
 *     capability can never be escalated (a `monitor`-only session can never steer).
 *
 * STEER is policy-gated + audited: `evaluatePolicy` runs FIRST, ALWAYS —
 * `deny` ⇒ refuse (no deliver); `needs_approval` ⇒ open an approval, NOT executed;
 * `allow` ⇒ deliver via the loom `agent.prompt` seam THEN seal an audit record. An
 * unwired delivery seam ⇒ `SERVICE_UNAVAILABLE`. Steer NEVER fires without a genuine
 * `allow` + the `steer` capability + live ownership.
 */
import { randomUUID } from 'node:crypto';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { LoggerPort } from '@recoder/substrate';
import type { AgentProfile } from '@recoder/agent-os';
import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import type { Workspace } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { StatusBoardScope, StatusBoardSnapshot } from '../attention/status-board.service.js';
import { STATUS_BOARD_COLUMNS } from '../attention/status-board.service.js';
import type { AttentionState } from '../types.js';
import type {
  RemoteAttachCapability,
  RemoteAttachScope,
  RemoteAttachSession,
  RemoteSteerResult,
} from './remote-attach.types.js';

// --- injected seams ----------------------------------------------------------

/** The pure policy-evaluation seam (bound to `@recoder/agent-policy`'s `evaluatePolicy`). */
export type RemoteAttachPolicyEvaluator = (input: PolicyInput) => PolicyDecision;

/** The approval seam — structurally satisfied by the governance `ApprovalService.request`. */
export interface RemoteAttachApprovalPort {
  request(params: {
    readonly action: string;
    readonly riskTier: 'low' | 'medium' | 'high' | 'critical';
    readonly requestedBy: string;
    readonly reason?: string | null;
    readonly taskId?: string | null;
    readonly target?: string | null;
  }): Promise<{ readonly id: string }>;
}

/** Delivers a steer input into the live pane (`agent.prompt`). Absent ⇒ SERVICE_UNAVAILABLE. */
export interface RemoteAttachDeliverPort {
  deliver(input: {
    readonly workspaceId: string;
    readonly text: string;
    readonly principal: Principal;
  }): Promise<void>;
}

/** Seals a steer into the durable audit chain. Absent ⇒ best-effort skip (`auditId:null`). */
export interface RemoteAttachAuditPort {
  record(entry: {
    readonly actorId: string;
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly effect: PolicyDecision['effect'];
  }): Promise<{ readonly id: string } | null>;
}

/** Injected wiring for {@link RemoteAttachService}. */
export interface RemoteAttachDeps {
  /** Durable ownership read — re-checked on EVERY call (never trusted from the scope). */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** The owner-scoped live status board (the monitor projection). */
  readStatusBoard(
    scope: StatusBoardScope,
    principal: Principal
  ): Promise<StatusBoardSnapshot>;
  /** The deterministic policy gate for a steer. */
  readonly evaluatePolicy: RemoteAttachPolicyEvaluator;
  /** The approval gate for a `needs_approval` steer verdict. */
  readonly approval: RemoteAttachApprovalPort;
  /** The live steer transport; absent ⇒ an ALLOW-ed steer refuses `SERVICE_UNAVAILABLE`. */
  readonly deliver?: RemoteAttachDeliverPort;
  /** The steer audit sink; absent ⇒ a delivered steer returns `auditId:null` (truthful). */
  readonly audit?: RemoteAttachAuditPort;
  /**
   * OPTIONAL taskGroup → workspace-id resolver (for a `taskGroup`-scoped session). Absent
   * ⇒ a `taskGroup` scope cannot be verified and is refused `SERVICE_UNAVAILABLE`.
   */
  readonly listWorkspaceIdsForTaskGroup?: (
    taskGroup: string,
    principal: Principal
  ) => Promise<readonly string[]>;
  /** Decision clock (epoch ms); defaults to wall clock. Threaded so tests control TTL. */
  readonly now?: () => number;
  /** Session TTL in ms; defaults to {@link DEFAULT_TTL_MS} (short-lived). */
  readonly ttlMs?: number;
  /** Session-id minter; defaults to a random UUID. */
  readonly newSessionId?: () => string;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

/**
 * The seams bootstrap injects for governed remote attach — everything EXCEPT the two
 * reads the conductor composer already owns (`getWorkspace` + the status-board read),
 * which it binds itself. Absent from `ConductorModuleDeps` ⇒ the tools + module methods
 * refuse truthfully (`SERVICE_UNAVAILABLE`), never a faked session/snapshot/delivery.
 */
export type RemoteAttachExternalDeps = Omit<
  RemoteAttachDeps,
  'getWorkspace' | 'readStatusBoard'
>;

/** The mint request — identity + the scope + the opt-in capabilities. */
export interface RemoteAttachRequest {
  readonly principal: Principal;
  readonly scope: RemoteAttachScope;
  readonly capabilities: readonly RemoteAttachCapability[];
}

// --- constants / helpers -----------------------------------------------------

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** Default session TTL — short-lived by design (10 minutes). */
export const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** The known capabilities, so a bad/duplicated set fails fast at mint. */
const KNOWN_CAPABILITIES: readonly RemoteAttachCapability[] = ['monitor', 'steer'];

/** A 403 refusal (truthful message) — the ONE shape every authz gate throws. */
function deny(reason: string): never {
  throw createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, `remote-attach: ${reason}`);
}

/** Does this principal OWN the workspace (by `createdBy`, else matching org tenant)? */
function ownsWorkspace(principal: Principal, workspace: Workspace): boolean {
  if (workspace.createdBy === principal.userId) return true;
  return Boolean(principal.orgId && workspace.tenant?.orgId === principal.orgId);
}

/**
 * A deny-biased actor for a remote steer, carrying NO standing high-risk rights — so
 * the gate's verdict is driven by the ACTION rules alone (mirrors the skill actor). A
 * remote steer is modeled as a `tool.call` on `remote.steer`, gated by the SAME fused
 * rule chain as every other governed action.
 */
function buildSteerActor(principal: Principal, workspaceId: string): AgentProfile {
  const now = new Date(0).toISOString();
  return {
    agentId: principal.userId,
    displayName: `Remote attach ${principal.userId}`,
    vendorSurface: 'custom',
    connectorId: 'remote-attach',
    runtimeKind: 'local',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: workspaceId ? [workspaceId] : [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/** The fully-qualified policy tool name for a remote steer (stable, greppable). */
export const REMOTE_STEER_TOOL_NAME = 'remote.steer';

// --- service -----------------------------------------------------------------

/**
 * The governed remote-attach core. Construct ONCE (it holds the live session store);
 * `attach`/`snapshot`/`steer` each re-derive identity + re-verify ownership.
 */
export class RemoteAttachService {
  private readonly deps: RemoteAttachDeps;
  private readonly logger: LoggerPort;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly newSessionId: () => string;
  /** The live session store — an in-memory map keyed by session id. */
  private readonly sessions = new Map<string, RemoteAttachSession>();

  constructor(deps: RemoteAttachDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
    this.now = deps.now ?? (() => Date.now());
    this.ttlMs = deps.ttlMs && deps.ttlMs > 0 ? deps.ttlMs : DEFAULT_TTL_MS;
    this.newSessionId = deps.newSessionId ?? (() => randomUUID());
  }

  /**
   * MINT a scoped, expiring session for the caller's OWN workspaces/taskGroup. Verifies
   * the principal OWNS every workspace the scope resolves to (else 403); an empty or
   * unresolvable scope is refused. `steer` is opt-in — it is only granted when asked for.
   */
  async attach(request: RemoteAttachRequest): Promise<RemoteAttachSession> {
    const principal = request.principal;
    if (!principal || !principal.userId?.trim()) {
      throw createError(ErrorCode.AUTH_REQUIRED, 'remote-attach: an authenticated caller is required');
    }
    const capabilities = this.normalizeCapabilities(request.capabilities);
    const scope = this.normalizeScope(request.scope);

    // RESOLVE the scope to a concrete, ownership-verified workspace-id set. Ownership is
    // verified HERE at mint AND again on every later call — the scope is never trusted alone.
    const resolvedIds = await this.resolveScopeIds(scope, principal);
    if (resolvedIds.size === 0) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        'remote-attach: scope must name at least one workspace or a non-empty taskGroup'
      );
    }
    for (const workspaceId of resolvedIds) {
      const workspace = await this.deps.getWorkspace(workspaceId);
      // Unknown OR unowned ⇒ 403 (never a cross-tenant attach oracle; never disclose).
      if (!workspace || !ownsWorkspace(principal, workspace)) {
        deny(`caller does not own workspace ${workspaceId}`);
      }
    }

    const issuedAtMs = this.now();
    const session: RemoteAttachSession = {
      sessionId: this.newSessionId(),
      principalId: principal.userId,
      scope,
      capabilities,
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + this.ttlMs).toISOString(),
    };
    this.sessions.set(session.sessionId, session);
    this.logger.info('remote-attach session minted', {
      sessionId: session.sessionId,
      principalId: session.principalId,
      capabilities: session.capabilities,
      workspaces: resolvedIds.size,
    });
    return session;
  }

  /**
   * MONITOR: return an owner-scoped live status snapshot for the session's scope. Re-derives
   * identity (wrong-principal ⇒ 403), refuses an expired session, requires the `monitor`
   * capability, and RE-VERIFIES ownership of every scope workspace — a workspace whose
   * ownership changed after mint is dropped (never surfaced). The board is filtered to the
   * session's minted scope; a session can never widen its view.
   */
  async snapshot(input: {
    readonly sessionId: string;
    readonly principal: Principal;
  }): Promise<StatusBoardSnapshot> {
    const session = this.authorize(input.sessionId, input.principal, 'monitor');
    const allowed = await this.reverifyOwnedScope(session, input.principal);

    // Read the caller's OWN board (owner scope pins to the caller), narrowed by the
    // session's taskGroup when present, then filter to the still-owned scope ids.
    const boardScope: StatusBoardScope = {
      owner: input.principal.userId,
      ...(session.scope.taskGroup ? { taskGroup: session.scope.taskGroup } : {}),
    };
    const board = await this.deps.readStatusBoard(boardScope, input.principal);
    return filterSnapshotToScope(board, allowed);
  }

  /**
   * STEER: deliver an input into ONE live pane in the session's scope — policy-gated +
   * audited. Re-derives identity, refuses an expired session, REQUIRES the `steer`
   * capability (no escalation), requires the workspace to be IN the session scope, and
   * RE-VERIFIES live ownership. Then `evaluatePolicy` runs FIRST: `deny` ⇒ refuse (no
   * deliver); `needs_approval` ⇒ approval, NOT executed; `allow` ⇒ deliver + audit.
   */
  async steer(input: {
    readonly sessionId: string;
    readonly principal: Principal;
    readonly workspaceId: string;
    readonly input: string;
  }): Promise<RemoteSteerResult> {
    const session = this.authorize(input.sessionId, input.principal, 'steer');

    const workspaceId = input.workspaceId?.trim();
    if (!workspaceId) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'remote-attach: workspaceId is required');
    }
    const text = typeof input.input === 'string' ? input.input : '';
    if (text.trim().length === 0) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'remote-attach: a non-empty steer input is required');
    }

    // SCOPE: the workspace must be inside the session's minted scope — a session can
    // never steer a pane it was not minted for.
    const allowed = await this.reverifyOwnedScope(session, input.principal);
    if (!allowed.has(workspaceId)) {
      deny(`workspace ${workspaceId} is outside the session scope`);
    }
    // reverifyOwnedScope already re-checked live ownership for every id it returns.

    // POLICY FIRST, ALWAYS — the steer never fires without a genuine `allow`.
    const decision = this.deps.evaluatePolicy({
      actor: buildSteerActor(input.principal, workspaceId),
      action: 'tool.call',
      target: { toolName: REMOTE_STEER_TOOL_NAME, environment: workspaceId },
    });

    if (decision.effect === 'deny') {
      this.logger.warn('remote-attach steer denied by policy', {
        sessionId: session.sessionId,
        workspaceId,
        reason: decision.reason,
      });
      return { status: 'refused', reason: decision.reason || 'denied by policy' };
    }

    if (decision.effect === 'needs_approval') {
      const record = await this.deps.approval.request({
        action: REMOTE_STEER_TOOL_NAME,
        riskTier: 'high',
        requestedBy: input.principal.userId,
        reason: decision.reason ?? null,
        taskId: workspaceId,
        target: workspaceId,
      });
      this.logger.info('remote-attach steer gated: approval requested', {
        sessionId: session.sessionId,
        workspaceId,
        requestId: record.id,
      });
      return {
        status: 'needs_approval',
        requestId: record.id,
        reason: decision.reason || 'approval required',
      };
    }

    // ALLOW — and ONLY an explicit allow. A security-critical delivery must never be
    // reached by exclusion.
    if (decision.effect !== 'allow') {
      return { status: 'refused', reason: decision.reason || `refused by policy (${decision.effect})` };
    }

    // An unwired transport refuses truthfully — never a faked delivery.
    if (!this.deps.deliver) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'remote-attach: no live steer transport is configured on this deployment'
      );
    }
    await this.deps.deliver.deliver({ workspaceId, text, principal: input.principal });

    // Seal the steer into the audit chain (best-effort — a sealing fault never
    // un-delivers, it surfaces as a `null` audit id).
    let auditId: string | null = null;
    if (this.deps.audit) {
      try {
        const record = await this.deps.audit.record({
          actorId: input.principal.userId,
          workspaceId,
          sessionId: session.sessionId,
          effect: 'allow',
        });
        auditId = record?.id ?? null;
      } catch (err) {
        this.logger.warn('remote-attach steer audit not sealed', {
          workspaceId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.logger.info('remote-attach steer delivered', {
      sessionId: session.sessionId,
      workspaceId,
      auditId,
    });
    return { status: 'delivered', workspaceId, auditId };
  }

  // --- internals -------------------------------------------------------------

  /**
   * The shared per-call gate: look the session up, RE-DERIVE identity from the caller
   * (wrong-principal ⇒ 403), refuse an expired session, and require the capability. The
   * session id is only a lookup key — authority always comes from the live `principal`.
   */
  private authorize(
    sessionId: string,
    principal: Principal,
    capability: RemoteAttachCapability
  ): RemoteAttachSession {
    if (!principal || !principal.userId?.trim()) {
      throw createError(ErrorCode.AUTH_REQUIRED, 'remote-attach: an authenticated caller is required');
    }
    const id = typeof sessionId === 'string' ? sessionId.trim() : '';
    const session = id ? this.sessions.get(id) : undefined;
    // An unknown session is refused as an authz failure (never disclose existence).
    if (!session) deny('unknown or expired session');
    // WRONG-PRINCIPAL: the caller must BE the owner the session was minted for.
    if (session.principalId !== principal.userId) {
      deny('session does not belong to the caller');
    }
    // EXPIRED: a stale token grants nothing.
    if (this.now() >= Date.parse(session.expiresAt)) {
      this.sessions.delete(session.sessionId);
      deny('session has expired');
    }
    // CAPABILITY: cannot be escalated — a monitor-only session can never steer.
    if (!session.capabilities.includes(capability)) {
      deny(`session lacks the '${capability}' capability`);
    }
    return session;
  }

  /**
   * RE-VERIFY live ownership of every workspace the session scope resolves to and return
   * the still-owned set. A workspace whose ownership changed (or vanished) after mint is
   * DROPPED — never trusted from the minted scope.
   */
  private async reverifyOwnedScope(
    session: RemoteAttachSession,
    principal: Principal
  ): Promise<Set<string>> {
    const resolved = await this.resolveScopeIds(session.scope, principal);
    const owned = new Set<string>();
    for (const workspaceId of resolved) {
      const workspace = await this.deps.getWorkspace(workspaceId);
      if (workspace && ownsWorkspace(principal, workspace)) owned.add(workspaceId);
    }
    return owned;
  }

  /**
   * Resolve a scope to its concrete workspace-id set: the explicit ids plus (when a
   * taskGroup is scoped) the ids the resolver returns. A taskGroup scope with no resolver
   * wired is refused `SERVICE_UNAVAILABLE` (it cannot be verified — never assumed empty).
   */
  private async resolveScopeIds(
    scope: RemoteAttachScope,
    principal: Principal
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const workspaceId of scope.workspaceIds ?? []) {
      const trimmed = typeof workspaceId === 'string' ? workspaceId.trim() : '';
      if (trimmed) ids.add(trimmed);
    }
    if (scope.taskGroup) {
      if (!this.deps.listWorkspaceIdsForTaskGroup) {
        throw createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'remote-attach: taskGroup scoping is not configured on this deployment'
        );
      }
      const groupIds = await this.deps.listWorkspaceIdsForTaskGroup(scope.taskGroup, principal);
      for (const workspaceId of groupIds) {
        const trimmed = typeof workspaceId === 'string' ? workspaceId.trim() : '';
        if (trimmed) ids.add(trimmed);
      }
    }
    return ids;
  }

  /** Normalize + validate the opt-in capabilities (deduped, known-only, non-empty). */
  private normalizeCapabilities(
    raw: readonly RemoteAttachCapability[]
  ): readonly RemoteAttachCapability[] {
    const seen = new Set<RemoteAttachCapability>();
    for (const capability of raw ?? []) {
      if (KNOWN_CAPABILITIES.includes(capability)) seen.add(capability);
    }
    // MONITOR is the floor: a session with no explicit capability can still observe.
    if (seen.size === 0) seen.add('monitor');
    return KNOWN_CAPABILITIES.filter(capability => seen.has(capability));
  }

  /** Normalize a scope to a frozen, trimmed shape (immutably — never mutate the input). */
  private normalizeScope(raw: RemoteAttachScope): RemoteAttachScope {
    const workspaceIds = (raw?.workspaceIds ?? [])
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map(id => id.trim());
    const taskGroup =
      typeof raw?.taskGroup === 'string' && raw.taskGroup.trim().length > 0
        ? raw.taskGroup.trim()
        : undefined;
    return {
      ...(workspaceIds.length > 0 ? { workspaceIds } : {}),
      ...(taskGroup ? { taskGroup } : {}),
    };
  }
}

/**
 * Filter a status-board snapshot to the allowed workspace-id set and recompute the
 * truthful per-column + grand totals. A pure fold — the board is never widened.
 */
function filterSnapshotToScope(
  board: StatusBoardSnapshot,
  allowed: ReadonlySet<string>
): StatusBoardSnapshot {
  const columns = {} as Record<AttentionState, StatusBoardSnapshot['columns'][AttentionState]>;
  const totals = {} as Record<AttentionState, number>;
  let total = 0;
  for (const state of STATUS_BOARD_COLUMNS) {
    const cells = (board.columns[state] ?? []).filter(cell => allowed.has(cell.workspaceId));
    columns[state] = cells;
    totals[state] = cells.length;
    total += cells.length;
  }
  return {
    scope: board.scope,
    columns,
    totals,
    total,
    degraded: board.degraded,
    ...(board.reason ? { reason: board.reason } : {}),
  };
}
