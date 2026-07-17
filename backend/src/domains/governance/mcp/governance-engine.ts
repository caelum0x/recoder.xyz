/**
 * Governance MCP tools (skeleton per the in-proc engine wiring checklist).
 * Registered as the `governance` server into the interop-gated MCP host by the
 * engines domain (Phase 6); every call passes the `authorize→risk→policy→audit`
 * interop chain + governance gate at the host boundary, so these handlers stay
 * thin, READ-ONLY, and truthful over the module surface.
 *
 *  - `governance_kernel_status` — which ladder rung answers (napi/daemon/ts).
 *  - `governance_audit_verify`  — re-walk the durable Merkle chain (tamper check).
 *  - `governance_locks_list`    — active path/work locks (conflict visibility).
 *
 * The write-bearing tools (decide / request-approval / approval-decide /
 * acquire-lock / release-lock / secret-set) are governed mutations contributed by
 * `buildGovernanceWriteTools`, each SELF-GATED through `gate().decide` before it
 * touches state; this engine composes both surfaces and degrades safely (never
 * fakes a result).
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { GovernanceModule } from '../index.js';
import { buildGovernanceWriteTools } from './governance-write-tools.js';

interface LocksListInput {
  readonly holderAgentId?: string;
  readonly taskId?: string;
}

export function buildGovernanceMcpTools(module: GovernanceModule): readonly McpToolRegistration[] {
  return [
    ...buildGovernanceReadTools(module),
    ...buildGovernanceWriteTools(module),
  ];
}

function buildGovernanceReadTools(module: GovernanceModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'governance_kernel_status',
      description: 'Truthful governance kernel ladder status (which rung answered: napi/daemon/ts/synthetic).',
      handler: () => {
        const status = module.kernel().status();
        return {
          engine: status.engine,
          status: status.status,
          degraded: status.degraded,
          reason: status.reason ?? null,
        };
      },
    },
    {
      name: 'governance_audit_verify',
      description: 'Re-walk the durable SHA-256 Merkle audit chain and report tamper-evidence.',
      handler: async () => {
        const result = await module.audit().verify();
        return {
          ok: result.ok,
          entries: result.entries,
          brokenAtSeq: result.brokenAtSeq ?? null,
          tipHash: result.tipHash ?? null,
          kernelTipMatches: result.kernelTipMatches ?? null,
        };
      },
    },
    {
      name: 'governance_locks_list',
      description: 'List active (unreleased, unexpired) path/work locks for conflict visibility.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as LocksListInput;
        const locks = await module.workLocks().listActive({
          ...(input.holderAgentId ? { holderAgentId: input.holderAgentId } : {}),
          ...(input.taskId ? { taskId: input.taskId } : {}),
        });
        return { locks };
      },
    },
  ];
}
