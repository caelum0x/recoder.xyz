import { randomUUID } from 'crypto';

import { createLogger } from '../logger';
import { loadA2AMemoryCandidates, saveA2AMemoryCandidates } from './a2a-persistence';
import { rememberEntry } from './memory-store';

const logger = createLogger('a2a-memory-candidates');

export type MemoryCandidateScope = 'space' | 'repo' | 'user' | 'org';
export type MemoryCandidateStatus = 'pending' | 'approved' | 'rejected';

export interface MemoryCandidate {
  candidateId: string;
  taskId: string;
  scope: MemoryCandidateScope;
  title: string;
  body: string;
  evidence: {
    taskId: string;
    artifactId?: string;
  };
  proposedBy: string;
  userId?: string;
  agentId?: string;
  status: MemoryCandidateStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewReason?: string;
  approvedMemoryId?: string;
}

export interface CreateMemoryCandidateInput {
  taskId: string;
  scope: MemoryCandidateScope;
  title: string;
  body: string;
  evidence: {
    taskId: string;
    artifactId?: string;
  };
  proposedBy: string;
  userId?: string;
  agentId?: string;
}

export class MemoryCandidateService {
  private readonly candidates: Map<string, MemoryCandidate>;

  constructor() {
    this.candidates = loadA2AMemoryCandidates<MemoryCandidate>();
  }

  createCandidate(input: CreateMemoryCandidateInput): MemoryCandidate {
    const now = new Date().toISOString();
    const candidate: MemoryCandidate = {
      candidateId: `memory_candidate_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      taskId: input.taskId,
      scope: input.scope,
      title: input.title,
      body: input.body,
      evidence: input.evidence,
      proposedBy: input.proposedBy,
      userId: input.userId,
      agentId: input.agentId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    this.candidates.set(candidate.candidateId, candidate);
    this.persist();
    return candidate;
  }

  get(candidateId: string): MemoryCandidate | undefined {
    return this.candidates.get(candidateId);
  }

  listByTask(taskId: string): MemoryCandidate[] {
    return [...this.candidates.values()]
      .filter((candidate) => candidate.taskId === taskId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async approve(candidateId: string, reviewedBy: string, reviewReason?: string): Promise<MemoryCandidate> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`Memory candidate not found: ${candidateId}`);
    }
    if (candidate.status !== 'pending') {
      throw new Error(`Memory candidate ${candidateId} is already ${candidate.status}`);
    }
    if (!candidate.userId) {
      throw new Error(`Memory candidate ${candidateId} is missing userId for persistence`);
    }

    const memory = await rememberEntry({
      content: candidate.body,
      type: 'fact',
      tags: [`scope:${candidate.scope}`, `title:${candidate.title}`],
      agentId: candidate.agentId || candidate.proposedBy,
      userId: candidate.userId,
    });

    const updated: MemoryCandidate = {
      ...candidate,
      status: 'approved',
      reviewedBy,
      reviewReason,
      approvedMemoryId: memory.id,
      updatedAt: new Date().toISOString(),
    };
    this.candidates.set(candidateId, updated);
    this.persist();
    return updated;
  }

  reject(candidateId: string, reviewedBy: string, reviewReason?: string): MemoryCandidate {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`Memory candidate not found: ${candidateId}`);
    }
    if (candidate.status !== 'pending') {
      throw new Error(`Memory candidate ${candidateId} is already ${candidate.status}`);
    }

    const updated: MemoryCandidate = {
      ...candidate,
      status: 'rejected',
      reviewedBy,
      reviewReason,
      updatedAt: new Date().toISOString(),
    };
    this.candidates.set(candidateId, updated);
    this.persist();
    return updated;
  }

  private persist(): void {
    saveA2AMemoryCandidates(this.candidates);
  }
}

let instance: MemoryCandidateService | null = null;

export function getMemoryCandidateService(): MemoryCandidateService {
  if (!instance) {
    instance = new MemoryCandidateService();
  }
  return instance;
}

export function resetMemoryCandidateService(): void {
  instance = null;
}
