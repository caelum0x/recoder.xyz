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
import { getMemoryModule } from '../../modules/memory';

export function createRepositoryMemoryStore(repository: AgentOsRepository): MemoryStore {
  const store: MemoryStore = {
    async createCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
      const stored = await repository.upsertMemoryCandidate(candidate);
      // Mirror into the SHARED memory layer THROUGH the MemoryModule (beads wisp;
      // mem0 when user-scoped) so every future agent launch recalls it. The
      // repository remains the store-of-record; the mirror is best-effort and
      // degrade-safe (all engines down → repository copy untouched, nothing
      // faked, nothing thrown).
      try {
        await getMemoryModule().remember({
          title: `[memory] ${stored.title}`,
          body: [stored.body, `Candidate: ${stored.candidateId} · scope: ${stored.scope}`].join('\n'),
          scope: stored.scope,
          evidence: { taskId: stored.evidence?.taskId, artifactId: stored.evidence?.artifactId },
        });
      } catch {
        // Mirror is best-effort; the repository copy above is authoritative.
      }
      return stored;
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

  // Register the store-of-record with the module so fused recall can include
  // reviewed agent-os items and `asMemoryStore()` returns this same port.
  getMemoryModule().attachAgentOsStore(store);
  return store;
}
