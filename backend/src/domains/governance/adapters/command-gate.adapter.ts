/**
 * `createCommandGateAdapter` — binds `@recoder/governance`'s `CommandGate` (lane
 * 1, 2026-10-14: built, tested, no caller) behind the conductor's
 * {@link CommandGatePort} so the raw-PTY steer path (the one command surface
 * the ACP tool-call gate does not cover — a human or agent submitting literal
 * text directly into a live Loom pane) is decided, audited, and (for risky
 * commands) approval-gated BEFORE delivery, not after.
 *
 * Boundary, same shape as `governance-gate.port.ts` / `GovernanceBackedKernel`:
 * the conductor domain depends on `CommandGatePort` only; this adapter is the
 * ONE place that imports `@recoder/governance`'s `CommandGate`/`Governance`/
 * `FileAuditLog` directly.
 *
 * Deliberately a SEPARATE `Governance` instance + durable audit log from the
 * backend's own coarse `GovernanceGateService` (the one `guardConductorWrite`
 * already runs for `workspace.steer` before this adapter is ever reached — see
 * `module/governed-writes.ts`). That gate decides "is this principal allowed
 * to steer THIS workspace" from `{workspace, workspaceId}` metadata; it never
 * inspects the literal text. This adapter's `CommandGate` is the one that
 * reasons about the literal command content (risk-tier classification,
 * approval for destructive patterns) — composing it over the SAME coarse gate
 * would require coupling the conductor domain to the full `@recoder/governance`
 * facade just to get a second opinion the coarse gate was never designed to
 * give; a dedicated instance keeps the two gates independently reasoned about
 * and testable, same as `packages/governance/tests/commands/command-gate.test.ts`
 * already does standalone.
 *
 * Approval UX: on a fresh `needs_approval` verdict, this opens a durable
 * record via the injected `CommandGateApprovalPort` (same `ApprovalService
 * .request` shape `AcpPermissionApprovalPort` already uses — see
 * `acp-permission-gate.adapter.ts`) so the record is visible in the existing
 * `/api/agent-os/approvals` edge + desktop `InlineApprovalCard`, exactly like
 * every other governed write. It then denies THIS attempt (fail-closed, same
 * "deny now, a human clears it, the next attempt succeeds" pattern the ACP
 * gate already ships — there is no live-blocking wait here, matching that
 * precedent rather than inventing a second UX). A failed/absent approval
 * channel still denies (CommandGate's own built-in fail-closed default) —
 * never a silent allow, never a silent hang.
 */
import type { AgentProfile } from '@recoder/agent-os';
import {
  CommandGate,
  Governance,
  FileAuditLog,
  type RiskTier,
} from '@recoder/governance';
import type { LoggerPort } from '@recoder/substrate';
import type {
  CommandGatePort,
  CommandGateRequest,
  CommandGateOutcome,
} from '../../conductor/ports/command-gate.port.js';

/**
 * The approval-visibility seam — structurally satisfied by the governance
 * domain's `ApprovalService.request` (same contract
 * `AcpPermissionApprovalPort` already uses). Kept local so this adapter does
 * not hard-couple to the concrete service type.
 */
export interface CommandGateApprovalPort {
  request(params: {
    readonly action: string;
    readonly riskTier: RiskTier;
    readonly requestedBy: string;
    readonly reason?: string | null;
    readonly taskId?: string | null;
    readonly target: string;
  }): Promise<{ readonly id: string }>;
}

export interface CreateCommandGateAdapterDeps {
  /** A dedicated `@recoder/governance` facade (own `Governance.create()`). */
  readonly governance: Governance;
  /** A dedicated durable audit log, e.g. `~/.recoder/audit/command-gate.jsonl`. */
  readonly auditLog: FileAuditLog;
  /** Opens a durable, UI-visible approval record on `needs_approval`; absent ⇒ fail-closed with no record (still safe, just not visible). */
  readonly approvals?: CommandGateApprovalPort;
  readonly logger?: LoggerPort;
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/**
 * Builds the `AgentProfile` CommandGate's underlying policy chain reasons
 * about for a raw-PTY steer actor: shell + git-write capable (this literally
 * IS a live interactive session), no write-lock requirement (the coarse
 * `workspace.steer` gate already covers workspace-level write-lock/ownership
 * before this adapter is ever reached), default-deny files (a destructive or
 * forbidden-path command still has to clear the policy chain on its own
 * merits, not on ambient trust). Genuinely dangerous command PATTERNS (e.g.
 * `rm -rf`) still land on `needs_approval` regardless of this profile's
 * permissions — that classification is content-driven, not ambient-trust-
 * driven (verified in `packages/governance/tests/commands/command-gate.test.ts`,
 * "needs_approval path" suite).
 */
function interactiveSteerActor(actorId: string): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: actorId,
    displayName: actorId,
    vendorSurface: 'claude_code',
    connectorId: 'recoder-loom-steer',
    runtimeKind: 'local',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'allow',
      pathRules: [],
      toolRules: [],
      allowNetwork: true,
      allowShell: true,
      allowGitWrite: true,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: false,
    },
    approvalPolicy: {
      mode: 'policy',
      requiredRules: [],
      allowAutoApprovalForLowRisk: false,
    },
    memoryScope: 'none',
    cwdPolicy: { mode: 'repo_root', allowedRoots: [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/** A locked-down default executor: every real call site supplies its own per-request `deliver`-backed executor, so this firing at all is a wiring bug, not a normal path. */
const REFUSE_DEFAULT_EXECUTOR = async (): Promise<never> => {
  throw new Error(
    'CommandGate default executor invoked without a per-request executor — ' +
      'every command-gate.adapter caller must supply its own delivery via CommandGateRequest.deliver.',
  );
};

export function createCommandGateAdapter(
  deps: CreateCommandGateAdapterDeps,
): CommandGatePort {
  const logger = deps.logger ?? NOOP_LOGGER;

  const gate = new CommandGate({
    governance: deps.governance,
    auditLog: deps.auditLog,
    executor: REFUSE_DEFAULT_EXECUTOR,
    approvalPrompt: deps.approvals
      ? async (details) => {
          try {
            await deps.approvals!.request({
              action: 'command.run',
              riskTier: details.tier,
              requestedBy: details.requestId,
              reason: details.reason,
              target: details.command,
            });
          } catch (err) {
            logger.warn?.('command-gate: failed to open durable approval — denying without a record', {
              err: err instanceof Error ? err.message : String(err),
            });
          }
          // Deny-now / human-clears-it / next-attempt-succeeds — the same
          // pattern `acp-permission-gate.adapter.ts` already ships, not a
          // live-blocking wait on this promise.
          return 'rejected';
        }
      : undefined,
  });

  return {
    async gate(request: CommandGateRequest): Promise<CommandGateOutcome> {
      const actor = interactiveSteerActor(request.actorId);
      let deliveryError: unknown;

      const result = await gate.gate({
        requestId: request.taskId,
        actor,
        command: request.command,
        requestedBy: request.actorId,
        context: request.metadata ? { metadata: request.metadata } : undefined,
        executor: async () => {
          try {
            await request.deliver();
            return { stdout: '', stderr: '', exitCode: 0 };
          } catch (err) {
            deliveryError = err;
            throw err;
          }
        },
      });

      if (result.status === 'execution_failed') {
        // The command was ALLOWED by policy but delivery itself faulted
        // (e.g. the Loom socket errored) — surface the real delivery error to
        // the caller exactly as it would have thrown without this gate in
        // front of it, not the gate's generic wrapper message.
        throw deliveryError instanceof Error
          ? deliveryError
          : new Error(result.reason);
      }

      return {
        allowed: result.status === 'executed',
        reason: result.reason,
        tier: result.verdict.tier,
      };
    },
  };
}
