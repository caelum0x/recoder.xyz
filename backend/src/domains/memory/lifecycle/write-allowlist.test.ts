/**
 * lifecycle/write-allowlist tests — the deterministic governance scope filter on
 * memory writes. Empty allowlist = allow-all (degrade-safe); a non-empty list
 * denies any scope not on it, both as a structured decision AND as a fail-closed
 * `AUTHZ_PROJECT_ACCESS_DENIED` throw. The candidate service enforces it on propose.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate } from '@recoder/agent-os';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { BeadsMemoryPort } from '../ports/beads-memory.port.js';
import { createMemoryWriteAllowlist } from './write-allowlist.js';
import { createCandidateService } from './candidate-service.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } } as never;

const beadsDown: BeadsMemoryPort = {
  available: () => false,
  remember: () => undefined,
  recall: () => [],
  promote: () => false,
  note: () => false,
};

function repoWithCapture(): { repo: MemoryRepository; stored: MemoryCandidate[] } {
  const stored: MemoryCandidate[] = [];
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
    async addRelation() {
      throw new Error('unused');
    },
    async listRelations() {
      return [];
    },
    async deleteRelation() {
      return false;
    },
  };
  return { repo, stored };
}

describe('createMemoryWriteAllowlist', () => {
  it('allows every scope when the allowlist is empty (degrade-safe default)', () => {
    const allowlist = createMemoryWriteAllowlist({ scopes: [] });
    expect(allowlist.check({ scope: 'repo', proposedBy: 'a' }).allowed).toBe(true);
    expect(allowlist.check({ scope: 'org', proposedBy: 'a' }).allowed).toBe(true);
    expect(() => allowlist.assert({ scope: 'anything', proposedBy: 'a' })).not.toThrow();
  });

  it('allows a listed scope and denies an unlisted one with a truthful reason', () => {
    const allowlist = createMemoryWriteAllowlist({ scopes: ['repo', 'task-type'] });
    expect(allowlist.check({ scope: 'repo', proposedBy: 'a' }).allowed).toBe(true);
    const denied = allowlist.check({ scope: 'org', proposedBy: 'a' });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/not on the governance allowlist/i);
  });

  it('assert throws AUTHZ_PROJECT_ACCESS_DENIED (403) on a deny', () => {
    const allowlist = createMemoryWriteAllowlist({ scopes: ['repo'] });
    try {
      allowlist.assert({ scope: 'org', proposedBy: 'a' });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
    }
  });

  it('trims + de-duplicates configured scopes', () => {
    const allowlist = createMemoryWriteAllowlist({ scopes: [' repo ', 'repo', '', '  '] });
    expect(allowlist.scopes).toEqual(['repo']);
  });
});

describe('candidate-service enforces the write allowlist', () => {
  it('stores a candidate whose scope is on the allowlist', async () => {
    const { repo, stored } = repoWithCapture();
    const allowlist = createMemoryWriteAllowlist({ scopes: ['repo'] });
    const svc = createCandidateService({ repository: repo, beads: beadsDown, allowlist, logger: silentLogger, newId: () => 'mc_1' });
    const candidate = await svc.propose({
      userId: 'u1',
      scope: 'repo',
      title: 'fact',
      body: 'body',
      proposedBy: 'agent:1',
      evidence: { taskId: 't1', artifactId: 'a1' },
    });
    expect(candidate.scope).toBe('repo');
    expect(stored).toHaveLength(1);
  });

  it('denies a candidate whose scope is NOT on the allowlist (nothing stored)', async () => {
    const { repo, stored } = repoWithCapture();
    const allowlist = createMemoryWriteAllowlist({ scopes: ['repo'] });
    const svc = createCandidateService({ repository: repo, beads: beadsDown, allowlist, logger: silentLogger });
    await expect(
      svc.propose({
        userId: 'u1',
        scope: 'org',
        title: 'fact',
        body: 'body',
        proposedBy: 'agent:1',
        evidence: { taskId: 't1', artifactId: 'a1' },
      }),
    ).rejects.toThrow(/allowlist/i);
    // Fail-closed BEFORE any store write.
    expect(stored).toHaveLength(0);
  });

  it('applies no restriction when no allowlist is injected (back-compat)', async () => {
    const { repo, stored } = repoWithCapture();
    const svc = createCandidateService({ repository: repo, beads: beadsDown, logger: silentLogger, newId: () => 'mc_1' });
    await svc.propose({
      userId: 'u1',
      scope: 'org',
      title: 'fact',
      body: 'body',
      proposedBy: 'agent:1',
      evidence: { taskId: 't1', artifactId: 'a1' },
    });
    expect(stored).toHaveLength(1);
  });
});
