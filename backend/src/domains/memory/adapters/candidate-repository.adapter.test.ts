/**
 * candidate-repository.adapter tenant-isolation tests — the candidate reads MUST
 * constrain by owner (`proposedBy`). The GLOBAL agent-os store is unscoped, so a
 * cross-tenant read is an IDOR unless the adapter filters by the caller's userId.
 *
 * Bypass posture (mirrors space-authz): an `internal`/`admin` operator or the
 * desktop solo plane (`soloMode`) sees every tenant; everyone else sees only
 * their own `proposedBy` rows.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { MemoryCandidateItemStore } from '../ports/memory-repository.port.js';
import { createMemoryRepository } from './candidate-repository.adapter.js';

/** Relations are never touched by candidate reads — an unavailable pool is fine. */
const idleQuery: QueryExecutor = {
  async execute() {
    return [];
  },
  async one() {
    return null;
  },
  async read() {
    return [];
  },
  async mutate() {
    return 0;
  },
  async withTransaction(fn) {
    return fn(idleQuery);
  },
  isAvailable() {
    return false;
  },
} as unknown as QueryExecutor;

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    candidateId: 'c1',
    scope: 'repo',
    title: 'fact',
    body: 'body',
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy: 'userA',
    proposedAt: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

/** An unscoped agent-os store slice holding every tenant's rows (the GLOBAL store). */
function fakeStore(candidates: MemoryCandidate[]): MemoryCandidateItemStore {
  return {
    listMemoryItems(): MemoryItem[] {
      return [];
    },
    upsertMemoryItem(m: MemoryItem): MemoryItem {
      return m;
    },
    listMemoryCandidates(): MemoryCandidate[] {
      return candidates;
    },
    upsertMemoryCandidate(c: MemoryCandidate): MemoryCandidate {
      return c;
    },
  };
}

function repoWith(candidates: MemoryCandidate[]) {
  return createMemoryRepository({ query: idleQuery, store: fakeStore(candidates) });
}

describe('candidate-repository.adapter getCandidate — tenant isolation (IDOR #1)', () => {
  it('returns the candidate to its owner', async () => {
    const repo = repoWith([candidate({ candidateId: 'c1', proposedBy: 'userA' })]);
    const got = await repo.getCandidate('userA', 'c1');
    expect(got?.candidateId).toBe('c1');
  });

  it('returns null when another tenant reads it (no cross-tenant read)', async () => {
    const repo = repoWith([candidate({ candidateId: 'c1', proposedBy: 'userA' })]);
    const got = await repo.getCandidate('userB', 'c1');
    expect(got).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    const repo = repoWith([candidate({ candidateId: 'c1', proposedBy: 'userA' })]);
    expect(await repo.getCandidate('userA', 'nope')).toBeNull();
  });

  it('lets an admin/internal operator read any tenant (privileged bypass)', async () => {
    const repo = repoWith([candidate({ candidateId: 'c1', proposedBy: 'userA' })]);
    const got = await repo.getCandidate('operator', 'c1', { privileged: true });
    expect(got?.candidateId).toBe('c1');
  });

  it('fails open for the desktop solo plane (soloMode)', async () => {
    const repo = repoWith([candidate({ candidateId: 'c1', proposedBy: 'userA' })]);
    const got = await repo.getCandidate('solo-user', 'c1', { soloMode: true });
    expect(got?.candidateId).toBe('c1');
  });
});

describe('candidate-repository.adapter listCandidates — tenant isolation (IDOR #2)', () => {
  const rows = [
    candidate({ candidateId: 'a1', proposedBy: 'userA', scope: 'repo' }),
    candidate({ candidateId: 'a2', proposedBy: 'userA', scope: 'user' }),
    candidate({ candidateId: 'b1', proposedBy: 'userB', scope: 'repo' }),
  ];

  it('returns only the caller-owned candidates (never other tenants)', async () => {
    const repo = repoWith(rows);
    const list = await repo.listCandidates('userA');
    expect(list.map((c) => c.candidateId).sort()).toEqual(['a1', 'a2']);
  });

  it('applies both the owner filter AND the scope filter', async () => {
    const repo = repoWith(rows);
    const list = await repo.listCandidates('userA', 'repo');
    expect(list.map((c) => c.candidateId)).toEqual(['a1']);
  });

  it('returns nothing for a tenant that owns no candidates', async () => {
    const repo = repoWith(rows);
    expect(await repo.listCandidates('userC')).toEqual([]);
  });

  it('returns every tenant to a privileged operator', async () => {
    const repo = repoWith(rows);
    const list = await repo.listCandidates('operator', undefined, { privileged: true });
    expect(list.map((c) => c.candidateId).sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('returns every tenant under solo mode (fail-open)', async () => {
    const repo = repoWith(rows);
    const list = await repo.listCandidates('solo-user', undefined, { soloMode: true });
    expect(list).toHaveLength(3);
  });
});
