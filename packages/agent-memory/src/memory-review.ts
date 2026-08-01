import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';

export function reviewMemoryCandidate(
  candidate: MemoryCandidate,
  input: { accepted: boolean; reviewedBy: string; reviewedAt?: string; reason?: string },
): MemoryCandidate {
  if (candidate.status !== 'candidate_created') {
    throw new Error(`Memory candidate is not reviewable: ${candidate.candidateId}`);
  }
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  if (candidate.expiresAt != null && candidate.expiresAt <= reviewedAt) {
    throw new Error(`Memory candidate is expired: ${candidate.candidateId}`);
  }
  return {
    ...candidate,
    status: input.accepted ? 'accepted' : 'rejected',
    reviewedBy: input.reviewedBy,
    reviewedAt,
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
  const createdAt = input.createdAt ?? candidate.reviewedAt ?? new Date().toISOString();
  if (candidate.expiresAt != null && candidate.expiresAt <= createdAt) {
    throw new Error(`Cannot materialize expired memory candidate: ${candidate.candidateId}`);
  }
  return {
    memoryId: input.memoryId,
    scope: candidate.scope,
    title: candidate.title,
    body: candidate.body,
    status: 'active',
    evidence: candidate.evidence,
    createdAt,
    acceptedBy: input.acceptedBy,
    expiresAt: candidate.expiresAt ?? null,
    supersedesMemoryId: input.supersedesMemoryId,
  };
}
