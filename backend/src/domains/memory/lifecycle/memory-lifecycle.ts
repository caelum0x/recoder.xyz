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
import type { IssueGraphService } from '../ports/issue-graph.port.js';
import type { Mem0Message, Mem0Port } from '../ports/mem0.port.js';
import { resolveMemoryReadAuthz } from '../memory-authz.js';

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
  /** The beads module facet — `promote` is the module-internal governed verb. */
  readonly beads: IssueGraphService;
  /**
   * OPTIONAL semantic-memory write seam. On an allowed promotion the accepted
   * durable fact is best-effort written into mem0's vector store so mem0's LLM
   * fact-extraction / consolidation / graph run on REAL tenant data. Absent or
   * down → truthful skip; NEVER blocks the promotion.
   */
  readonly mem0?: Mem0Port;
  /**
   * Desktop single-user plane (bootstrap-injected from `RECODER_SOLO_MODE`). When
   * set, the candidate lookup fails OPEN so the embedded local owner is never
   * locked out of their own accept/reject; a cloud deploy leaves it false so the
   * owner-bound tenant scoping holds.
   */
  readonly soloMode?: boolean;
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
  supersedesMemoryId?: string
): MemoryItem {
  return {
    memoryId,
    scope: candidate.scope,
    title: candidate.title,
    body: candidate.body,
    status: 'active',
    evidence: {
      taskId: candidate.evidence.taskId,
      artifactId: candidate.evidence.artifactId,
    },
    createdAt,
    acceptedBy,
    ...(candidate.expiresAt !== undefined
      ? { expiresAt: candidate.expiresAt }
      : {}),
    ...(supersedesMemoryId ? { supersedesMemoryId } : {}),
  };
}

/** Build the governed memory lifecycle. */
export function createMemoryLifecycle(
  deps: MemoryLifecycleDeps
): MemoryLifecycle {
  const { repository, gate, beads, mem0, logger } = deps;
  const soloMode = deps.soloMode === true;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultId;

  return {
    async accept(input: AcceptCandidateInput): Promise<AcceptResult> {
      // Owner-bind the candidate lookup (proposedBy === userId) unless the
      // reviewer is a privileged operator or we are in solo mode. A non-owner
      // resolves to `null` → NOT_FOUND below, BEFORE the governance gate and any
      // materialize/mem0 write (no cross-tenant promotion; no existence oracle).
      const candidate = await repository.getCandidate(
        input.userId,
        input.candidateId,
        resolveMemoryReadAuthz(input.principal, soloMode)
      );
      if (!candidate) {
        throw createError(
          ErrorCode.NOT_FOUND,
          `memory candidate not found: ${input.candidateId}`
        );
      }

      // THE write seam. A durable memory promotion is a governed mutation; the
      // verdict's `effect` is the sole authority for whether we materialize.
      const verdict = await gate.decide(
        MEMORY_PROMOTE_ACTION,
        input.principal,
        {
          target: { toolName: 'memory.promote' },
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.runId ? { runId: input.runId } : {}),
          metadata: {
            candidateId: candidate.candidateId,
            scope: String(candidate.scope),
            ...(input.supersedesMemoryId
              ? { supersedesMemoryId: input.supersedesMemoryId }
              : {}),
          },
        }
      );

      if (verdict.effect !== 'allow') {
        // Truthful: not promoted. The candidate is untouched (or marked reviewed
        // when the gate wants a human) — never silently written to durable memory.
        logger.info(
          {
            candidateId: candidate.candidateId,
            effect: verdict.effect,
            approvalId: verdict.approvalId ?? null,
          },
          'memory promotion gated (not allowed)'
        );
        return { promoted: false, candidate, verdict };
      }

      const timestamp = now();
      const memory = materialize(
        candidate,
        newId(),
        input.principal.userId,
        timestamp,
        input.supersedesMemoryId
      );
      const storedMemory = await repository.upsertItem(input.userId, memory);

      // Mark the candidate accepted (agent-os-owned status transition).
      const acceptedCandidate: MemoryCandidate = {
        ...candidate,
        status: 'accepted',
        reviewedBy: input.principal.userId,
        reviewedAt: timestamp,
      };
      const storedCandidate = await repository.upsertCandidate(
        input.userId,
        acceptedCandidate
      );

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
            'supersedes relation write failed (item promoted, edge not recorded)'
          );
        }
      }

      // Close the semantic-memory loop: mirror the accepted durable fact into
      // mem0's vector store so its LLM fact-extraction / consolidation / graph
      // run on REAL tenant data (mem0 is READ on launch but was never WRITTEN,
      // leaving its consolidation/relations/decay dead). Best-effort like the
      // supersedes edge above: mem0 absent/down → truthful skip, NEVER blocks
      // the promotion. The supersedes link is mirrored into the scope metadata
      // so mem0's own consolidation can supersede the prior memory.
      if (mem0) {
        try {
          const messages: readonly Mem0Message[] = [
            { role: 'user', content: candidate.title },
            { role: 'assistant', content: candidate.body },
          ];
          const res = await mem0.add(messages, {
            userId: input.userId,
            metadata: {
              memoryId: storedMemory.memoryId,
              scope: String(candidate.scope),
              source: 'memory.promote',
              ...(input.supersedesMemoryId
                ? { supersedesMemoryId: input.supersedesMemoryId }
                : {}),
            },
          });
          if (!res.ok) {
            logger.info(
              { memoryId: storedMemory.memoryId, reason: res.reason ?? null },
              'mem0 mirror skipped (semantic store unavailable) — durable item promoted'
            );
          }
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'mem0 mirror write failed (item promoted, semantic memory not updated)'
          );
        }
      }

      // Best-effort promote the beads wisp to durable Dolt-versioned memory.
      // `bd promote` only accepts the bd-issued wisp id captured at propose time
      // (`beadsRef`) — never the locally-minted candidateId. When the ref is
      // absent (bd was down at propose) there is no wisp to promote: skip
      // truthfully instead of issuing a promote that can never succeed. The
      // reviewing principal is the bd audit-trail actor.
      if (candidate.beadsRef) {
        try {
          const wispPromoted = await beads.promote(
            candidate.beadsRef,
            input.principal.userId
          );
          if (!wispPromoted) {
            logger.warn(
              {
                candidateId: candidate.candidateId,
                beadsRef: candidate.beadsRef,
              },
              'beads wisp not promoted to durable Dolt memory (bd unavailable or promote failed)'
            );
          }
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'beads promote failed'
          );
        }
      } else {
        logger.info(
          { candidateId: candidate.candidateId },
          'candidate has no beads wisp ref (bd was down at propose) — beads promote skipped'
        );
      }

      return {
        promoted: true,
        memory: storedMemory,
        candidate: storedCandidate,
        verdict,
      };
    },

    async reject(input: RejectCandidateInput): Promise<RejectResult> {
      // Owner-bind the lookup (see `accept`): a non-owner resolves to `null` →
      // NOT_FOUND, BEFORE any audit seal or candidate state change.
      const candidate = await repository.getCandidate(
        input.userId,
        input.candidateId,
        resolveMemoryReadAuthz(input.principal, soloMode)
      );
      if (!candidate) {
        throw createError(
          ErrorCode.NOT_FOUND,
          `memory candidate not found: ${input.candidateId}`
        );
      }
      if (!input.reason?.trim()) {
        throw createError(
          ErrorCode.MISSING_REQUIRED_FIELD,
          'a rejection requires a reason'
        );
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
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'reject audit seal failed'
        );
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
