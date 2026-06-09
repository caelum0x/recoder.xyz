import type { MemoryCandidate, MemoryItem } from '../domain';

export type ReviewMemoryCandidateInput = {
  accepted: boolean;
  reviewedBy: string;
  reviewedAt?: string;
  reason?: string;
  memoryId?: string;
  supersedesMemoryId?: string;
};

export type ReviewMemoryCandidateResult = {
  candidate: MemoryCandidate;
  memory?: MemoryItem;
};

export class MemoryService {
  requireEvidence(candidate: MemoryCandidate): void {
    if (!candidate.evidence?.taskId || !candidate.evidence?.artifactId) {
      throw new Error('Memory candidates require task and artifact evidence.');
    }
  }

  review(candidate: MemoryCandidate, input: ReviewMemoryCandidateInput): ReviewMemoryCandidateResult {
    this.requireEvidence(candidate);
    if (candidate.status === 'accepted' || candidate.status === 'rejected') {
      throw new Error(`Memory candidate already reviewed: ${candidate.candidateId}`);
    }

    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    const reviewed: MemoryCandidate = {
      ...candidate,
      status: input.accepted ? 'accepted' : 'rejected',
      reviewedBy: input.reviewedBy,
      reviewedAt,
      reviewReason: input.reason,
    };

    if (!input.accepted) {
      return { candidate: reviewed };
    }

    return {
      candidate: reviewed,
      memory: {
        ...this.materialize(reviewed, input.reviewedBy, reviewedAt),
        memoryId: input.memoryId ?? `memory_${reviewed.candidateId}`,
        supersedesMemoryId: input.supersedesMemoryId,
      },
    };
  }

  materialize(candidate: MemoryCandidate, reviewer: string, now = new Date().toISOString()): MemoryItem {
    this.requireEvidence(candidate);
    if (candidate.status !== 'accepted') {
      throw new Error('Only accepted memory candidates can become durable memory.');
    }
    return {
      memoryId: `memory_${candidate.candidateId}`,
      scope: candidate.scope,
      title: candidate.title,
      body: candidate.body,
      status: 'active',
      evidence: candidate.evidence,
      createdAt: now,
      acceptedBy: reviewer,
      expiresAt: candidate.expiresAt,
    };
  }
}
