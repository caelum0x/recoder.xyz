/**
 * agent-engine.service contract tests — the facet's `{op, input}` mapping onto
 * the injected openfang transport, its per-verb degrade law, and the LOAD-BEARING
 * streaming contract: `run`/`continueRun` compose over the `launchOpenfangRun`
 * FUNCTION (never `engine.invoke`), threading the caller's EXACT per-call sink
 * instance into `deps.sink` and the SHARED provenance gate into `deps.governance`.
 * A governance-deny run emits a `failed` RunEvent to the caller's sink and returns
 * `ok:false` — proven end-to-end through the real `launchOpenfangRun`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { EngineCall, EngineClientPort } from '../ports/engine-client.port.js';
import type { EngineHealth, InvokeResult } from '../types.js';
import {
  launchOpenfangRun,
  type OpenfangLaunchDeps,
  type OpenfangLaunchInput,
  type OpenfangProvenanceGate,
  type OpenfangRunEventSink,
} from '../openfang-runtime.js';
import type { OpenfangEngineInstance } from '../openfang-native.js';
import { createAgentEngineService, type AgentEngineServiceDeps } from './agent-engine.service.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() {
    return silentLogger;
  },
} as never;

/** A fake openfang transport that returns a canned `InvokeResult` per op. */
function fakeEngine(
  table: Record<string, InvokeResult<unknown>>,
  health: EngineHealth = {
    engineId: 'openfang',
    transport: 'napi',
    status: 'up',
    version: '1.0',
    checkedAt: '2026-07-21T00:00:00Z',
  },
): { engine: EngineClientPort; calls: EngineCall<unknown>[] } {
  const calls: EngineCall<unknown>[] = [];
  const engine: EngineClientPort = {
    id: 'openfang',
    transport: 'napi',
    async start() {},
    async stop() {},
    async invoke(call) {
      calls.push(call);
      return table[call.op] ?? { ok: false, reason: `no canned reply for ${call.op}` };
    },
    async health() {
      return health;
    },
  };
  return { engine, calls };
}

const allowGate: OpenfangProvenanceGate = { decide: async () => ({ allow: true, reason: 'ok' }) };

function svcOver(
  engine: EngineClientPort | null,
  overrides: Partial<AgentEngineServiceDeps> = {},
) {
  return createAgentEngineService({
    engine,
    gate: allowGate,
    logger: silentLogger,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Pure-verb narrowing (composes over engine.invoke)
// ---------------------------------------------------------------------------

describe('agent-engine pure verbs narrow the native JSON reply', () => {
  it('listAgents → {op:listAgents} and unwraps the agents array', async () => {
    const { engine, calls } = fakeEngine({
      listAgents: { ok: true, value: { ok: true, agents: [{ id: 'a1' }, { id: 'a2' }] } },
    });
    const agents = await svcOver(engine).listAgents();
    expect(calls[0]).toMatchObject({ op: 'listAgents', input: {} });
    expect(agents).toEqual([{ id: 'a1' }, { id: 'a2' }]);
  });

  it('listSkills narrows to a string[]', async () => {
    const { engine } = fakeEngine({
      listSkills: { ok: true, value: { ok: true, skills: ['git', 'shell', 42] } },
    });
    expect(await svcOver(engine).listSkills()).toEqual(['git', 'shell']);
  });

  it('hands → introspectHands composite, folding active instances', async () => {
    const { engine, calls } = fakeEngine({
      introspectHands: {
        ok: true,
        value: {
          ok: true,
          hands: [
            { id: 'h1', activeInstances: [{ instanceId: 'i1' }] },
            { id: 'h2', activeInstances: [] },
          ],
        },
      },
    });
    const view = await svcOver(engine).hands();
    expect(calls[0]).toMatchObject({ op: 'introspectHands' });
    expect(view.hands).toHaveLength(2);
    expect(view.active).toEqual([{ instanceId: 'i1' }]);
  });

  it('activateHand narrows {ok, instance_id} → {ok, instanceId}', async () => {
    const { engine, calls } = fakeEngine({
      activateHand: { ok: true, value: { ok: true, instance_id: 'inst_9' } },
    });
    expect(await svcOver(engine).activateHand('h1')).toEqual({ ok: true, instanceId: 'inst_9' });
    expect(calls[0]).toMatchObject({ op: 'activateHand', input: { handId: 'h1' } });
  });

  it('publishEvent → fired triggers as {agentId, message}[]', async () => {
    const { engine, calls } = fakeEngine({
      publishEvent: {
        ok: true,
        value: { ok: true, fired: [{ agent_id: 'a1', message: 'go' }, { message: 'no id' }] },
      },
    });
    const fired = await svcOver(engine).publishEvent({ type: 'x' });
    expect(calls[0]).toMatchObject({ op: 'publishEvent', input: { event: { type: 'x' } } });
    expect(fired).toEqual([{ agentId: 'a1', message: 'go' }]);
  });

  it('registerWorkflow / runWorkflow narrow the native ids', async () => {
    const { engine, calls } = fakeEngine({
      registerWorkflow: { ok: true, value: { ok: true, workflow_id: 'wf_1' } },
      runWorkflow: { ok: true, value: { ok: true, run_id: 'wr_1', output: 'done' } },
    });
    const svc = svcOver(engine);
    expect(await svc.registerWorkflow('{"name":"x"}')).toEqual({
      available: true,
      ok: true,
      workflowId: 'wf_1',
    });
    expect(await svc.runWorkflow('wf_1', '{}')).toEqual({
      available: true,
      ok: true,
      runId: 'wr_1',
      output: 'done',
    });
    expect(calls[0]).toMatchObject({ op: 'registerWorkflow', input: { workflow: '{"name":"x"}' } });
    expect(calls[1]).toMatchObject({ op: 'runWorkflow', input: { workflowId: 'wf_1', input: '{}' } });
  });

  it('verifyManifest distills provenance (signer) from the verify reply', async () => {
    const { engine, calls } = fakeEngine({
      verifySignedManifest: { ok: true, value: { ok: true, manifest: { signer: 'key-1' } } },
    });
    expect(await svcOver(engine).verifyManifest('{"sig":"x"}')).toEqual({
      signed: true,
      verified: true,
      signer: 'key-1',
    });
    expect(calls[0]).toMatchObject({ op: 'verifySignedManifest', input: { signed: '{"sig":"x"}' } });
    // An empty envelope short-circuits to {signed:false} without touching the seam.
    expect(await svcOver(engine).verifyManifest('  ')).toEqual({ signed: false, verified: false });
  });

  it('memory verbs map onto the native KV ops', async () => {
    const { engine, calls } = fakeEngine({
      memoryGet: { ok: true, value: { ok: true, value: { theme: 'dark' } } },
      memorySet: { ok: true, value: { ok: true } },
      memoryList: { ok: true, value: { ok: true, entries: [{ key: 'k', value: 1 }] } },
    });
    const svc = svcOver(engine);
    expect(await svc.memoryGet('a1', 'prefs')).toEqual({ theme: 'dark' });
    expect(await svc.memorySet('a1', 'prefs', { theme: 'dark' })).toBe(true);
    expect(await svc.memoryList('a1')).toEqual([{ key: 'k', value: 1 }]);
    expect(calls[0]).toMatchObject({ op: 'memoryGet', input: { agentId: 'a1', key: 'prefs' } });
    expect(calls[1]).toMatchObject({ op: 'memorySet', input: { agentId: 'a1', key: 'prefs' } });
  });

  it('setTriggerEnabled returns the engine ok flag', async () => {
    const { engine, calls } = fakeEngine({ setTriggerEnabled: { ok: true, value: { ok: true } } });
    expect(await svcOver(engine).setTriggerEnabled('tr_1', false)).toBe(true);
    expect(calls[0]).toMatchObject({ op: 'setTriggerEnabled', input: { triggerId: 'tr_1', enabled: false } });
  });
});

// ---------------------------------------------------------------------------
// Health (probed through the transport, never faked)
// ---------------------------------------------------------------------------

describe('agent-engine health is truthful', () => {
  it('up engine → available + version/buildMode from nativeVersion', async () => {
    const { engine } = fakeEngine({
      nativeVersion: { ok: true, value: { ok: true, version: '2.0', build_mode: 'full' } },
    });
    expect(await svcOver(engine).health()).toEqual({
      available: true,
      addonLoaded: true,
      version: '2.0',
      buildMode: 'full',
    });
  });

  it('down engine → not available/loaded with the truthful reason', async () => {
    const { engine } = fakeEngine(
      {},
      {
        engineId: 'openfang',
        transport: 'napi',
        status: 'down',
        reason: 'addon not built',
        checkedAt: '2026-07-21T00:00:00Z',
      },
    );
    expect(await svcOver(engine).health()).toEqual({
      available: false,
      addonLoaded: false,
      reason: 'addon not built',
    });
  });

  it('degraded engine (addon up, kernel down) → addonLoaded but not available', async () => {
    const { engine } = fakeEngine(
      {},
      {
        engineId: 'openfang',
        transport: 'napi',
        status: 'degraded',
        reason: 'kernel boot failed',
        checkedAt: '2026-07-21T00:00:00Z',
      },
    );
    const h = await svcOver(engine).health();
    expect(h).toMatchObject({ available: false, addonLoaded: true, reason: 'kernel boot failed' });
  });
});

// ---------------------------------------------------------------------------
// Degrade law (null / {ok:false} / throwing transport)
// ---------------------------------------------------------------------------

describe('agent-engine degrade law', () => {
  it('a null engine degrades every pure verb (never throws, never fabricates)', async () => {
    const svc = svcOver(null);
    expect(await svc.health()).toEqual({
      available: false,
      addonLoaded: false,
      reason: 'openfang engine client not wired',
    });
    expect(await svc.listAgents()).toEqual([]);
    expect(await svc.listModels()).toEqual([]);
    expect(await svc.listSkills()).toEqual([]);
    expect(await svc.listTriggers()).toEqual([]);
    expect(await svc.agentRunStatus('a1')).toBeNull();
    expect(await svc.usageSummary()).toBeNull();
    expect(await svc.hands()).toEqual({ hands: [], active: [] });
    expect(await svc.activateHand('h1')).toMatchObject({ ok: false });
    expect(await svc.pauseHand('i1')).toBe(false);
    expect(await svc.publishEvent({})).toEqual([]);
    expect(await svc.setTriggerEnabled('t', true)).toBe(false);
    expect(await svc.registerWorkflow('{}')).toMatchObject({ available: false });
    expect(await svc.runWorkflow('wf', '{}')).toMatchObject({ available: false });
    expect(await svc.verifyManifest('{"sig":"x"}')).toMatchObject({ signed: true, verified: false });
    expect(await svc.memoryGet('a', 'k')).toBeNull();
    expect(await svc.memorySet('a', 'k', 1)).toBe(false);
    expect(await svc.memoryList('a')).toEqual([]);
  });

  it('an engine {ok:false} reply degrades reads/writes truthfully', async () => {
    const { engine } = fakeEngine({
      listAgents: { ok: true, value: { ok: false, error: 'kernel down' } },
      memorySet: { ok: true, value: { ok: false, error: 'no such agent' } },
    });
    const svc = svcOver(engine);
    expect(await svc.listAgents()).toEqual([]);
    expect(await svc.memorySet('a', 'k', 1)).toBe(false);
  });

  it('a failed invoke and a throwing invoke both degrade without crossing the facet', async () => {
    const failing = fakeEngine({}).engine;
    failing.invoke = async () => ({ ok: false, reason: 'engine down' });
    expect(await svcOver(failing).listAgents()).toEqual([]);
    expect(await svcOver(failing).memorySet('a', 'k', 1)).toBe(false);

    const throwing = fakeEngine({}).engine;
    throwing.invoke = async () => {
      throw new Error('seam contract violated');
    };
    expect(await svcOver(throwing).listAgents()).toEqual([]);
    expect(await svcOver(throwing).activateHand('h')).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// Streaming verbs (the LOAD-BEARING function seam)
// ---------------------------------------------------------------------------

describe('run/continueRun compose over launchOpenfangRun (per-call sink + shared gate)', () => {
  it('run threads the caller EXACT sink instance and the shared gate into deps', async () => {
    let captured: { input: OpenfangLaunchInput; deps: OpenfangLaunchDeps } | undefined;
    const fakeLaunch = vi.fn(async (input: OpenfangLaunchInput, deps: OpenfangLaunchDeps) => {
      captured = { input, deps };
      return { available: true as const, ok: true as const, agentId: 'a1', response: 'hi' };
    });
    const gate: OpenfangProvenanceGate = { decide: async () => ({ allow: true, reason: 'ok' }) };
    const sink: OpenfangRunEventSink = { append: () => {} };
    const { engine } = fakeEngine({});
    const svc = createAgentEngineService({ engine, gate, logger: silentLogger, launch: fakeLaunch });

    const input = { workspaceId: 'ws', taskId: 't', runId: 'run_ws', prompt: 'go', agentName: 'a' };
    const result = await svc.run(input, sink);

    expect(result).toMatchObject({ available: true, ok: true, response: 'hi' });
    // The EXACT sink instance the caller passed reaches launchOpenfangRun.
    expect(captured?.deps.sink).toBe(sink);
    // The SHARED gate instance is threaded into deps.governance.
    expect(captured?.deps.governance).toBe(gate);
    expect(captured?.input).toMatchObject({ workspaceId: 'ws', taskId: 't', prompt: 'go', agentName: 'a' });
  });

  it('continueRun threads the caller sink too (reuse-by-name follow-up turn)', async () => {
    const seen: OpenfangRunEventSink[] = [];
    const fakeLaunch = vi.fn(async (_input: OpenfangLaunchInput, deps: OpenfangLaunchDeps) => {
      if (deps.sink) seen.push(deps.sink);
      return { available: true as const, ok: true as const, agentId: 'a1', response: 'r' };
    });
    const sink: OpenfangRunEventSink = { append: () => {} };
    const svc = svcOver(fakeEngine({}).engine, { launch: fakeLaunch });
    await svc.continueRun({ workspaceId: 'ws', taskId: 't', runId: 'run_ws', prompt: 'more' }, sink);
    expect(seen[0]).toBe(sink);
  });

  it('a governance-deny run emits a failed RunEvent to the caller sink and returns ok:false', async () => {
    // Real launchOpenfangRun (via an injected engine-bound wrapper) proves the
    // deny path end-to-end: gate → no spawn → failed event → ok:false.
    const stubEngine = new Proxy({} as OpenfangEngineInstance, {
      get(_t, prop: string) {
        if (prop === 'listAgents') return () => JSON.stringify({ ok: true, agents: [] });
        if (prop === 'verifySignedManifest')
          return () => JSON.stringify({ ok: true, manifest: { signer: 'k' } });
        if (prop === 'spawnAgent') return () => JSON.stringify({ ok: true, agent_id: 'a1' });
        return () => JSON.stringify({ ok: true });
      },
    });
    const denyGate: OpenfangProvenanceGate = {
      decide: async () => ({ allow: false, reason: 'untrusted signer' }),
    };
    const events: RunEvent[] = [];
    const sink: OpenfangRunEventSink = { append: (e) => void events.push(e) };
    const svc = svcOver(fakeEngine({}).engine, {
      gate: denyGate,
      launch: (input, deps) => launchOpenfangRun(input, { ...deps, engine: () => stubEngine }),
    });

    const result = await svc.run(
      { workspaceId: 'ws', taskId: 't', runId: 'run_ws', prompt: 'go', agentName: 'a', signedManifestJson: '{"sig":"x"}' },
      sink,
    );

    expect(result).toMatchObject({ available: true, ok: false });
    if (result.available && !result.ok) expect(result.error).toMatch(/provenance denied/);
    expect(events.some((e) => e.type === 'failed')).toBe(true);
    expect(events.some((e) => e.type === 'completed')).toBe(false);
  });
});
