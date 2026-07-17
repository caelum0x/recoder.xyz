/**
 * lifecycle/forget — the GOVERNED "forget" of a durable memory item. Forgetting
 * a durable memory is a high-risk mutation (it changes what every future recall
 * can see), so it passes THE write seam (`GovernanceGate.decide('memory.forget',
 * …)`) BEFORE anything is changed. A `deny` or `needs_approval` verdict returns
 * truthfully WITHOUT touching the item — the runtime never forgets durable memory
 * on its own authority.
 *
 * On an `allow` verdict the item is TOMBSTONED: its status transitions to
 * `expired` with `expiresAt` set to now, which removes it from active recall
 * (recall fuses only `status === 'active'` items). This is a soft delete: the
 * store-of-record row is retained (agent-os owns `memory_items` and exposes no
 * hard-delete seam), and the forget itself is sealed into the governance audit
 * chain by `decide`. A true hard delete would require an agent-os
 * `deleteMemoryItem` seam (out of this domain's surface).
 *
 * DEGRADE-SAFE + TRUTHFUL: an unknown item is a `NOT_FOUND`; a down persistence
 * pool surfaces through the repository's own truthful write error; a non-allow
 * verdict returns `{ forgotten: false, verdict }` with the item untouched.
 */
import type { MemoryItem } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { ErrorCode, createError } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict } from '../../governance/types.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';

/** The governed action key the gate classifies (durable memory forget). */
export const MEMORY_FORGET_ACTION = 'memory.forget';

/** Input to forget (tombstone) a durable memory item. */
export interface ForgetMemoryInput {
  readonly userId: string;
  readonly memoryId: string;
  /** The actor authorizing the forget (resolved principal). */
  readonly principal: Principal;
  /** Why the memory is being forgotten (required — audited into the verdict). */
  readonly reason: string;
  /** Optional task/run correlation for the audit trail. */
  readonly taskId?: string;
  readonly runId?: string;
}

/** The truthful outcome of a forget attempt. */
export interface ForgetResult {
  /** True only when the gate allowed AND the item was tombstoned. */
  readonly forgotten: boolean;
  /** The item — tombstoned (`expired`) when forgotten, untouched otherwise. */
  readonly item: MemoryItem;
  /** The governance verdict that gated this forget (always present). */
  readonly verdict: GateVerdict;
}

export interface ForgetService {
  /** Forget (tombstone) a durable item, GATED by governance (fail-closed). */
  forget(input: ForgetMemoryInput): Promise<ForgetResult>;
}

export interface ForgetServiceDeps {
  readonly repository: MemoryRepository;
  readonly gate: GovernanceGate;
  readonly logger: Logger;
  readonly now?: () => string;
}

/** Build the governed forget service. */
export function createForgetService(deps: ForgetServiceDeps): ForgetService {
  const { repository, gate, logger } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    async forget(input: ForgetMemoryInput): Promise<ForgetResult> {
      if (!input.reason?.trim()) {
        throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'a forget requires a reason');
      }

      const item = await repository.getItem(input.userId, input.memoryId);
      if (!item) {
        throw createError(ErrorCode.NOT_FOUND, `memory item not found: ${input.memoryId}`);
      }

      // THE write seam. Forgetting durable memory is a governed mutation; the
      // verdict's `effect` is the sole authority for whether we tombstone. The
      // decide pipeline seals this decision (allow OR deny) into the audit chain.
      const verdict = await gate.decide(MEMORY_FORGET_ACTION, input.principal, {
        target: { toolName: 'memory.forget' },
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        metadata: {
          memoryId: item.memoryId,
          scope: String(item.scope),
          reason: input.reason.trim(),
        },
      });

      if (verdict.effect !== 'allow') {
        // Truthful: not forgotten. The item is untouched — never silently deleted.
        logger.info(
          { memoryId: item.memoryId, effect: verdict.effect, approvalId: verdict.approvalId ?? null },
          'memory forget gated (not allowed)',
        );
        return { forgotten: false, item, verdict };
      }

      // Tombstone: transition to `expired` (drops it from active recall) and
      // stamp the expiry. Retains the row (no agent-os hard-delete seam).
      const tombstoned: MemoryItem = {
        ...item,
        status: 'expired',
        expiresAt: now(),
      };
      const stored = await repository.upsertItem(input.userId, tombstoned);

      logger.info(
        { memoryId: stored.memoryId, scope: String(stored.scope) },
        'memory item forgotten (tombstoned to expired)',
      );
      return { forgotten: true, item: stored, verdict };
    },
  };
}
