import type { MemoryCandidate } from '@recoder/agent-os';

export function createMemoryCandidate(input: {
  candidateId: string;
  scope: MemoryCandidate['scope'];
  title: string;
  body: string;
  evidence: MemoryCandidate['evidence'];
  proposedBy: string;
  proposedAt?: string;
  expiresAt?: string | null;
}): MemoryCandidate {
  if (!input.title.trim() || !input.body.trim()) {
    throw new Error('Memory candidate requires title and body');
  }
  return {
    candidateId: input.candidateId,
    scope: input.scope,
    title: input.title.trim(),
    body: input.body.trim(),
    status: 'candidate_created',
    evidence: input.evidence,
    proposedBy: input.proposedBy,
    proposedAt: input.proposedAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
  };
}
