/**
 * Bridge between the governance domain's `KernelRequest`/`KernelVerdict` and the
 * `@recoder/governance` package's `GovernanceRequest`/`GovernanceVerdict`.
 *
 * The domain deliberately does NOT expose the package's `AgentProfile` shape to
 * consumers; this mapper builds a DENY-BIASED synthetic actor from a bare
 * `actorId` (no standing git-write / PR / secrets rights) so the fused policy
 * chain classifies unaided and risky actions surface as `needs_approval`/`deny`.
 * The `autonomous` context flag (an approved control-plane sign-off) is the only
 * thing that lets the auto-approver clear a gate — the kernel stays the decider.
 */
import type { AgentProfile } from '@recoder/agent-os';
import { createGovernanceRequest, type GovernanceRequest, type GovernanceVerdict } from '@recoder/governance';
import type { KernelEngine, KernelRequest, KernelVerdict } from '../types.js';

/** Build a deny-biased synthetic actor for a bare governance caller id. */
export function buildKernelActor(actorId: string, workspaceRoot?: string): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: actorId || 'anonymous',
    displayName: `Governance actor ${actorId || 'anonymous'}`,
    vendorSurface: 'recoder_code',
    connectorId: 'governance',
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
      // No standing high-risk rights — those must be governed/approved.
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: workspaceRoot ? [workspaceRoot] : [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/** Translate a domain `KernelRequest` into a package `GovernanceRequest`. */
export function toGovernanceRequest(req: KernelRequest): GovernanceRequest {
  const workLocks = (req.workLocks ?? []).map((lock) => ({
    pathGlob: lock.pathGlob,
    mode: lock.mode ?? 'exclusive',
  }));
  return createGovernanceRequest({
    requestId: req.requestId,
    actor: buildKernelActor(req.actorId, req.context?.workspaceRoot),
    // Domain actions are an OPEN string set; the package/Rust action space is a
    // closed union. An unknown action is classified deny-biased by the kernel, so
    // the cast is safe (and intentional — governance decides, not the type).
    action: req.action as GovernanceRequest['action'],
    target: {
      path: req.target.path,
      command: req.target.command,
      toolName: req.target.toolName,
      environment: req.target.environment,
    },
    // WorkLock shape from @recoder/agent-os requires more fields; cast the two
    // the kernel actually reads (pathGlob, mode). Unknown fields are ignored.
    workLocks: workLocks as unknown as GovernanceRequest['workLocks'],
    context: {
      workspaceRoot: req.context?.workspaceRoot,
      autonomous: req.context?.autonomous ?? false,
      bashInput: req.context?.bashInput,
      subagentDepth: req.context?.subagentDepth,
      metadata: {
        taskId: req.context?.taskId ?? req.taskId,
        runId: req.context?.runId,
        ...(req.context?.metadata ?? {}),
      },
    },
    now: req.now,
  });
}

/** Translate a package `GovernanceVerdict` into a domain `KernelVerdict`. */
export function toKernelVerdict(v: GovernanceVerdict, engine: KernelEngine): KernelVerdict {
  return {
    effect: v.effect,
    tier: v.tier,
    reason: v.reason,
    degraded: v.degraded,
    engine,
    auditHash: v.auditHash,
    approvalGateId: v.approvalGateId,
  };
}
