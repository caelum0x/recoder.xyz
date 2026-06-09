import type { MemoryItem } from '@recoder/agent-os';
import type { MemorySearchHit, MemoryVectorSearch } from '../vector-search';

export interface PgVectorClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class PostgresPgVectorMemorySearch implements MemoryVectorSearch {
  constructor(
    private readonly client: PgVectorClient,
    private readonly embedder: { embed(text: string): Promise<number[]> },
  ) {}

  embed(text: string): Promise<number[]> {
    return this.embedder.embed(text);
  }

  async search(vector: number[], options: { scope?: string; limit?: number } = {}): Promise<MemorySearchHit[]> {
    const result = await this.client.query<{ item: MemoryItem; score: number }>(
      'select item, score from memory_embeddings where ($1::text is null or scope = $1) order by embedding <=> $2 limit $3',
      [options.scope ?? null, JSON.stringify(vector), options.limit ?? 10],
    );
    return result.rows.map((row) => ({ item: row.item, score: row.score }));
  }
}
