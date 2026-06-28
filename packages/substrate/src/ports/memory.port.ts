/**
 * MemoryCandidatePort — the reviewable-memory seam (design §4.8 / §7).
 *
 * On delivery the substrate proposes a reviewable, evidence-backed memory
 * CANDIDATE — it NEVER writes durable memory directly (Agent OS rule). The
 * backend injects an adapter onto the agent-os memory candidate lifecycle.
 * Interface only.
 */
export interface DeliveryEvidence {
  workspaceId: string;
  runId?: string;
  /** Branch/PR/merge refs that constitute the delivery evidence. */
  branch?: string;
  prUrl?: string;
  mergeCommit?: string;
  /** Non-secret structured detail backing the candidate. */
  detail?: Record<string, unknown>;
}

export interface MemoryCandidateRef {
  /** Id of the proposed candidate (for audit/follow-up). */
  candidateId: string;
}

export interface MemoryCandidatePort {
  /** Propose a reviewable delivery memory candidate; returns its ref. */
  proposeDeliveryCandidate(evidence: DeliveryEvidence): Promise<MemoryCandidateRef>;
}
