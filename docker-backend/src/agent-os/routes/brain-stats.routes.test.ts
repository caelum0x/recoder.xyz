import type { Router } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrain, type BrainDoc, type BrainMemory, type DocsPort, type MemoryPort } from '@recoder/brain';

import { createBrainStatsRouter } from './brain-stats.routes';
import { BrainService } from '../brain-service';
import { agentOsContainer } from '../service-container';

// Drives the real Express router stack (same harness as the other agent-os route
// tests) against the real service container. This proves GET /brain/stats
// surfaces the LIVE @recoder/brain cache accounting + the @recoder/governance
// audit integrity — not a stub.

interface MockReq {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
}

function makeReq(): MockReq {
  return { method: 'GET', body: {}, params: {}, query: {}, headers: {} };
}

// Real port implementations (same contracts the mem0/context7 adapters satisfy)
// so the Brain assembles a non-empty context whose reuse on a HIT saves real
// tokens — the live cache engine, not a stubbed Brain.
function contentMemory(): MemoryPort {
  return {
    recall: async (_query: string, limit: number): Promise<BrainMemory[]> =>
      Array.from({ length: Math.min(limit, 5) }, (_unused, i) => ({
        id: `mem-${i}`,
        text: `Prior decision ${i}: standardized on pnpm --filter and verifies cross-subdomain auth before release.`,
        score: 0.9 - i * 0.05,
      })),
    remember: async () => undefined,
  };
}

function contentDocs(): DocsPort {
  return {
    lookup: async (_query: string, limit: number): Promise<BrainDoc[]> =>
      Array.from({ length: Math.min(limit, 3) }, (_unused, i) => ({
        library: 'express',
        title: `Routing ${i}`,
        url: `https://example.test/express/${i}`,
        snippet: 'Express routers compose middleware; mount additively under shared auth to avoid shadowing.',
      })),
  };
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = { statusCode: 200, jsonData: null as any };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
  };
  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'post' | 'get') {
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return (routeLayer as any).route.stack.map((layer: any) => layer.handle);
}

async function runStack(router: Router, path: string, method: 'post' | 'get', req: MockReq, res: any): Promise<void> {
  const handlers = getRouteStack(router, path, method);
  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) return reject(err);
        nextCalled = true;
        resolve({ nextCalled: true });
      };
      try {
        Promise.resolve(handler(req, res, next))
          .then(() => {
            if (!nextCalled) resolve({ nextCalled: false });
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
    if (!result.nextCalled) break;
  }
}

describe('GET /api/agent-os/brain/stats', () => {
  const originalBrain = agentOsContainer.brain;

  afterEach(() => {
    // Restore the shared container after swapping in a test brain.
    agentOsContainer.brain = originalBrain;
  });

  it('surfaces the LIVE cache accounting from a Brain that had a real cache HIT + governance audit ok', async () => {
    // A REAL Brain (no stubs). Deterministic git revision so two assembles
    // content-address to the same key — the second is a genuine cache HIT.
    const runGit = async () => 'cafebabecafebabecafebabecafebabecafebabe';
    const brain = createBrain({ runGit, memory: contentMemory(), docs: contentDocs() });
    const service = new BrainService({ isEnabled: () => true, brainFactory: () => brain });

    await service.assembleForTask({ task: 'report the brain metric', repoRoot: '/repo' });
    await service.assembleForTask({ task: 'report the brain metric', repoRoot: '/repo' });

    // Swap the shared container's brain with our cache-hit instance, exactly as
    // the route reads it (agentOsContainer.brain).
    agentOsContainer.brain = service;

    const router = createBrainStatsRouter();
    const { res, state } = makeRes();
    await runStack(router, '/stats', 'get', makeReq(), res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData?.success).toBe(true);

    // --- Brain: the real cacheStats shape from a HIT ---
    const brainPart = state.jsonData?.data?.brain;
    expect(brainPart?.enabled).toBe(true);
    expect(brainPart?.report).not.toBeNull();
    expect(brainPart?.report?.available).toBe(true);
    expect(brainPart?.report?.hits).toBeGreaterThanOrEqual(1);
    expect(brainPart?.report?.tokensSaved).toBeGreaterThan(0);
    expect(brainPart?.report?.hitRate).toBeGreaterThan(0);
    expect(typeof brainPart?.report?.detail).toBe('string');
    // Matches the live brain's own accounting -> same instance, real numbers.
    const live = brain.cacheStats();
    expect(brainPart?.report?.hits).toBe(live.hits);
    expect(brainPart?.report?.tokensSaved).toBe(live.tokensSaved);

    // --- Governance: the Merkle audit chain verifies intact ---
    const governance = state.jsonData?.data?.governance;
    expect(governance?.ok).toBe(true);
    expect(typeof governance?.entries).toBe('number');
    expect(governance?.entries).toBeGreaterThanOrEqual(0);
  });

  it('degrades truthfully when the brain is disabled (enabled:false, report:null) — no fake zeros-as-success', async () => {
    agentOsContainer.brain = new BrainService({ isEnabled: () => false });

    const router = createBrainStatsRouter();
    const { res, state } = makeRes();
    await runStack(router, '/stats', 'get', makeReq(), res);

    expect(state.jsonData?.success).toBe(true);
    expect(state.jsonData?.data?.brain).toEqual({ enabled: false, report: null });
    // Governance is independent of the brain flag and still reports truthfully.
    expect(typeof state.jsonData?.data?.governance?.ok).toBe('boolean');
  });
});
