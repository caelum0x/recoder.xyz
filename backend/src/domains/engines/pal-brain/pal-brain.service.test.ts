/**
 * Facet consumption proofs for {@link PalBrainService} (engine 3/12 — pal). The
 * pure verbs (`plan`/`routeModel`/`planLaunch`/`escalate`) compose `@recoder/pal`
 * in-proc and are total; the sidecar verbs (`consensus`/`debate`) degrade
 * truthfully to `abstain` when the pal-mcp transport is null/down/timed-out —
 * NEVER a fabricated verdict.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort, EngineCall } from '../ports/engine-client.port.js';
import { ok, fail, up, down, type EngineHealth, type InvokeResult } from '../types.js';
import { createPalBrainService } from './pal-brain.service.js';
import type { PalCatalogModel } from '../ports/pal-brain.port.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

/** A fake pal-mcp `EngineClientPort` recording every `invoke` and returning `result`. */
function fakeEngine(
  result: InvokeResult<unknown>,
  health: EngineHealth = down('pal-mcp', 'sidecar', 'stub'),
): { engine: EngineClientPort; calls: EngineCall<unknown>[] } {
  const calls: EngineCall<unknown>[] = [];
  const engine = {
    id: 'pal-mcp',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>) {
      calls.push(call);
      return result;
    },
    async health() {
      return health;
    },
  } as unknown as EngineClientPort;
  return { engine, calls };
}

/** An engine whose `invoke` never resolves (drives the timeout race). */
function hangingEngine(): EngineClientPort {
  return {
    id: 'pal-mcp',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    invoke() {
      return new Promise<InvokeResult<unknown>>(() => {
        /* never resolves */
      });
    },
    async health() {
      return down('pal-mcp', 'sidecar', 'stub');
    },
  } as unknown as EngineClientPort;
}

const CATALOG: readonly PalCatalogModel[] = [
  { provider: 'anthropic', modelId: 'claude-opus-4' },
  { provider: 'anthropic', modelId: 'claude-haiku-4' },
  { provider: 'openai', modelId: 'gpt-5' },
];

describe('PalBrainService — pure verbs', () => {
  it('plan returns a governed risk + approval decision over a loose spec', () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const d = pal.plan({ taskId: 't1', intent: 'bugfix', title: 'fix auth', goal: 'patch' });
    expect(['low', 'medium', 'high']).toContain(d.risk);
    expect(typeof d.approvalRequired).toBe('boolean');
    expect(d.reason).toBeTruthy();
  });

  it('routeModel picks a catalog model by intent+risk (source:pal, routable)', () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const d = pal.routeModel({ intent: 'bugfix', title: 'x', goal: 'y' }, CATALOG);
    expect(d.source).toBe('pal');
    expect(CATALOG.some((m) => m.modelId === d.model)).toBe(true);
    expect(['extended_reasoning', 'fast_response', 'balanced']).toContain(d.category);
  });

  it('DEGRADE: routeModel with an empty catalog ⇒ source:default + empty model', () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const d = pal.routeModel({ intent: 'bugfix' }, []);
    expect(d.source).toBe('default');
    expect(d.model).toBe('');
    expect(d.reason).toMatch(/catalog empty/);
  });

  it('planLaunch returns runtime/skills/tool-grants/sandbox + risk (source:pal)', () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const p = pal.planLaunch({ taskId: 't2', intent: 'feature_delivery', title: 'ship', goal: 'do' });
    expect(p.source).toBe('pal');
    expect(p.runtimeId).toBeTruthy();
    expect(p.sandboxTier).toBeTruthy();
    expect(Array.isArray(p.skills)).toBe(true);
    expect(p.skills).toContain('recoder-platform');
    expect(Array.isArray(p.toolGrants)).toBe(true);
    expect(['low', 'medium', 'high']).toContain(p.risk);
  });

  it('DEGRADE: planLaunch with an unusable spec ⇒ source:default, no runtime/sandbox override', () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    // A taskSpec object with no task identity ⇒ pal degrades to the conservative default.
    const p = pal.planLaunch({ taskSpec: {} });
    expect(p.source).toBe('default');
    expect(p.runtimeId).toBeUndefined();
    expect(p.sandboxTier).toBeUndefined();
    expect(p.skills).toEqual([]);
    expect(p.toolGrants).toEqual([]);
    expect(p.approvalRequired).toBe(true);
  });

  it('escalate resolves the expert-escalation gate (never throws)', () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const certain = pal.escalate({ confidence: 0.99, risk: 'high' });
    expect(certain.skipExpertAnalysis).toBe(true);
    expect(certain.escalate).toBe(false); // certain ⇒ high-confidence completion
    const midHighRisk = pal.escalate({ confidence: 0.5, risk: 'high' });
    expect(midHighRisk.escalate).toBe(true); // requires expert analysis, not certain
    const lowRisk = pal.escalate({ confidence: 0.5, risk: 'low' });
    expect(lowRisk.escalate).toBe(false);
  });
});

describe('PalBrainService — sidecar verbs (degrade-truthful)', () => {
  it('DEGRADE: a null engine ⇒ abstain + degraded + engine:synthetic (never fabricated)', async () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const r = await pal.consensus({ prompt: 'ship it?' });
    expect(r.recommendation).toBe('abstain');
    expect(r.degraded).toBe(true);
    expect(r.engine).toBe('synthetic');
  });

  it('a live VERDICT: BLOCK ⇒ recommendation:block (engine:pal-mcp, not degraded)', async () => {
    const { engine, calls } = fakeEngine(
      ok({ responses: [{ model: 'gpt-5', content: 'VERDICT: BLOCK — unsafe unattended write' }] }),
    );
    const pal = createPalBrainService({ engine, logger: log });
    const r = await pal.consensus({ prompt: 'delete prod?', systemPrompt: 'be adversarial' });
    expect(r.recommendation).toBe('block');
    expect(r.degraded).toBe(false);
    expect(r.engine).toBe('pal-mcp');
    expect(calls[0].op).toBe('agentcomms');
    expect(calls[0].input).toMatchObject({ operation: 'consensus', prompt: 'delete prod?', system_prompt: 'be adversarial' });
  });

  it('a live VERDICT: ALLOW ⇒ recommendation:allow', async () => {
    const { engine } = fakeEngine(ok({ responses: [{ model: 'gpt-5', content: 'VERDICT: ALLOW clearly safe' }] }));
    const pal = createPalBrainService({ engine, logger: log });
    const r = await pal.consensus({ prompt: 'read a file?' });
    expect(r.recommendation).toBe('allow');
    expect(r.degraded).toBe(false);
    expect(r.engine).toBe('pal-mcp');
  });

  it('DEGRADE: an unparseable live answer ⇒ abstain (never invents an objection)', async () => {
    const { engine } = fakeEngine(ok({ responses: [{ model: 'gpt-5', content: 'I am not sure about this.' }] }));
    const pal = createPalBrainService({ engine, logger: log });
    const r = await pal.consensus({ prompt: 'q' });
    expect(r.recommendation).toBe('abstain');
    expect(r.degraded).toBe(true);
  });

  it('DEGRADE: no_models_available ⇒ abstain', async () => {
    const { engine } = fakeEngine(ok({ status: 'no_models_available' }));
    const pal = createPalBrainService({ engine, logger: log });
    const r = await pal.consensus({ prompt: 'q' });
    expect(r.recommendation).toBe('abstain');
    expect(r.degraded).toBe(true);
  });

  it('DEGRADE: a failed invoke ⇒ abstain + degraded', async () => {
    const { engine } = fakeEngine(fail('pal venv absent', 'unavailable'));
    const pal = createPalBrainService({ engine, logger: log });
    const r = await pal.consensus({ prompt: 'q' });
    expect(r.recommendation).toBe('abstain');
    expect(r.degraded).toBe(true);
    expect(r.engine).toBe('synthetic');
  });

  it('DEGRADE: a hung call ⇒ abstain + degraded within the timeout bound', async () => {
    const pal = createPalBrainService({ engine: hangingEngine(), logger: log });
    const r = await pal.consensus({ prompt: 'q', timeoutMs: 20 });
    expect(r.recommendation).toBe('abstain');
    expect(r.degraded).toBe(true);
    expect(r.engine).toBe('synthetic');
    expect(r.reason).toMatch(/timed out/);
  });

  it('debate forwards per-model stances over the same agentcomms transport', async () => {
    const { engine, calls } = fakeEngine(ok({ responses: [] }));
    const pal = createPalBrainService({ engine, logger: log });
    await pal.debate({ prompt: 'argue', models: ['a', 'b'] });
    expect(calls[0].input).toMatchObject({ operation: 'debate', models: [{ model: 'a' }, { model: 'b' }] });
  });
});

describe('PalBrainService — truthful health', () => {
  it('reports available:false + pureVerbsAvailable:true when the engine is null', async () => {
    const pal = createPalBrainService({ engine: null, logger: log });
    const h = await pal.health();
    expect(h.available).toBe(false);
    expect(h.pureVerbsAvailable).toBe(true);
    expect(h.reason).toBeTruthy();
  });

  it('reports available:true when the sidecar health is up', async () => {
    const { engine } = fakeEngine(ok({}), up('pal-mcp', 'sidecar', { version: '2.0.0' }));
    const pal = createPalBrainService({ engine, logger: log });
    const h = await pal.health();
    expect(h.available).toBe(true);
    expect(h.pureVerbsAvailable).toBe(true);
    expect(h.version).toBe('2.0.0');
  });

  it('reports available:false + reason when the sidecar is down', async () => {
    const { engine } = fakeEngine(ok({}), down('pal-mcp', 'sidecar', 'venv absent'));
    const pal = createPalBrainService({ engine, logger: log });
    const h = await pal.health();
    expect(h.available).toBe(false);
    expect(h.pureVerbsAvailable).toBe(true);
    expect(h.reason).toMatch(/venv absent/);
  });
});
