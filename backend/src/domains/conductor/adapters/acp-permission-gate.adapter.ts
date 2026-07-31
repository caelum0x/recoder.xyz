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
 * Degrade-truthful: a gate error DENIES (never a fabricated allow); `onVerdict`
 * surfaces every decision (the composer maps it to an `approval_requested` /
 * `needs_input` RunEvent for the UI). Every dependency is injected, so the whole
 * bridge is unit-tested with a fake gate + fake workspace lookup.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGatePort } from '../ports/governance-gate.port.js';
import type {
  GovernanceAction,
  GateDecisionContext,
  GateTarget,
  GateVerdict,
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
      ...(verdict.approvalId ? { approvalId: verdict.approvalId } : {}),
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
