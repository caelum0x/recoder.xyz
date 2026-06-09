import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import { createMemoryCandidate } from './memory-candidate';
import { materializeMemoryItem, reviewMemoryCandidate } from './memory-review';
import type { MemoryStore } from './memory-store';

export type ProposeMemoryInput = {
  candidateId: string;
  scope: MemoryCandidate['scope'];
  title: string;
  body: string;
  evidence: MemoryCandidate['evidence'];
  proposedBy: string;
  proposedAt?: string;
  expiresAt?: string | null;
};

export type ReviewMemoryInput = {
  candidate: MemoryCandidate;
  accepted: boolean;
  reviewedBy: string;
  reviewedAt?: string;
  reason?: string;
  memoryId?: string;
  supersedesMemoryId?: string;
};

export type ReviewMemoryResult = {
  candidate: MemoryCandidate;
  memory?: MemoryItem;
};

export class MemoryReviewWorkflow {
  constructor(private readonly store: MemoryStore) {}

  async propose(input: ProposeMemoryInput): Promise<MemoryCandidate> {
    const candidate = createMemoryCandidate(input);
    this.requireEvidence(candidate);
    return this.store.createCandidate(candidate);
  }

  async review(input: ReviewMemoryInput): Promise<ReviewMemoryResult> {
    this.requireEvidence(input.candidate);
    const reviewed = reviewMemoryCandidate(input.candidate, {
      accepted: input.accepted,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt,
      reason: input.reason,
    });

    await this.store.createCandidate(reviewed);

    if (!input.accepted) {
      return { candidate: reviewed };
    }

    const memory = materializeMemoryItem(reviewed, {
      memoryId: input.memoryId ?? `memory_${reviewed.candidateId}`,
      acceptedBy: input.reviewedBy,
      createdAt: reviewed.reviewedAt,
      supersedesMemoryId: input.supersedesMemoryId,
    });

    return {
      candidate: reviewed,
      memory: await this.store.upsertMemory(memory),
    };
  }

  private requireEvidence(candidate: MemoryCandidate): void {
    if (!candidate.evidence.taskId || !candidate.evidence.artifactId) {
      throw new Error('Memory candidates require task and artifact evidence before review.');
    }
  }
}
