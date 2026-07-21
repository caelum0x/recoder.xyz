/**
 * mem0 adapter — proves the V3 consumer-owned-port wiring is behavior-preserving
 * and degrade-truthful:
 *
 *  - INJECTED ENGINE: `search`/`add`/`health` delegate to the injected
 *    `Mem0EnginePort` (the engines mem0 client at the composition root), narrowing
 *    its raw shapes to the domain `Mem0Port` — the same runtime calls as the old
 *    direct value import, now injected;
 *  - DEGRADE (no engine): an absent `mem0Engine` yields a truthful
 *    `available:false` engine — `search → []`, `health.available → false` — never a
 *    fabricated memory;
 *  - SIDECAR FALLTHROUGH: an unavailable engine + a wired sidecar routes reads to
 *    the sidecar (the self-hosted transport), unchanged.
 */
import { describe, it, expect } from 'vitest';
import { createMem0Adapter } from './mem0.adapter.js';
import type { Mem0EnginePort } from '../ports/mem0-engine.port.js';
import type { Mem0SidecarClient } from './mem0-sidecar.client.js';

const SCOPE = { userId: 'u1' } as const;

/** A stub engine that reports available with one canned record. */
const HEALTHY_ENGINE: Mem0EnginePort = {
  async add() {
    return { available: true, memories: [{ id: 'm1', memory: 'the deploy uses PM2' }] };
  },
  async search() {
    return { available: true, results: [{ id: 'm1', memory: 'the deploy uses PM2', score: 0.9 }] };
  },
  async health() {
    return { available: true, mode: 'platform', vectorStore: 'qdrant:local' };
  },
};

describe('createMem0Adapter — injected engine port', () => {
  it('delegates search to the engine and narrows records to Mem0Result', async () => {
    const adapter = createMem0Adapter({ mem0Engine: HEALTHY_ENGINE });
    const results = await adapter.search('deploy', SCOPE, 5);
    expect(results).toEqual([{ id: 'm1', memory: 'the deploy uses PM2', score: 0.9 }]);
  });

  it('delegates add + health to the engine (available)', async () => {
    const adapter = createMem0Adapter({ mem0Engine: HEALTHY_ENGINE });
    expect(await adapter.add([{ role: 'user', content: 'we use PM2' }], SCOPE)).toEqual({ ok: true });
    const health = await adapter.health();
    expect(health.available).toBe(true);
    expect(health.mode).toBe('platform');
    expect(health.detail?.vectorStore).toBe('qdrant:local');
  });
});

describe('createMem0Adapter — degrade-truthful (no engine injected)', () => {
  it('search returns [] and health is available:false (never fabricated)', async () => {
    const adapter = createMem0Adapter();
    expect(await adapter.search('anything', SCOPE)).toEqual([]);
    const health = await adapter.health();
    expect(health.available).toBe(false);
    expect(health.mode).toBe('none');
    expect(health.reason).toBeTruthy();
  });

  it('add reports a truthful failure reason', async () => {
    const adapter = createMem0Adapter();
    const res = await adapter.add([{ role: 'user', content: 'x' }], SCOPE);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });
});

describe('createMem0Adapter — sidecar fallthrough when engine unavailable', () => {
  it('routes search to the wired sidecar when the engine reports unavailable', async () => {
    const sidecar = {
      baseUrl: 'http://127.0.0.1:9100',
      async search() {
        return [{ id: 's1', memory: 'from the self-hosted sidecar' }];
      },
      async add() {
        return { ok: true };
      },
      async consolidate() {
        return { ok: true };
      },
      async health() {
        return { available: true };
      },
    } as unknown as Mem0SidecarClient;

    // No engine injected ⇒ the adapter's UNAVAILABLE engine falls through to the sidecar.
    const adapter = createMem0Adapter({ sidecar });
    const results = await adapter.search('anything', SCOPE);
    expect(results).toEqual([{ id: 's1', memory: 'from the self-hosted sidecar' }]);

    const health = await adapter.health();
    expect(health.available).toBe(true);
    expect(health.detail?.transport).toBe('sidecar');
  });
});
