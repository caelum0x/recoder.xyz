/**
 * `createAcpPermissionGate` — bridges an ACP agent's `session/request_permission`
 * to the REAL governance gate, so a gated ACP tool call (shell `execute`, network
 * `fetch`, unknown) is decided by the SAME `gate.decide` seam that guards every
 * other conductor write — never a parallel approval store (AGENTS.md: canonical
 * approval state stays in the governance/agent-os contracts, not in an adapter).
 *
 * Flow: map the ACP tool kind → a `GovernanceAction` (`command.run` / `tool.call`
 * / `file.*`), resolve the workspace's `taskId`/`runId`/worktree for correlation +
 * containment, and ask the gate. `allow` → the permission is granted (and the
 * decision is sealed into the audit chain); `needs_approval` or `deny` → the
 * permission is REFUSED (the agent's turn continues without that tool). A
 * pre-existing `approved` record for (taskId, action) — recorded through the
 * normal approval path — flips the next request to `allow`, mirroring the
 * conductor's retry-approval model instead of holding the JSON-RPC call open.
 *
 * INLINE APPROVAL SEAM: on a fresh `needs_approval` verdict (no pre-existing
 * `approved` record yet — the kernel's bare `approvalGateId` never clears
 * anything and is not a durable record), this bridge OPENS the durable approval
 * itself via the injected {@link AcpPermissionApprovalPort} — the SAME
 * `ApprovalService.request` the REST `/api/agent-os/approvals` edge and the
 * desktop app's inline approval card (`recoder-diff-approval.ts`, which
 * correlates by `taskId`/`runId`) read from. Without this, a `needs_approval`
 * tool call would refuse forever with no record for a human to ever clear — the
 * card's correlation comment ("the ACP permission gate + approval.service
 * thread them through") would be aspirational, not true. The request is
 * best-effort: a failed `request()` call still DENIES (fail-closed — never
 * degrades to an allow) and is logged, just without a durable record this time.
 *
 * Degrade-truthful: a gate error DENIES (never a fabricated allow); `onVerdict`
 * surfaces every decision (the composer maps it to an `approval_requested` /
 * `needs_input` RunEvent for the UI). Every dependency is injected, so the whole
 * bridge is unit-tested with a fake gate + fake workspace lookup + fake approval
 * port.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGatePort } from '../ports/governance-gate.port.js';
import type {
  GovernanceAction,
  GateDecisionContext,
  GateTarget,
  GateVerdict,
  RiskTier,
} from '../../governance/types.js';
import {
  guardConductorWrite,
  recordConductorAudit,
  conductorAuditEntry,
} from '../audit/conductor-audit.js';
import type {
  AcpPermissionContext,
  AcpPermissionDecision,
  AcpToolKind,
} from './acp/acp-client-requests.js';

/** The minimal workspace facts the bridge needs for correlation + containment. */
export interface AcpGateWorkspace {
  readonly taskId?: string;
  readonly runId?: string;
  readonly worktreePath?: string;
}

/**
 * The approval seam — structurally satisfied by the governance
 * `ApprovalService.request` (same contract as `RemoteAttachApprovalPort` /
 * `SkillApprovalPort`). Opens the durable record a `needs_approval` verdict
 * needs so a human can ever clear it, and so the desktop inline-approval card
 * has a real record to show. Kept local so this adapter does not hard-couple
 * to the governance domain's concrete service type.
 */
export interface AcpPermissionApprovalPort {
  request(params: {
    readonly action: string;
    readonly riskTier: RiskTier;
    readonly requestedBy: string;
    readonly reason?: string | null;
    readonly taskId?: string | null;
    readonly target: string;
  }): Promise<{ readonly id: string }>;
}

/** A surfaced gate decision (the composer turns this into a RunEvent). */
export interface AcpPermissionVerdictEvent {
  readonly workspaceId: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly action: GovernanceAction;
  readonly decision: AcpPermissionDecision;
  readonly effect: GateVerdict['effect'];
  readonly reason: string;
  readonly approvalId?: string;
  readonly target: GateTarget;
}

export interface AcpPermissionGateDeps {
  readonly gate: GovernanceGatePort;
  /** Resolve the workspace record for taskId/runId/worktree (null ⇒ uncorrelated). */
  readonly getWorkspace: (
    workspaceId: string
  ) => Promise<AcpGateWorkspace | null>;
  /** The internal service identity the ACP permission check runs under. */
  readonly principal: Principal;
  readonly logger?: LoggerPort;
  /** Truthful surfacing of every decision (→ approval_requested / needs_input RunEvent). */
  readonly onVerdict?: (event: AcpPermissionVerdictEvent) => void;
  /**
   * Opens the durable approval record for a fresh `needs_approval` verdict so a
   * human can clear it and the desktop inline-approval card can show it. Absent
   * ⇒ `needs_approval` still refuses (fail-closed) but no durable record is
   * opened — a logged, truthful degrade, never a silent allow.
   */
  readonly approval?: AcpPermissionApprovalPort;
}

/** Map an ACP tool kind to the governance action the gate reasons about. */
export function policyActionForKind(
  kind: AcpToolKind | null | undefined
): GovernanceAction {
  switch (kind) {
    case 'execute':
      return 'command.run';
    case 'read':
      return 'file.read';
    case 'edit':
    case 'delete':
    case 'move':
      return 'file.write';
    case 'fetch':
    case 'search':
    case 'switch_mode':
    case 'think':
    case 'other':
    default:
      // Network + unknown tool use flows through the tool-call policy (network +
      // MCP-tool-risk evaluators live behind it).
      return 'tool.call';
  }
}

/** The first concrete path the tool call touches, for gate file-boundary containment. */
function firstLocationPath(ctx: AcpPermissionContext): string | undefined {
  const loc = ctx.toolCall.locations?.find(
    l => typeof l?.path === 'string' && l.path !== ''
  );
  return loc?.path;
}

export function createAcpPermissionGate(
  deps: AcpPermissionGateDeps
): (ctx: AcpPermissionContext) => Promise<AcpPermissionDecision> {
  return async (ctx: AcpPermissionContext): Promise<AcpPermissionDecision> => {
    const action = policyActionForKind(ctx.toolCall.kind);
    const workspace = await deps.getWorkspace(ctx.workspaceId).catch(err => {
      deps.logger?.warn?.('acp permission gate: workspace lookup failed', {
        workspaceId: ctx.workspaceId,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

    const path = firstLocationPath(ctx);
    const command = ctx.toolCall.title ?? undefined;
    const target: GateTarget = {
      environment: 'conductor',
      ...(command ? { command } : {}),
      ...(path ? { path } : {}),
    };
    const gateCtx: GateDecisionContext = {
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      ...(workspace?.runId ? { runId: workspace.runId } : {}),
      target,
      ...(workspace?.worktreePath
        ? { workspaceRoot: workspace.worktreePath }
        : {}),
    };

    let verdict: GateVerdict;
    try {
      ({ verdict } = await guardConductorWrite(
        deps.gate,
        action,
        deps.principal,
        gateCtx
      ));
    } catch (err) {
      deps.logger?.warn?.('acp permission gate errored — denying', {
        workspaceId: ctx.workspaceId,
        action,
        err: err instanceof Error ? err.message : String(err),
      });
      return 'deny';
    }

    // A fresh `needs_approval` (not already cleared by a pre-existing `approved`
    // record — that case comes back as `allow` with `verdict.approvalId` set to
    // the clearing record) has nothing yet for a human to act on. Open the
    // durable record now so the desktop inline-approval card has a real,
    // taskId/runId-correlated row to render. Best-effort: a failed open still
    // DENIES (fail-closed) — it never upgrades to an allow — it just means this
    // particular refusal has no durable record this time (logged below).
    let openedApprovalId: string | undefined;
    if (verdict.effect === 'needs_approval' && deps.approval) {
      try {
        const record = await deps.approval.request({
          action,
          riskTier: verdict.tier,
          requestedBy: deps.principal.userId,
          reason: verdict.reason,
          ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
          target: command ?? path ?? ctx.workspaceId,
        });
        openedApprovalId = record.id;
      } catch (err) {
        deps.logger?.warn?.(
          'acp permission gate: failed to open durable approval — refusing without a record',
          {
            workspaceId: ctx.workspaceId,
            action,
            err: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }

    const decision: AcpPermissionDecision =
      verdict.effect === 'allow' ? 'allow' : 'deny';
    deps.onVerdict?.({
      workspaceId: ctx.workspaceId,
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      ...(workspace?.runId ? { runId: workspace.runId } : {}),
      action,
      decision,
      effect: verdict.effect,
      reason: verdict.reason,
      ...(openedApprovalId
        ? { approvalId: openedApprovalId }
        : verdict.approvalId
          ? { approvalId: verdict.approvalId }
          : {}),
      target,
    });

    if (decision === 'allow') {
      // Seal the granted permission into the durable audit chain (best-effort;
      // never blocks the already-decided allow).
      await recordConductorAudit(
        deps.gate,
        conductorAuditEntry(action, deps.principal, verdict, {
          workspaceId: ctx.workspaceId,
          acpToolKind: ctx.toolCall.kind ?? 'other',
          sessionId: ctx.sessionId,
        })
      );
    }
    return decision;
  };
}
