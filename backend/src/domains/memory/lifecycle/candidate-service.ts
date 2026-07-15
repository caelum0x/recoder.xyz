/**
 * lifecycle/candidate-service — propose + read the EPHEMERAL memory candidates
 * (wisps) that a run harvests. A candidate is NEVER durable: it is a reviewable
 * proposal that a human/policy later accepts (see `memory-lifecycle.ts`).
 *
 * The canonical `memory_candidates` table is agent-os-owned, so writes go through
 * the injected `MemoryRepository` (which delegates to the agent-os store); this
 * service only shapes a valid `MemoryCandidate`, enforces the EVIDENCE invariant
 * ("an unevidenced memory is noise"), and best-effort mirrors the wisp into the
 * beads issue-graph shared memory.
 *
 * TRUTH: a proposal with no evidence is rejected fast — never silently stored.
 * Beads mirroring is best-effort; a `bd`-down environment does not fail the
 * proposal (the durable store-of-record write is what matters).
 */
import type { MemoryCandidate } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { ErrorCode, createError } from '../../../shared/errors.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { BeadsMemoryPort } from '../ports/beads-memory.port.js';

/** The scope vocabulary a candidate may be filed under (mirrors agent-os). */
export type MemoryScope = MemoryCandidate['scope'];

/** Evidence linking a memory to the run/artifact that produced it (required). */
export interface CandidateEvidence {
  readonly taskId: string;
  readonly artifactId: string;
}

/** Input to propose a candidate wisp. Actor id comes from the caller, not the body. */
export interface ProposeCandidateInput {
  readonly userId: string;
  readonly scope: MemoryScope;
  readonly title: string;
  readonly body: string;
  /** Who proposed it (a resolved principal id or a service agent id). */
  readonly proposedBy: string;
  readonly evidence: CandidateEvidence;
  /** Optional bd id this memory was discovered from (adds a beads dep edge). */
  readonly discoveredFrom?: string;
  /** Optional TTL expiry ISO string (wisps are TTL-bound). */
  readonly expiresAt?: string | null;
}

export interface CandidateService {
  /** Propose an evidence-backed candidate wisp (agent-os store + beads mirror). */
  propose(input: ProposeCandidateInput): Promise<MemoryCandidate>;
  /** List a user's candidate wisps, optionally scoped. */
  list(userId: string, scope?: string): Promise<readonly MemoryCandidate[]>;
  /** Fetch one candidate by id (tenant-scoped). */
  get(userId: string, candidateId: string): Promise<MemoryCandidate | null>;
}

export interface CandidateServiceDeps {
  readonly repository: MemoryRepository;
  readonly beads: BeadsMemoryPort;
  readonly logger: Logger;
  /** Injectable clock + id for deterministic tests. */
  readonly now?: () => string;
  readonly newId?: () => string;
}

function defaultId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return `mc_${c.randomUUID()}`;
  return `mc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Enforce the evidence invariant: every candidate must cite a task + artifact. */
function requireEvidence(input: ProposeCandidateInput): void {
  const hasEvidence =
    input.evidence &&
    typeof input.evidence.taskId === 'string' &&
    input.evidence.taskId.trim().length > 0 &&
    typeof input.evidence.artifactId === 'string' &&
    input.evidence.artifactId.trim().length > 0;
  if (!hasEvidence) {
    throw createError(
      ErrorCode.MISSING_REQUIRED_FIELD,
      'memory candidate requires evidence { taskId, artifactId } — an unevidenced memory is noise',
    );
  }
  if (!input.title?.trim() || !input.body?.trim()) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'memory candidate requires a non-empty title and body');
  }
}

/** Build the candidate service. */
export function createCandidateService(deps: CandidateServiceDeps): CandidateService {
  const { repository, beads, logger } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultId;

  return {
    async propose(input: ProposeCandidateInput): Promise<MemoryCandidate> {
      requireEvidence(input);

      const candidate: MemoryCandidate = {
        candidateId: newId(),
        scope: input.scope,
        title: input.title.trim(),
        body: input.body.trim(),
        status: 'candidate_created',
        evidence: { taskId: input.evidence.taskId, artifactId: input.evidence.artifactId },
        proposedBy: input.proposedBy,
        proposedAt: now(),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      };

      const stored = await repository.upsertCandidate(input.userId, candidate);

      // Best-effort mirror into the beads issue-graph shared memory (never fatal).
      if (beads.available()) {
        try {
          beads.remember({
            title: stored.title,
            body: stored.body,
            scope: String(stored.scope),
            ...(input.discoveredFrom ? { discoveredFrom: input.discoveredFrom } : {}),
          });
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'candidate beads mirror failed');
        }
      }

      return stored;
    },

    async list(userId: string, scope?: string): Promise<readonly MemoryCandidate[]> {
      return repository.listCandidates(userId, scope);
    },

    async get(userId: string, candidateId: string): Promise<MemoryCandidate | null> {
      return repository.getCandidate(userId, candidateId);
    },
  };
}
