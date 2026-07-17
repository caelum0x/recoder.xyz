/**
 * Memory MCP tools — contract tests for the gated agent surface.
 *
 * Focus on the two new WRITE tools (GAP-AUDIT Wave 8):
 *  - `memory_promote` — GATED: an allow verdict promotes; a non-allow verdict
 *    returns a truthful `{ promoted:false, verdict }` and never a fabricated item.
 *  - `memory_relate`  — records an edge; a down pool surfaces the throw truthfully.
 * All module surfaces are faked; no store, gate, or network is touched.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { GateVerdict } from '../../governance/types.js';
import type { MemoryRelation, RelationKind } from '../types.js';
import type { AcceptCandidateInput, AcceptResult, MemoryLifecycle } from '../lifecycle/memory-lifecycle.js';
import type { RelateInput, RelateService } from '../lifecycle/relate.js';
import type { ForgetMemoryInput, ForgetResult, ForgetService } from '../lifecycle/forget.js';
import type { CandidateService } from '../lifecycle/candidate-service.js';
import type { RecallService } from '../recall/recall-fusion.js';
import { buildMemoryMcpTools, type MemoryMcpModule } from './memory-engine.js';

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'medium',
    reason: `test ${effect}`,
    degraded: false,
    engine: 'napi',
    createdAt: '2026-01-01T00:00:00.000Z',
  } as GateVerdict;
}

const candidateFixture: MemoryCandidate = {
  candidateId: 'mc_1',
  scope: 'repo',
  title: 't',
  body: 'b',
  status: 'candidate_created',
  evidence: { taskId: 'task_1', artifactId: 'art_1' },
  proposedBy: 'user_1',
  proposedAt: '2026-01-01T00:00:00.000Z',
} as MemoryCandidate;

const itemFixture: MemoryItem = {
  memoryId: 'mi_1',
  scope: 'repo',
  title: 't',
  body: 'b',
  status: 'active',
  evidence: { taskId: 'task_1', artifactId: 'art_1' },
  createdAt: '2026-01-01T00:00:00.000Z',
  acceptedBy: 'user_1',
} as MemoryItem;

interface Fakes {
  acceptCalls: AcceptCandidateInput[];
  relateCalls: RelateInput[];
  forgetCalls: ForgetMemoryInput[];
}

function buildModule(overrides: {
  accept?: (input: AcceptCandidateInput) => Promise<AcceptResult>;
  relate?: (input: RelateInput) => Promise<MemoryRelation>;
  forget?: (input: ForgetMemoryInput) => Promise<ForgetResult>;
}): { module: MemoryMcpModule; fakes: Fakes } {
  const fakes: Fakes = { acceptCalls: [], relateCalls: [], forgetCalls: [] };

  const lifecycle: MemoryLifecycle = {
    accept: async (input) => {
      fakes.acceptCalls.push(input);
      if (overrides.accept) return overrides.accept(input);
      return { promoted: true, memory: itemFixture, candidate: candidateFixture, verdict: verdict('allow') };
    },
    reject: async () => ({ candidate: candidateFixture }),
  };

  const relations: RelateService = {
    relate: async (input) => {
      fakes.relateCalls.push(input);
      if (overrides.relate) return overrides.relate(input);
      return {
        relationId: 'rel_1',
        userId: input.userId,
        fromMemoryId: input.fromMemoryId,
        toMemoryId: input.toMemoryId,
        kind: input.kind as RelationKind,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
    },
    list: async () => [],
    unrelate: async () => false,
  };

  const forget: ForgetService = {
    forget: async (input) => {
      fakes.forgetCalls.push(input);
      if (overrides.forget) return overrides.forget(input);
      return { forgotten: true, item: { ...itemFixture, status: 'expired' }, verdict: verdict('allow') };
    },
  };

  const module: MemoryMcpModule = {
    recall: () => ({ recall: async () => ({ memories: [], sources: [], reranker: 'identity' }) }) as unknown as RecallService,
    candidates: () => ({}) as unknown as CandidateService,
    lifecycle: () => lifecycle,
    forget: () => forget,
    relations: () => relations,
  };

  return { module, fakes };
}

function tool(module: MemoryMcpModule, name: string) {
  const found = buildMemoryMcpTools(module).find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

describe('memory MCP tools registration', () => {
  it('exposes recall, remember, promote, relate, and forget', () => {
    const { module } = buildModule({});
    const names = buildMemoryMcpTools(module).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'memory_recall',
        'memory_remember',
        'memory_promote',
        'memory_relate',
        'memory_forget',
      ]),
    );
  });
});

describe('memory_forget (governed)', () => {
  it('forgets on an allow verdict and binds the principal from userId', async () => {
    const { module, fakes } = buildModule({});
    const result = (await tool(module, 'memory_forget').handler({
      userId: 'user_1',
      memoryId: 'mi_1',
      reason: 'stale',
    })) as { forgotten: boolean; item: MemoryItem };
    expect(result.forgotten).toBe(true);
    expect(result.item.status).toBe('expired');
    expect(fakes.forgetCalls[0]?.principal.userId).toBe('user_1');
    expect(fakes.forgetCalls[0]?.reason).toBe('stale');
  });

  it('returns a truthful { forgotten:false, verdict } when the gate denies (no fabricated delete)', async () => {
    const { module } = buildModule({
      forget: async () => ({ forgotten: false, item: itemFixture, verdict: verdict('deny') }),
    });
    const result = (await tool(module, 'memory_forget').handler({
      userId: 'user_1',
      memoryId: 'mi_1',
      reason: 'stale',
    })) as { forgotten: boolean; item: MemoryItem; verdict: GateVerdict };
    expect(result.forgotten).toBe(false);
    expect(result.item.status).toBe('active');
    expect(result.verdict.effect).toBe('deny');
  });

  it('rejects a missing userId, memoryId, or reason fast', async () => {
    const { module } = buildModule({});
    await expect(tool(module, 'memory_forget').handler({ memoryId: 'mi_1', reason: 'x' })).rejects.toThrow(/userId/);
    await expect(tool(module, 'memory_forget').handler({ userId: 'user_1', reason: 'x' })).rejects.toThrow(/memoryId/);
    await expect(tool(module, 'memory_forget').handler({ userId: 'user_1', memoryId: 'mi_1' })).rejects.toThrow(/reason/);
  });
});

describe('memory_promote (governed)', () => {
  it('promotes on an allow verdict and binds the principal from userId', async () => {
    const { module, fakes } = buildModule({});
    const result = (await tool(module, 'memory_promote').handler({
      userId: 'user_1',
      candidateId: 'mc_1',
    })) as { promoted: boolean; memory?: MemoryItem };
    expect(result.promoted).toBe(true);
    expect(result.memory?.memoryId).toBe('mi_1');
    expect(fakes.acceptCalls[0]?.principal.userId).toBe('user_1');
    // No elevated scopes are fabricated — the gate decides on its own authority.
    expect(fakes.acceptCalls[0]?.principal.scopes).toEqual(['read', 'write']);
  });

  it('returns a truthful { promoted:false, verdict } when the gate denies (no fabricated item)', async () => {
    const { module } = buildModule({
      accept: async () => ({ promoted: false, candidate: candidateFixture, verdict: verdict('deny') }),
    });
    const result = (await tool(module, 'memory_promote').handler({
      userId: 'user_1',
      candidateId: 'mc_1',
    })) as { promoted: boolean; memory?: MemoryItem; verdict: GateVerdict };
    expect(result.promoted).toBe(false);
    expect(result.memory).toBeUndefined();
    expect(result.verdict.effect).toBe('deny');
  });

  it('rejects a missing userId or candidateId fast', async () => {
    const { module } = buildModule({});
    await expect(tool(module, 'memory_promote').handler({ candidateId: 'mc_1' })).rejects.toThrow(/userId/);
    await expect(tool(module, 'memory_promote').handler({ userId: 'user_1' })).rejects.toThrow(/candidateId/);
  });
});

describe('memory_relate', () => {
  it('records an edge with the host-bound userId', async () => {
    const { module, fakes } = buildModule({});
    const result = (await tool(module, 'memory_relate').handler({
      userId: 'user_1',
      fromMemoryId: 'mi_1',
      toMemoryId: 'mi_2',
      kind: 'relates-to',
    })) as { relation: MemoryRelation };
    expect(result.relation.relationId).toBe('rel_1');
    expect(result.relation.userId).toBe('user_1');
    expect(fakes.relateCalls[0]?.kind).toBe('relates-to');
  });

  it('surfaces a down-pool write failure truthfully (never fakes the edge)', async () => {
    const { module } = buildModule({
      relate: async () => {
        throw new Error('persistence pool unavailable');
      },
    });
    await expect(
      tool(module, 'memory_relate').handler({
        userId: 'user_1',
        fromMemoryId: 'mi_1',
        toMemoryId: 'mi_2',
        kind: 'supersedes',
      }),
    ).rejects.toThrow(/pool unavailable/);
  });

  it('rejects missing edge fields fast', async () => {
    const { module } = buildModule({});
    await expect(
      tool(module, 'memory_relate').handler({ userId: 'user_1', toMemoryId: 'mi_2', kind: 'relates-to' }),
    ).rejects.toThrow(/fromMemoryId/);
  });
});
