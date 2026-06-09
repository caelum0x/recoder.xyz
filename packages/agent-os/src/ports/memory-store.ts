import type { MemoryCandidate, MemoryItem } from '../domain';

export interface MemoryStorePort {
  propose(candidate: MemoryCandidate): Promise<MemoryCandidate>;
  getCandidate(candidateId: string): Promise<MemoryCandidate | null>;
  accept(candidateId: string, reviewer: string, now?: string): Promise<MemoryItem>;
  reject(candidateId: string, reviewer: string, reason: string, now?: string): Promise<MemoryCandidate>;
  search(scope: string, query: string, limit?: number): Promise<MemoryItem[]>;
}
