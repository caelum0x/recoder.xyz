/**
 * context-transfer — carry source-task context to the target task on handoff.
 *
 * MERGED from `transferContext` in
 * `docker-backend/src/a2a/context-bridge.service.ts`. The original copied every
 * context entry from `fromTaskId` to `toTaskId` (fresh ids/timestamps, source
 * left intact) through a `ContextStore`, enforcing a per-task byte ceiling. Here:
 *  - the actual entry persistence is a PORT (`ContextTransferPort`) so this stays
 *    side-effect-free at the pure layer;
 *  - the size/validation rules are PURE (`planContextTransfer`), so they are unit
 *    testable without a store;
 *  - failure is DEGRADED-VISIBLE, not fatal: the source pattern logged "context
 *    transfer failed, delegation continues without context" — design §9 keeps the
 *    degradation but makes it observable. The pure planner returns a typed
 *    outcome the caller maps to a low-severity signal rather than throwing.
 */

/** A single transferable context entry (projection of the source `ContextEntry`). */
export type ContextEntry = {
  id: string;
  type: string;
  data: unknown;
  sizeBytes: number;
};

/** Read/write seam for context entries (impure shell implements it). */
export interface ContextTransferPort {
  getAll(taskId: string): Promise<ContextEntry[]>;
  totalSize(taskId: string): Promise<number>;
  put(taskId: string, entry: ContextEntry): Promise<void>;
}

/** Default per-task context ceiling, mirroring the source's 10MB default. */
export const DEFAULT_CONTEXT_MAX_BYTES = 10 * 1024 * 1024;

export type ContextTransferPlan =
  | { readonly kind: 'noop'; readonly reason: 'same-task' | 'empty-source' }
  | { readonly kind: 'rejected'; readonly reason: 'size-exceeded'; readonly wouldBe: number; readonly limit: number }
  | { readonly kind: 'transfer'; readonly entries: ReadonlyArray<ContextEntry>; readonly totalBytes: number };

export type PlanContextTransferInput = {
  fromTaskId: string;
  toTaskId: string;
  sourceEntries: ReadonlyArray<ContextEntry>;
  destCurrentBytes: number;
  maxBytes?: number;
};

/**
 * PURE: decide what a transfer would do, mirroring `transferContext`'s guards
 * (same-task rejected, empty source rejected, size-limit enforced) without
 * performing any IO. The caller runs the plan through the port.
 */
export function planContextTransfer(input: PlanContextTransferInput): ContextTransferPlan {
  const { fromTaskId, toTaskId, sourceEntries, destCurrentBytes } = input;
  const maxBytes = input.maxBytes ?? DEFAULT_CONTEXT_MAX_BYTES;

  if (fromTaskId === toTaskId) {
    return { kind: 'noop', reason: 'same-task' };
  }
  if (sourceEntries.length === 0) {
    return { kind: 'noop', reason: 'empty-source' };
  }

  const sourceBytes = sourceEntries.reduce((sum, e) => sum + e.sizeBytes, 0);
  const wouldBe = destCurrentBytes + sourceBytes;
  if (wouldBe > maxBytes) {
    return { kind: 'rejected', reason: 'size-exceeded', wouldBe, limit: maxBytes };
  }

  return { kind: 'transfer', entries: sourceEntries, totalBytes: sourceBytes };
}

export type ContextTransferResult = {
  fromTaskId: string;
  toTaskId: string;
  entriesTransferred: number;
  totalBytes: number;
  transferredAt: string;
};

export type ContextTransferDegraded = {
  fromTaskId: string;
  toTaskId: string;
  reason: 'same-task' | 'empty-source' | 'size-exceeded' | 'error';
  detail?: string;
};

export type ContextTransferOutcome =
  | { readonly ok: true; readonly result: ContextTransferResult }
  | { readonly ok: false; readonly degraded: ContextTransferDegraded };

/**
 * IMPURE SHELL: run a planned transfer through the port. Best-effort — any
 * failure (port error or a non-transfer plan) yields a degraded outcome the
 * caller surfaces as a low-severity signal; it never throws past this boundary,
 * preserving "delegation continues without context".
 */
export async function transferContext(
  port: ContextTransferPort,
  fromTaskId: string,
  toTaskId: string,
  now: string,
  maxBytes: number = DEFAULT_CONTEXT_MAX_BYTES,
): Promise<ContextTransferOutcome> {
  try {
    const sourceEntries = await port.getAll(fromTaskId);
    const destCurrentBytes = await port.totalSize(toTaskId);
    const plan = planContextTransfer({
      fromTaskId,
      toTaskId,
      sourceEntries,
      destCurrentBytes,
      maxBytes,
    });

    if (plan.kind === 'noop') {
      return { ok: false, degraded: { fromTaskId, toTaskId, reason: plan.reason } };
    }
    if (plan.kind === 'rejected') {
      return {
        ok: false,
        degraded: {
          fromTaskId,
          toTaskId,
          reason: 'size-exceeded',
          detail: `would be ${plan.wouldBe} bytes, limit ${plan.limit}`,
        },
      };
    }

    for (const entry of plan.entries) {
      // Fresh id/timestamp per entry — source remains intact (source semantics).
      await port.put(toTaskId, { ...entry, id: `${entry.id}:${toTaskId}` });
    }

    return {
      ok: true,
      result: {
        fromTaskId,
        toTaskId,
        entriesTransferred: plan.entries.length,
        totalBytes: plan.totalBytes,
        transferredAt: now,
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      degraded: {
        fromTaskId,
        toTaskId,
        reason: 'error',
        detail: error instanceof Error ? error.message : 'unknown error',
      },
    };
  }
}
