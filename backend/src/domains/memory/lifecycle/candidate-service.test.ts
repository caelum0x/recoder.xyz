/**
 * lifecycle/candidate-service tests — the PROPOSE half of the reviewed-candidate
 * lifecycle. Locks the invariants that keep the wisp store trustworthy:
 *
 *  - EVIDENCE INVARIANT: "an unevidenced memory is noise" — a proposal with no
 *    { taskId, artifactId } (or empty title/body) is rejected FAST and is NEVER
 *    stored or mirrored (no silent write).
 *  - WISP EPHEMERALITY / TTL: a candidate is shaped as `candidate_created` (never
 *    durable) and carries its optional TTL `expiresAt` through untouched.
 *  - BEADS MIRROR IS BEST-EFFORT: a bd-down environment (remember → undefined or
 *    throws) does NOT fail the proposal; the candidate is stored without a
 *    `beadsRef`. The bd-issued id (when present) is captured onto the candidate.
 *  - ALLOWLIST FAIL-CLOSED: a non-empty governance allowlist denies an off-list
 *    scope with `AUTHZ_PROJECT_ACCESS_DENIED`, BEFORE any mirror or store write.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate } from '@recoder/agent-os';
import type { MemoryRepository, MemoryReadAuthz } from '../ports/memory-repository.port.js';
import type { IssueGraphService, BeadsRememberInput } from '../ports/issue-graph.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import { createMemoryWriteAllowlist } from './write-allowlist.js';
import {
  createCandidateService,
  type ProposeCandidateInput,
} from './candidate-service.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() {
    return silentLogger;
  },
} as never;

/** A repository fake that records every candidate write + the read args. */
function fakeRepo(seed: MemoryCandidate[] = []): {
  repo: MemoryRepository;
  candidates: MemoryCandidate[];
  listArgs: { userId: string; scope?: string; authz?: MemoryReadAuthz }[];
  getArgs: { userId: string; candidateId: string; authz?: MemoryReadAuthz }[];
} {
  const candidates: MemoryCandidate[] = [...seed];
  const listArgs: { userId: string; scope?: string; authz?: MemoryReadAuthz }[] = [];
  const getArgs: { userId: string; candidateId: string; authz?: MemoryReadAuthz }[] = [];
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
    async listCandidates(userId, scope, authz) {
      listArgs.push({ userId, scope, authz });
      return candidates;
    },
    async getCandidate(userId, candidateId, authz) {
      getArgs.push({ userId, candidateId, authz });
      return candidates.find((c) => c.candidateId === candidateId) ?? null;
    },
    async upsertCandidate(_u, c) {
      const idx = candidates.findIndex((x) => x.candidateId === c.candidateId);
      if (idx >= 0) candidates[idx] = c;
      else candidates.push(c);
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
  return { repo, candidates, listArgs, getArgs };
}

/** A live beads fake that records remember() calls and returns a fixed wisp id. */
function beadsUp(id: string | undefined = 'bd-99'): {
  port: IssueGraphService;
  remembered: { input: BeadsRememberInput; actor: string }[];
} {
  const remembered: { input: BeadsRememberInput; actor: string }[] = [];
  const port = fakeIssueGraph({
    health: async () => ({ available: true }),
    remember: async (input, actor) => {
      remembered.push({ input, actor });
      return id;
    },
  });
  return { port, remembered };
}

/** A beads fake whose remember() throws (bd down mid-mirror). */
function beadsThrows(): { port: IssueGraphService; calls: number } {
  const state = { calls: 0 };
  const port = fakeIssueGraph({
    health: async () => ({ available: true }),
    remember: async () => {
      state.calls += 1;
      throw new Error('bd exploded');
    },
  });
  return {
    port,
    get calls() {
      return state.calls;
    },
  };
}

function proposeInput(overrides: Partial<ProposeCandidateInput> = {}): ProposeCandidateInput {
  return {
    userId: 'u1',
    scope: 'repo',
    title: '  the box is 16GB  ',
    body: '  no GPU, 94% disk  ',
    proposedBy: 'agent:1',
    evidence: { taskId: 't1', artifactId: 'a1' },
    ...overrides,
  };
}

describe('createCandidateService.propose — evidence invariant (unevidenced = noise)', () => {
  it('rejects a proposal with a missing artifactId and NEVER stores or mirrors it', async () => {
    const { repo, candidates } = fakeRepo();
    const beads = beadsUp();
    const svc = createCandidateService({ repository: repo, beads: beads.port, logger: silentLogger });

    await expect(
      svc.propose(proposeInput({ evidence: { taskId: 't1', artifactId: '' } })),
    ).rejects.toThrow(/evidence/i);
    // No silent write, no bd mirror side effect.
    expect(candidates).toHaveLength(0);
    expect(beads.remembered).toHaveLength(0);
  });

  it('rejects a proposal whose evidence ids are whitespace-only', async () => {
    const { repo, candidates } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    await expect(
      svc.propose(proposeInput({ evidence: { taskId: '   ', artifactId: '  ' } })),
    ).rejects.toThrow(/evidence/i);
    expect(candidates).toHaveLength(0);
  });

  it('surfaces MISSING_REQUIRED_FIELD as the AppError code for a missing taskId', async () => {
    const { repo } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    await expect(
      svc.propose(proposeInput({ evidence: { taskId: '', artifactId: 'a1' } })),
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_FIELD' });
  });

  it('rejects a proposal with an empty title or body (evidence alone is not enough)', async () => {
    const { repo, candidates } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    await expect(svc.propose(proposeInput({ title: '   ' }))).rejects.toThrow(/title and body/i);
    await expect(svc.propose(proposeInput({ body: '' }))).rejects.toThrow(/title and body/i);
    expect(candidates).toHaveLength(0);
  });
});

describe('createCandidateService.propose — wisp shaping, ephemerality + TTL', () => {
  it('shapes an EPHEMERAL candidate (status candidate_created, trimmed, evidence + provenance preserved)', async () => {
    const { repo, candidates } = fakeRepo();
    const beads = beadsUp('bd-99');
    const svc = createCandidateService({
      repository: repo,
      beads: beads.port,
      logger: silentLogger,
      now: () => '2026-08-01T00:00:00Z',
      newId: () => 'mc_fixed',
    });

    const result = await svc.propose(proposeInput());

    // A wisp is a proposal, never durable.
    expect(result.status).toBe('candidate_created');
    expect(result.candidateId).toBe('mc_fixed');
    // Title/body are trimmed before storage + mirror.
    expect(result.title).toBe('the box is 16GB');
    expect(result.body).toBe('no GPU, 94% disk');
    expect(result.evidence).toEqual({ taskId: 't1', artifactId: 'a1' });
    expect(result.proposedBy).toBe('agent:1');
    expect(result.proposedAt).toBe('2026-08-01T00:00:00Z');
    // Stored in the candidate store-of-record.
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.candidateId).toBe('mc_fixed');
  });

  it('carries the TTL expiresAt through untouched (wisps are TTL-bound)', async () => {
    const { repo } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    const result = await svc.propose(proposeInput({ expiresAt: '2026-09-01T00:00:00Z' }));
    expect(result.expiresAt).toBe('2026-09-01T00:00:00Z');
  });

  it('omits expiresAt entirely when the caller provides none (no fabricated TTL)', async () => {
    const { repo } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    const result = await svc.propose(proposeInput());
    expect('expiresAt' in result).toBe(false);
  });
});

describe('createCandidateService.propose — beads mirror is best-effort', () => {
  it('captures the bd-issued wisp id as beadsRef and passes scope + actor + discoveredFrom', async () => {
    const { repo } = fakeRepo();
    const beads = beadsUp('bd-77');
    const svc = createCandidateService({ repository: repo, beads: beads.port, logger: silentLogger });

    const result = await svc.propose(proposeInput({ discoveredFrom: 'recoder-abc', scope: 'repo' }));

    // The bd id is the ONLY id `bd promote` accepts later — it must be persisted.
    expect(result.beadsRef).toBe('bd-77');
    expect(beads.remembered).toHaveLength(1);
    expect(beads.remembered[0]?.actor).toBe('agent:1');
    expect(beads.remembered[0]?.input.scope).toBe('repo');
    expect(beads.remembered[0]?.input.discoveredFrom).toBe('recoder-abc');
    // The mirror receives the TRIMMED title/body.
    expect(beads.remembered[0]?.input.title).toBe('the box is 16GB');
  });

  it('stores the candidate WITHOUT a beadsRef when bd is down (remember → undefined)', async () => {
    const { repo, candidates } = fakeRepo();
    // bd-down facet: remember resolves undefined (no wisp id issued).
    const bdDown = fakeIssueGraph({ remember: async () => undefined });
    const svc = createCandidateService({ repository: repo, beads: bdDown, logger: silentLogger });

    const result = await svc.propose(proposeInput());

    expect('beadsRef' in result).toBe(false);
    expect(candidates).toHaveLength(1); // durable store write still happened
  });

  it('does NOT fail the proposal when the beads mirror THROWS (degrade-truthful)', async () => {
    const { repo, candidates } = fakeRepo();
    const beads = beadsThrows();
    const svc = createCandidateService({ repository: repo, beads: beads.port, logger: silentLogger });

    const result = await svc.propose(proposeInput());

    expect(beads.calls).toBe(1);
    expect(result.status).toBe('candidate_created');
    expect('beadsRef' in result).toBe(false);
    // The store-of-record write is what matters; it still happened.
    expect(candidates).toHaveLength(1);
  });
});

describe('createCandidateService.propose — governance allowlist (fail-closed)', () => {
  it('DENIES an off-list scope with AUTHZ_PROJECT_ACCESS_DENIED before any mirror or store write', async () => {
    const { repo, candidates } = fakeRepo();
    const beads = beadsUp();
    const allowlist = createMemoryWriteAllowlist({ scopes: ['repo'] });
    const svc = createCandidateService({
      repository: repo,
      beads: beads.port,
      logger: silentLogger,
      allowlist,
    });

    await expect(svc.propose(proposeInput({ scope: 'global' }))).rejects.toMatchObject({
      code: 'AUTHZ_PROJECT_ACCESS_DENIED',
    });
    // Fail-closed BEFORE side effects: nothing mirrored, nothing stored.
    expect(beads.remembered).toHaveLength(0);
    expect(candidates).toHaveLength(0);
  });

  it('ADMITS an on-list scope through the same allowlist', async () => {
    const { repo, candidates } = fakeRepo();
    const allowlist = createMemoryWriteAllowlist({ scopes: ['repo', 'global'] });
    const svc = createCandidateService({
      repository: repo,
      beads: fakeIssueGraph(),
      logger: silentLogger,
      allowlist,
    });
    const result = await svc.propose(proposeInput({ scope: 'global' }));
    expect(result.status).toBe('candidate_created');
    expect(candidates).toHaveLength(1);
  });

  it('an EMPTY allowlist restricts nothing (open, degrade-safe default)', async () => {
    const { repo, candidates } = fakeRepo();
    const allowlist = createMemoryWriteAllowlist({ scopes: [] });
    const svc = createCandidateService({
      repository: repo,
      beads: fakeIssueGraph(),
      logger: silentLogger,
      allowlist,
    });
    const result = await svc.propose(proposeInput({ scope: 'agent' }));
    expect(result.status).toBe('candidate_created');
    expect(candidates).toHaveLength(1);
  });
});

describe('createCandidateService.list / get — tenant-scoped delegation', () => {
  it('threads userId, scope, and authz to the repository on list', async () => {
    const { repo, listArgs } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    const authz: MemoryReadAuthz = { privileged: true };
    await svc.list('u1', 'repo', authz);
    expect(listArgs).toEqual([{ userId: 'u1', scope: 'repo', authz }]);
  });

  it('returns null for a candidate the tenant does not own (repository decides)', async () => {
    const { repo, getArgs } = fakeRepo();
    const svc = createCandidateService({ repository: repo, beads: fakeIssueGraph(), logger: silentLogger });
    const got = await svc.get('u1', 'does-not-exist');
    expect(got).toBeNull();
    expect(getArgs).toEqual([{ userId: 'u1', candidateId: 'does-not-exist', authz: undefined }]);
  });
});
