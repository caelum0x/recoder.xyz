import type { MemoryItem } from '@recoder/agent-os';

export interface Mem0LikeClient {
  search(query: string, options?: Record<string, unknown>): Promise<Array<{ memory: string; score?: number; metadata?: Record<string, unknown> }>>;
}

export class Mem0MemoryAdapter {
  constructor(private readonly client: Mem0LikeClient) {}

  async search(query: string, options?: Record<string, unknown>): Promise<Array<Pick<MemoryItem, 'title' | 'body'> & { score?: number }>> {
    const results = await this.client.search(query, options);
    return results.map((result) => ({
      title: String(result.metadata?.title ?? 'mem0 memory'),
      body: result.memory,
      score: result.score,
    }));
  }
}
