/**
 * lifecycle service tests — candidate evidence enforcement, harvest skip/degrade,
 * and relation kind/self-edge validation.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate } from '@recoder/agent-os';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { BeadsRememberInput, IssueGraphService } from '../ports/issue-graph.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import type { MemoryRelation } from '../types.js';
import { createCandidateService } from './candidate-service.js';
import { createHarvestService } from './harvest.js';
import { createRelateService } from './relate.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } } as never;

const beadsDown: IssueGraphService = fakeIssueGraph();

/** A live fake issue-graph facet that issues a bd id and records remember calls. */
function beadsUp(bdId: string): {
  port: IssueGraphService;
  remembered: { input: BeadsRememberInput; actor: string }[];
} {
  const remembered: { input: BeadsRememberInput; actor: string }[] = [];
  const port = fakeIssueGraph({
    health: async () => ({ available: true }),
    remember: async (input, actor) => {
      remembered.push({ input, actor });
      return bdId;
    },
    promote: async () => true,
  });
  return { port, remembered };
}

function repoWithCapture(): { repo: MemoryRepository; stored: MemoryCandidate[]; relations: MemoryRelation[] } {
  const stored: MemoryCandidate[] = [];
  const relations: MemoryRelation[] = [];
  const repo: MemoryRepository = {
    async listItems() {
      return [];
    },
    async getItem() {
      return null;
    },
    async upsertItem(_u, i) {
      return i;
    },
    async listCandidates() {
      return stored;
    },
    async getCandidate() {
      return null;
    },
    async upsertCandidate(_u, c) {
      stored.push(c);
      return c;
    },
    async addRelation(input) {
      const relation: MemoryRelation = {
        relationId: `rel_${relations.length + 1}`,
        userId: input.userId,
        fromMemoryId: input.fromMemoryId,
        toMemoryId: input.toMemoryId,
        kind: input.kind,
        createdAt: '2026-07-15T00:00:00Z',
      };
      relations.push(relation);
      return relation;
    },
    async listRelations() {
      return relations;
    },
    async deleteRelation() {
      return true;
    },
  };
  return { repo, stored, relations };
}

describe('candidate-service.propose', () => {
  it('stores an evidenced candidate with status candidate_created', async () => {
    const { repo, stored } = repoWithCapture();
    const svc = createCandidateService({ repository: repo, beads: beadsDown, logger: silentLogger, now: () => 't', newId: () => 'mc_1' });
    const candidate = await svc.propose({
      userId: 'u1',
      scope: 'repo',
      title: 'fact',
      body: 'body',
      proposedBy: 'agent:1',
      evidence: { taskId: 't1', artifactId: 'a1' },
    });
    expect(candidate.candidateId).toBe('mc_1');
    expect(candidate.status).toBe('candidate_created');
    expect(stored).toHaveLength(1);
  });

  it('persists the bd-issued wisp id as beadsRef (the promote handle)', async () => {
    const { repo, stored } = repoWithCapture();
    const beads = beadsUp('bd-42');
    const svc = createCandidateService({ repository: repo, beads: beads.port, logger: silentLogger, newId: () => 'mc_1' });
    const candidate = await svc.propose({
      userId: 'u1',
      scope: 'repo',
      title: 'fact',
      body: 'body',
      proposedBy: 'agent:1',
      evidence: { taskId: 't1', artifactId: 'a1' },
    });
    // The bd id (NOT the local mc_ id) is what memory-lifecycle.accept promotes.
    expect(candidate.beadsRef).toBe('bd-42');
    expect(stored[0]?.beadsRef).toBe('bd-42');
    expect(beads.remembered).toHaveLength(1);
    expect(beads.remembered[0]?.input.title).toBe('fact');
    // The proposer is threaded as the bd audit-trail actor.
    expect(beads.remembered[0]?.actor).toBe('agent:1');
  });

  it('stores the candidate WITHOUT beadsRef when bd is down (truthful degrade)', async () => {
    const { repo, stored } = repoWithCapture();
    const svc = createCandidateService({ repository: repo, beads: beadsDown, logger: silentLogger, newId: () => 'mc_1' });
    const candidate = await svc.propose({
      userId: 'u1',
      scope: 'repo',
      title: 'fact',
      body: 'body',
      proposedBy: 'agent:1',
      evidence: { taskId: 't1', artifactId: 'a1' },
    });
    expect(candidate.beadsRef).toBeUndefined();
    expect(stored).toHaveLength(1);
  });

  it('still stores the candidate when beads.remember throws (mirror is best-effort)', async () => {
    const { repo, stored } = repoWithCapture();
    const throwingBeads: IssueGraphService = fakeIssueGraph({
      health: async () => ({ available: true }),
      remember: async () => {
        throw new Error('bd exploded');
      },
    });
    const svc = createCandidateService({ repository: repo, beads: throwingBeads, logger: silentLogger, newId: () => 'mc_1' });
    const candidate = await svc.propose({
      userId: 'u1',
      scope: 'repo',
      title: 'fact',
      body: 'body',
      proposedBy: 'agent:1',
      evidence: { taskId: 't1', artifactId: 'a1' },
    });
    expect(candidate.beadsRef).toBeUndefined();
    expect(stored).toHaveLength(1);
  });

  it('rejects an unevidenced proposal (noise guard)', async () => {
    const { repo } = repoWithCapture();
    const svc = createCandidateService({ repository: repo, beads: beadsDown, logger: silentLogger });
    await expect(
      svc.propose({ userId: 'u1', scope: 'repo', title: 't', body: 'b', proposedBy: 'a', evidence: { taskId: '', artifactId: '' } }),
    ).rejects.toThrow(/evidence/i);
  });
});

describe('harvest-service.harvest', () => {
  it('skips truthfully when evidence is missing (does not throw)', async () => {
    const { repo } = repoWithCapture();
    const candidates = createCandidateService({ repository: repo, beads: beadsDown, logger: silentLogger });
    const svc = createHarvestService({ candidates, logger: silentLogger });
    const result = await svc.harvest({ userId: 'u1', scope: 'repo', title: 't', body: 'b', proposedBy: 'a', taskId: '', artifactId: '' });
    expect(result.harvested).toBe(false);
    if (!result.harvested) expect(result.reason).toMatch(/evidence/i);
  });

  it('harvests an evidenced fact into a candidate', async () => {
    const { repo, stored } = repoWithCapture();
    const candidates = createCandidateService({ repository: repo, beads: beadsDown, logger: silentLogger, newId: () => 'mc_h' });
    const svc = createHarvestService({ candidates, logger: silentLogger });
    const result = await svc.harvest({ userId: 'u1', scope: 'repo', title: 'learned', body: 'a gotcha', proposedBy: 'agent', taskId: 't1', artifactId: 'a1' });
    expect(result.harvested).toBe(true);
    expect(stored).toHaveLength(1);
  });
});

describe('relate-service.relate', () => {
  it('records a valid edge', async () => {
    const { repo, relations } = repoWithCapture();
    const svc = createRelateService({ repository: repo });
    const edge = await svc.relate({ userId: 'u1', fromMemoryId: 'a', toMemoryId: 'b', kind: 'supersedes' });
    expect(edge.kind).toBe('supersedes');
    expect(relations).toHaveLength(1);
  });

  it('rejects an unknown kind', async () => {
    const { repo } = repoWithCapture();
    const svc = createRelateService({ repository: repo });
    await expect(svc.relate({ userId: 'u1', fromMemoryId: 'a', toMemoryId: 'b', kind: 'bogus' })).rejects.toThrow(/kind/i);
  });

  it('rejects a self-edge', async () => {
    const { repo } = repoWithCapture();
    const svc = createRelateService({ repository: repo });
    await expect(svc.relate({ userId: 'u1', fromMemoryId: 'a', toMemoryId: 'a', kind: 'relates-to' })).rejects.toThrow(/itself/i);
  });
});
