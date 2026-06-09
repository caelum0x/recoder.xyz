import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';

export interface MemoryStore {
  createCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate>;
  listCandidates(scope?: string): Promise<MemoryCandidate[]>;
  upsertMemory(item: MemoryItem): Promise<MemoryItem>;
  search(query: string, options?: { scope?: string; limit?: number }): Promise<MemoryItem[]>;
}
