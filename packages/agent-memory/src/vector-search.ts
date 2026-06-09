import type { MemoryItem } from '@recoder/agent-os';

export type MemorySearchHit = {
  item: MemoryItem;
  score: number;
};

export interface MemoryVectorSearch {
  embed(text: string): Promise<number[]>;
  search(vector: number[], options?: { scope?: string; limit?: number }): Promise<MemorySearchHit[]>;
}
