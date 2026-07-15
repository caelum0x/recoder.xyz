/**
 * lifecycle/memory-lifecycle — the GOVERNED promotion of a candidate wisp into a
 * durable memory item. This is a high-risk durable write, so it passes THE write
 * seam (`GovernanceGate.decide('memory.promote', …)`) BEFORE anything is
 * materialized. A `deny` or `needs_approval` verdict returns truthfully WITHOUT
 * promoting — the runtime never writes durable memory on its own authority.
 *
 * On an `allow` verdict the candidate is materialized into a `MemoryItem`
 * (status `active`), the candidate is marked `accepted`, the beads wisp is
 * best-effort promoted to durable Dolt-versioned memory, and (when the accept
 * supersedes an existing item) a `supersedes` relation edge is recorded.
 *
 * Rejection is a low-risk state change (candidate → `rejected` + reason); it is
 * audited through the gate but not blocked.
 */
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { ErrorCode, createError } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict } from '../../governance/types.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { BeadsMemoryPort } from '../ports/beads-memory.port.js';

/** The governed action key the gate classifies (durable memory promotion). */
export const MEMORY_PROMOTE_ACTION = 'memory.promote';
/** The governed action key for a candidate rejection (low risk; audited). */
export const MEMORY_REJECT_ACTION = 'memory.reject';

/** Input to accept (promote) a candidate into durable memory. */
export interface AcceptCandidateInput {
  readonly userId: string;
  readonly candidateId: string;
  /** The reviewer authorizing the promotion (resolved principal). */
  readonly principal: Principal;
  /** Optional durable item this promotion supersedes (records a relation). */
  readonly supersedesMemoryId?: string;
  /** Optional task/run correlation for the audit trail. */
  readonly taskId?: string;
  readonly runId?: string;
}

/** Input to reject a candidate. */
export interface RejectCandidateInput {
  readonly userId: string;
  readonly candidateId: string;
  readonly principal: Principal;
  readonly reason: string;
  readonly taskId?: string;
}

/** The truthful outcome of an accept attempt. */
export interface AcceptResult {
  /** True only when the gate allowed AND the item was materialized. */
  readonly promoted: boolean;
  /** The durable item, present only when `promoted`. */
  readonly memory?: MemoryItem;
  /** The updated candidate (status reflects the outcome). */
  readonly candidate: MemoryCandidate;
  /** The governance verdict that gated this promotion (always present). */
  readonly verdict: GateVerdict;
}

/** The truthful outcome of a reject. */
export interface RejectResult {
  readonly candidate: MemoryCandidate;
}

export interface MemoryLifecycle {
  /** Promote a candidate → durable item, GATED by governance (fail-closed). */
  accept(input: AcceptCandidateInput): Promise<AcceptResult>;
  /** Reject a candidate (audited, low-risk state change). */
  reject(input: RejectCandidateInput): Promise<RejectResult>;
}

export interface MemoryLifecycleDeps {
  readonly repository: MemoryRepository;
  readonly gate: GovernanceGate;
  readonly beads: BeadsMemoryPort;
  readonly logger: Logger;
  readonly now?: () => string;
  readonly newId?: () => string;
}

function defaultId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return `mi_${c.randomUUID()}`;
  return `mi_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Materialize a durable `MemoryItem` from an accepted candidate. */
function materialize(
  candidate: MemoryCandidate,
  memoryId: string,
  acceptedBy: string,
  createdAt: string,
  supersedesMemoryId?: string,
): MemoryItem {
  return {
    memoryId,
    scope: candidate.scope,
    title: candidate.title,
    body: candidate.body,
    status: 'active',
    evidence: { taskId: candidate.evidence.taskId, artifactId: candidate.evidence.artifactId },
    createdAt,
    acceptedBy,
    ...(candidate.expiresAt !== undefined ? { expiresAt: candidate.expiresAt } : {}),
    ...(supersedesMemoryId ? { supersedesMemoryId } : {}),
  };
}

/** Build the governed memory lifecycle. */
export function createMemoryLifecycle(deps: MemoryLifecycleDeps): MemoryLifecycle {
  const { repository, gate, beads, logger } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultId;

  return {
    async accept(input: AcceptCandidateInput): Promise<AcceptResult> {
      const candidate = await repository.getCandidate(input.userId, input.candidateId);
      if (!candidate) {
        throw createError(ErrorCode.NOT_FOUND, `memory candidate not found: ${input.candidateId}`);
      }

      // THE write seam. A durable memory promotion is a governed mutation; the
      // verdict's `effect` is the sole authority for whether we materialize.
      const verdict = await gate.decide(MEMORY_PROMOTE_ACTION, input.principal, {
        target: { toolName: 'memory.promote' },
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        metadata: {
          candidateId: candidate.candidateId,
          scope: String(candidate.scope),
          ...(input.supersedesMemoryId ? { supersedesMemoryId: input.supersedesMemoryId } : {}),
        },
      });

      if (verdict.effect !== 'allow') {
        // Truthful: not promoted. The candidate is untouched (or marked reviewed
        // when the gate wants a human) — never silently written to durable memory.
        logger.info(
          { candidateId: candidate.candidateId, effect: verdict.effect, approvalId: verdict.approvalId ?? null },
          'memory promotion gated (not allowed)',
        );
        return { promoted: false, candidate, verdict };
      }

      const timestamp = now();
      const memory = materialize(
        candidate,
        newId(),
        input.principal.userId,
        timestamp,
        input.supersedesMemoryId,
      );
      const storedMemory = await repository.upsertItem(input.userId, memory);

      // Mark the candidate accepted (agent-os-owned status transition).
      const acceptedCandidate: MemoryCandidate = {
        ...candidate,
        status: 'accepted',
        reviewedBy: input.principal.userId,
        reviewedAt: timestamp,
      };
      const storedCandidate = await repository.upsertCandidate(input.userId, acceptedCandidate);

      // Record the supersedes edge (memory-owned relations) when this replaces one.
      if (input.supersedesMemoryId) {
        try {
          await repository.addRelation({
            userId: input.userId,
            fromMemoryId: storedMemory.memoryId,
            toMemoryId: input.supersedesMemoryId,
            kind: 'supersedes',
          });
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'supersedes relation write failed (item promoted, edge not recorded)',
          );
        }
      }

      // Best-effort promote the beads wisp to durable Dolt-versioned memory.
      if (beads.available()) {
        try {
          beads.promote(candidate.candidateId);
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'beads promote failed');
        }
      }

      return { promoted: true, memory: storedMemory, candidate: storedCandidate, verdict };
    },

    async reject(input: RejectCandidateInput): Promise<RejectResult> {
      const candidate = await repository.getCandidate(input.userId, input.candidateId);
      if (!candidate) {
        throw createError(ErrorCode.NOT_FOUND, `memory candidate not found: ${input.candidateId}`);
      }
      if (!input.reason?.trim()) {
        throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'a rejection requires a reason');
      }

      // Audit the rejection through the gate (best-effort; never blocks the state
      // change — rejection is a safe, low-risk transition).
      try {
        await gate.recordAudit({
          actorId: input.principal.userId,
          action: MEMORY_REJECT_ACTION,
          resource: candidate.candidateId,
          effect: 'allow',
          riskTier: 'low',
          degraded: false,
          payload: { candidateId: candidate.candidateId, reason: input.reason },
        });
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'reject audit seal failed');
      }

      const rejected: MemoryCandidate = {
        ...candidate,
        status: 'rejected',
        reviewedBy: input.principal.userId,
        reviewedAt: now(),
        reviewReason: input.reason.trim(),
      };
      const stored = await repository.upsertCandidate(input.userId, rejected);
      return { candidate: stored };
    },
  };
}
