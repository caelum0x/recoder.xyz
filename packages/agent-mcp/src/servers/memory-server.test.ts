import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MemoryStore } from '@recoder/agent-memory';
import type { AgentProfile, MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import { McpRegistry } from '../registry';
import { McpToolRouter } from '../host/tool-router';
import { memoryMcpServer, registerMemoryMcpTools } from './memory-server';

function actor(): AgentProfile {
  return { agentId: 'agent_test', permissions: { toolRules: [] } } as unknown as AgentProfile;
}

/** Minimal real in-memory MemoryStore implementing the candidate lifecycle. */
class InMemoryMemoryStore implements MemoryStore {
  readonly candidates = new Map<string, MemoryCandidate>();
  readonly memories: MemoryItem[] = [];

  async createCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
    this.candidates.set(candidate.candidateId, candidate);
    return candidate;
  }
  async listCandidates(): Promise<MemoryCandidate[]> {
    return [...this.candidates.values()];
  }
  async upsertMemory(item: MemoryItem): Promise<MemoryItem> {
    this.memories.push(item);
    return item;
  }
  async search(query: string): Promise<MemoryItem[]> {
    return this.memories.filter((m) => m.title.includes(query) || m.body.includes(query));
  }
}

test('memory.candidate.create then memory.review materializes a real candidate via the workflow', async () => {
  const store = new InMemoryMemoryStore();
  const router = new McpToolRouter(new McpRegistry());
  registerMemoryMcpTools(router, store);

  const created = await router.call({
    server: memoryMcpServer,
    toolName: 'memory.candidate.create',
    actor: actor(),
    args: {
      candidateId: 'cand_1',
      scope: 'repo',
      title: 'Use the injected port',
      body: 'agent-mcp must stay runtime-agnostic.',
      evidence: { taskId: 'task_1', artifactId: 'art_1' },
    },
  });
  const candidate = created.content as MemoryCandidate;
  assert.equal(candidate.candidateId, 'cand_1');
  assert.equal(candidate.status, 'candidate_created');
  // Really persisted in the store, not a no-op.
  assert.ok(store.candidates.has('cand_1'));

  const reviewed = await router.call({
    server: memoryMcpServer,
    toolName: 'memory.review',
    actor: actor(),
    args: { candidateId: 'cand_1', accepted: true, memoryId: 'mem_1' },
  });
  const result = reviewed.content as { candidate: MemoryCandidate; memory?: MemoryItem };
  assert.ok(result.memory, 'an accepted candidate materializes a real memory item');
  assert.equal(result.memory?.memoryId, 'mem_1');
  assert.equal(store.memories.length, 1);
});
