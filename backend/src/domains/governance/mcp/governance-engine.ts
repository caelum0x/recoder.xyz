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
 * SUBJECT BINDING (SECURITY): the gate admits a *read*, but it does not scope
 * WHICH tenant's rows come back. `governance_locks_list` serves tenant-owned rows
 * (a lock's `holderAgentId` + `resourcePath` + `taskId` reveal what an agent is
 * working on), and its `holderAgentId` filter is caller-supplied — so an unbound
 * handler would let any caller enumerate a VICTIM's locks (or, with no filter,
 * every tenant's active locks). It therefore derives the holder scope from the
 * HOST-AUTHORIZED caller (2nd handler param `McpToolCaller.userId` — the same id a
 * lock is acquired under): a non-privileged caller may only list its OWN locks (an
 * args `holderAgentId` naming a different owner ⇒ 403; an absent filter is forced
 * to the caller's own id, never the global set), an `admin`/`internal` caller may
 * target an arbitrary holder or list all, and an absent caller refuses
 * (AUTH_REQUIRED) rather than leak. `governance_kernel_status` and
 * `governance_audit_verify` expose only GLOBAL, non-tenant introspection (which
 * kernel rung answered; a single-chain integrity summary — a boolean + counts +
 * the Merkle tip hash, never per-tenant audit entry contents), so they carry no
 * subject and stay caller-agnostic.
 *
 * The write-bearing tools (decide / request-approval / approval-decide /
 * acquire-lock / release-lock / secret-set) are governed mutations contributed by
 * `buildGovernanceWriteTools`, each SELF-GATED through `gate().decide` before it
 * touches state; this engine composes both surfaces and degrades safely (never
 * fakes a result).
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { GovernanceModule } from '../index.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { AuditChainService } from '../services/audit-chain.service.js';
import type { WorkLockService } from '../services/work-lock.service.js';
import { buildGovernanceWriteTools } from './governance-write-tools.js';

interface LocksListInput {
  /** Filter to a holder — honoured for the caller's OWN id; a foreign id ⇒ 403 (unless admin/internal). */
  readonly holderAgentId?: string;
  /** Optional additional narrowing to a task (always applied WITHIN the resolved holder scope). */
  readonly taskId?: string;
}

/**
 * The narrow READ surface the introspection tools bind to (a subset of
 * `GovernanceModule`). Kept minimal so the tools compose against contracts, not
 * the composer, and stay trivially fakeable in unit tests.
 */
export interface GovernanceReadSurface {
  kernel(): GovernanceKernelPort;
  audit(): AuditChainService;
  workLocks(): WorkLockService;
}

/** The resolved holder filter a locks read may return (absent ⇒ ALL holders — admin/internal only). */
interface LockHolderScope {
  readonly holderAgentId?: string;
}

/** Does the caller carry an elevated scope that may read across holders? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Resolve the holder scope a locks read is restricted to, bound to the
 * HOST-AUTHORIZED {@link McpToolCaller} — NEVER a free-form arg. A lock's
 * `holderAgentId` is the id it was acquired under (== the caller's `userId`), so a
 * non-privileged caller may only see its OWN locks: an args `holderAgentId` naming
 * a different owner is refused (403), and an absent filter is forced to the
 * caller's own id (never "list every tenant's locks"). An `admin`/`internal`
 * caller may target an arbitrary holder or, with no filter, list all. Absent a
 * caller the edge-exposed read refuses (AUTH_REQUIRED) rather than leak the global
 * set.
 */
function resolveLockHolderScope(
  input: LocksListInput,
  caller: McpToolCaller | undefined,
): LockHolderScope {
  const authUserId = caller?.userId?.trim();
  if (!caller || !authUserId) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'governance: no authorized caller identity');
  }
  const requested = typeof input.holderAgentId === 'string' ? input.holderAgentId.trim() : '';
  if (isPrivileged(caller)) {
    return requested ? { holderAgentId: requested } : {};
  }
  if (requested && requested !== authUserId) {
    throw createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'governance: caller may only list its own work locks',
    );
  }
  return { holderAgentId: authUserId };
}

export function buildGovernanceMcpTools(module: GovernanceModule): readonly McpToolRegistration[] {
  return [
    ...buildGovernanceReadTools(module),
    ...buildGovernanceWriteTools(module, { soloMode: module.soloMode }),
  ];
}

export function buildGovernanceReadTools(module: GovernanceReadSurface): readonly McpToolRegistration[] {
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
      description:
        'List active (unreleased, unexpired) path/work locks for conflict visibility, scoped to the caller\'s own holder id (admin/internal may target any holder).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as LocksListInput;
        const holderScope = resolveLockHolderScope(input, caller);
        const locks = await module.workLocks().listActive({
          ...holderScope,
          ...(input.taskId ? { taskId: input.taskId } : {}),
        });
        return { locks };
      },
    },
  ];
}
