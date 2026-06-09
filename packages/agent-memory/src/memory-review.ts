import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';

export function reviewMemoryCandidate(
  candidate: MemoryCandidate,
  input: { accepted: boolean; reviewedBy: string; reviewedAt?: string; reason?: string },
): MemoryCandidate {
  if (candidate.status !== 'candidate_created') {
    throw new Error(`Memory candidate is not reviewable: ${candidate.candidateId}`);
  }
  return {
    ...candidate,
    status: input.accepted ? 'accepted' : 'rejected',
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
    reviewReason: input.reason,
  };
}

export function materializeMemoryItem(
  candidate: MemoryCandidate,
  input: { memoryId: string; acceptedBy: string; createdAt?: string; supersedesMemoryId?: string },
): MemoryItem {
  if (candidate.status !== 'accepted') {
    throw new Error(`Cannot materialize unaccepted memory candidate: ${candidate.candidateId}`);
  }
  return {
    memoryId: input.memoryId,
    scope: candidate.scope,
    title: candidate.title,
    body: candidate.body,
    status: 'active',
    evidence: candidate.evidence,
    createdAt: input.createdAt ?? candidate.reviewedAt ?? new Date().toISOString(),
    acceptedBy: input.acceptedBy,
    expiresAt: candidate.expiresAt ?? null,
    supersedesMemoryId: input.supersedesMemoryId,
  };
}
