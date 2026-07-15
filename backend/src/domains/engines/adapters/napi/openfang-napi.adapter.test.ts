/**
 * `OpenfangNapiAdapter` degrade-safe contract:
 *  - absent `.node` → `health` is `down` with reason, `invoke` is `{ok:false}` (no throw),
 *  - a present stub addon → the ~51 ops dispatch to the booted engine + parse JSON,
 *  - addon-only reads (`ping`/`bundledHands`) work WITHOUT a kernel boot,
 *  - an unknown op is a truthful failure (never a fabricated result),
 *  - the conductor `launchRun` driver emits RunEvents through an injected sink,
 *  - a kernel boot failure degrades health (addon up, kernel not) — never faked up.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type {
  OpenfangEngineInstance,
  OpenfangNativeAddon,
} from '../../openfang-native.js';
import type { OpenfangRunEventSink } from '../../openfang-runtime.js';
import type { NapiLoaderPort, NapiModule } from '../../ports/napi-loader.port.js';
import { OpenfangNapiAdapter } from './openfang-napi.adapter.js';

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

/** A loader that resolves a fixed path and returns a fixed (or null) module. */
function fakeLoader(module: NapiModule<OpenfangNativeAddon> | null, path: string | null): NapiLoaderPort {
  return {
    resolvePath: () => path,
    load: <T>() => module as NapiModule<T> | null,
    evict: () => {},
  };
}

/** A stub engine: every method returns a JSON string (mirrors the napi surface). */
function stubEngine(overrides: Partial<Record<keyof OpenfangEngineInstance, unknown>> = {}): OpenfangEngineInstance {
  const jsonOk = () => JSON.stringify({ ok: true });
  const base: Record<string, (...args: unknown[]) => string> = {
    listAgents: () => JSON.stringify({ ok: true, agents: [{ id: 'agent_1', name: 'demo' }] }),
    listModels: () => JSON.stringify({ ok: true, models: ['gpt-4o'] }),
    runAgent: () => JSON.stringify({ ok: true, response: 'hello', iterations: 1 }),
    spawnAgent: () => JSON.stringify({ ok: true, agent_id: 'agent_1' }),
    memoryGet: () => JSON.stringify({ ok: true, value: null }),
  };
  return new Proxy({ ...base, ...(overrides as Record<string, unknown>) } as OpenfangEngineInstance, {
    get(target, prop: string) {
      return (target as Record<string, unknown>)[prop] ?? jsonOk;
    },
  });
}

function stubAddon(engine: OpenfangEngineInstance): OpenfangNativeAddon {
  return {
    ping: () => true,
    nativeVersion: () => JSON.stringify({ version: '1.0.0', build_mode: 'full' }),
    bundledHandsJson: () => JSON.stringify({ ok: true, hands: [{ id: 'h1', name: 'H1', description: 'x' }] }),
    OpenfangEngine: { boot: () => engine },
  };
}

function present(engine = stubEngine()): OpenfangNapiAdapter {
  const addon = stubAddon(engine);
  const module: NapiModule<OpenfangNativeAddon> = { addon, path: '/tmp/openfang_napi.node', version: '1.0.0' };
  return new OpenfangNapiAdapter(fakeLoader(module, module.path), log);
}

describe('OpenfangNapiAdapter (degrade-safe)', () => {
  it('reports down + fails invoke when the .node is absent (no throw)', async () => {
    const adapter = new OpenfangNapiAdapter(fakeLoader(null, null), log);
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toMatch(/not built/i);

    const result = await adapter.invoke({ op: 'listAgents', input: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ENGINE_DOWN');
  });

  it('reports up when the addon loads + dispatches engine ops through the booted kernel', async () => {
    const adapter = present();
    const health = await adapter.health();
    expect(health.status).toBe('up');
    expect(health.version).toBe('1.0.0');
    expect(health.bindingPath).toBe('/tmp/openfang_napi.node');

    const agents = await adapter.invoke({ op: 'listAgents', input: {} });
    expect(agents.ok).toBe(true);
    if (agents.ok) expect(agents.value).toMatchObject({ ok: true, agents: [{ id: 'agent_1' }] });

    const run = await adapter.invoke({ op: 'runAgent', input: { agentId: 'agent_1', message: 'hi' } });
    expect(run.ok).toBe(true);
  });

  it('serves addon-only reads (ping/bundledHands) without booting the kernel', async () => {
    let booted = false;
    const engine = stubEngine();
    const addon: OpenfangNativeAddon = {
      ...stubAddon(engine),
      OpenfangEngine: { boot: () => { booted = true; return engine; } },
    };
    const module: NapiModule<OpenfangNativeAddon> = { addon, path: '/tmp/x.node', version: '1.0.0' };
    const adapter = new OpenfangNapiAdapter(fakeLoader(module, module.path), log);

    const ping = await adapter.invoke({ op: 'ping', input: {} });
    expect(ping.ok).toBe(true);
    const hands = await adapter.invoke({ op: 'bundledHands', input: {} });
    expect(hands.ok).toBe(true);
    if (hands.ok) expect(hands.value).toMatchObject({ ok: true, hands: [{ id: 'h1' }] });
    expect(booted).toBe(false);
  });

  it('fails truthfully on an unknown op', async () => {
    const result = await present().invoke({ op: 'notARealOp', input: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN_OP');
  });

  it('folds a thrown napi call into an {ok:false} failure (never propagates)', async () => {
    const engine = stubEngine({ health: () => { throw new Error('dlopen boom'); } });
    const result = await present(engine).invoke({ op: 'health', input: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/threw/);
  });

  it('launchRun drives one in-process turn and emits RunEvents to the injected sink', async () => {
    const events: string[] = [];
    const sink: OpenfangRunEventSink = { append: (e) => { events.push(e.type); } };
    const addon = stubAddon(stubEngine());
    const module: NapiModule<OpenfangNativeAddon> = { addon, path: '/tmp/x.node', version: '1.0.0' };
    const adapter = new OpenfangNapiAdapter(fakeLoader(module, module.path), log, { runSink: sink });

    const result = await adapter.invoke({
      op: 'launchRun',
      input: { workspaceId: 'ws1', taskId: 't1', runId: 'run_ws1', prompt: 'go' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ available: true, ok: true });
    expect(events).toContain('started');
    expect(events).toContain('completed');
  });

  it('launchRun requires workspaceId/taskId/runId', async () => {
    const result = await present().invoke({ op: 'launchRun', input: { prompt: 'x' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_INPUT');
  });

  it('reports disabled as down without binding', async () => {
    const adapter = new OpenfangNapiAdapter(fakeLoader(null, '/tmp/x.node'), log, { enabled: false });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toMatch(/disabled/);
    const result = await adapter.invoke({ op: 'listAgents', input: {} });
    expect(result.ok).toBe(false);
  });
});
