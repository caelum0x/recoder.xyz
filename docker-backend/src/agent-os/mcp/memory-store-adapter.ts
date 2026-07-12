/**
 * RepositoryMemoryStore — adapts the Agent OS repository to the
 * @recoder/agent-memory MemoryStore port, so the memory MCP tools an AGENT
 * calls (memory.search / memory.candidate.create / memory.review) persist
 * through the SAME canonical store-of-record as the rest of the control plane.
 *
 * Reviewed-memory model (repo rule): agents PROPOSE memory candidates with
 * evidence (taskId + artifactId); durable memory is only written after review.
 * memory.search reads the accepted durable items. Never fabricates a result.
 */
import type { MemoryStore } from '@recoder/agent-memory';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { AgentOsRepository } from '../repositories/agent-os.repository';

export function createRepositoryMemoryStore(repository: AgentOsRepository): MemoryStore {
  return {
    async createCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
      return repository.upsertMemoryCandidate(candidate);
    },
    async listCandidates(scope?: string): Promise<MemoryCandidate[]> {
      const all = await repository.listMemoryCandidates();
      return scope ? all.filter((c) => c.scope === scope) : all;
    },
    async upsertMemory(item: MemoryItem): Promise<MemoryItem> {
      return repository.upsertMemoryItem(item);
    },
    async search(query: string, options?: { scope?: string; limit?: number }): Promise<MemoryItem[]> {
      const items = await repository.listMemoryItems();
      const scoped = options?.scope ? items.filter((i) => i.scope === options.scope) : items;
      const needle = query.trim().toLowerCase();
      const matched = needle
        ? scoped.filter(
            (i) => i.title.toLowerCase().includes(needle) || i.body.toLowerCase().includes(needle),
          )
        : scoped;
      return typeof options?.limit === 'number' ? matched.slice(0, options.limit) : matched;
    },
  };
}
