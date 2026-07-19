/**
 * Contract tests for PAL's agentic-communications capability on the TS side:
 *  - `buildAgentCommsArgs`  — the pure camelCase→snake_case tool-arg mapper.
 *  - `palCommsEngineBinder` — the `recoder.pal-comms` MCP handlers over a mocked
 *    pal `EngineClientPort` (no live sidecar): correct `agentcomms` op + args,
 *    boundary validation, and TRUTHFUL degrade (client absent / invoke `!ok`
 *    ⇒ the handler throws the real reason, never a fabricated model answer).
 *  - `PalMcpAdapter` typed methods (`route`/`consensus`/`debate`/`listModels`):
 *    truthful `unavailable` when the venv is absent, and — with the real pal dir
 *    on disk + a stubbed host transport — a delegation that reaches the stdio
 *    server as tool `agentcomms` with the built args (the live-sidecar path).
 *
 * LIVE-SIDECAR NOTE: the python pal server is not spawned here. The happy path
 * stubs `externalCall` (the interop `tools/call` transport) and a live
 * supervisor handle; against a real venv the same call reaches the process and
 * the new `tools/agentcomms.py` primitive executes the multi-model orchestration.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../../../../shared/logger.js';
import { enginesConfigSchema, type EnginesConfig } from '../../config.js';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type {
  PreflightResult,
  SidecarHandle,
  SidecarSpec,
  SidecarSupervisorPort,
} from '../../ports/sidecar-supervisor.port.js';
import type { EngineClientPort, EngineCall } from '../../ports/engine-client.port.js';
import { down, up, ok, fail, type EngineHealth, type InvokeResult } from '../../types.js';
import { PalMcpAdapter, type PalExternalCall } from './pal-mcp.adapter.js';
import { buildAgentCommsArgs, palCommsEngineBinder, recoderPalCommsServer } from './pal-comms.binder.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

/** The real pal server dir (has `.pal_venv/bin/python` + `server.py` on disk). */
const REAL_PAL_ROOT = join(process.cwd(), 'engines', 'py', 'pal-mcp-server');
/** The live-sidecar delegation assertion only runs where the real venv exists. */
const HAS_REAL_PAL = existsSync(join(REAL_PAL_ROOT, '.pal_venv', 'bin', 'python'));

function config(overrides: Partial<EnginesConfig> = {}): EnginesConfig {
  return enginesConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    repoRoot: null,
    palRootDir: null,
    napiPaths: { openfang: null, tensorzero: null, governance: null },
    daemonBins: { colbert: null, 'ops-recorder': null, multica: null, ziti: null, 'tensorzero-loopback': null },
    externalUrls: {
      colbert: null,
      'ops-recorder': null,
      multica: null,
      ziti: null,
      'tensorzero-loopback': null,
      mem0: null,
      'browser-use': null,
    },
    sidecarPython: { mem0: null, 'browser-use': null, 'pal-mcp': null },
    enabled: {},
    napiFirst: true,
    ...overrides,
  });
}

const deadSupervisor: SidecarSupervisorPort = {
  async preflight(): Promise<PreflightResult> {
    return { ok: false, reason: 'venv absent' };
  },
  async ensureStarted(): Promise<SidecarHandle | null> {
    return null;
  },
  async stop(): Promise<void> {},
  handle(): SidecarHandle | null {
    return null;
  },
  async health(spec: SidecarSpec): Promise<EngineHealth> {
    return down(spec.engineId as never, 'sidecar', 'not started');
  },
  async stopAll(): Promise<void> {},
};

/** A supervisor whose `ensureStarted` resolves a live stdio handle. */
const liveStdioSupervisor: SidecarSupervisorPort = {
  ...deadSupervisor,
  async ensureStarted(): Promise<SidecarHandle | null> {
    return { engineId: 'pal-mcp', transport: 'stdio-mcp' } as unknown as SidecarHandle;
  },
  async health(spec: SidecarSpec): Promise<EngineHealth> {
    return up(spec.engineId as never, 'sidecar');
  },
};

/** A fake pal `EngineClientPort` recording every `invoke` and returning `result`. */
function fakeEngine(result: InvokeResult<unknown>): { engine: EngineClientPort; calls: EngineCall<unknown>[] } {
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
      return down('pal-mcp', 'sidecar', 'stub');
    },
  } as unknown as EngineClientPort;
  return { engine, calls };
}

/** A capture router standing in for the real `McpToolRouter`. */
function captureRouter(): {
  router: McpToolRouter;
  call(tool: string, args: Record<string, unknown>): Promise<{ content: unknown; metadata?: unknown }>;
  tools(): string[];
} {
  const handlers = new Map<string, (input: { args: Record<string, unknown> }) => Promise<unknown>>();
  const router = {
    register(server: { serverId: string }, tool: string, handler: (input: { args: Record<string, unknown> }) => Promise<unknown>) {
      handlers.set(`${server.serverId}:${tool}`, handler);
    },
  } as unknown as McpToolRouter;
  return {
    router,
    async call(tool, args) {
      const handler = handlers.get(`${recoderPalCommsServer.serverId}:${tool}`);
      if (!handler) throw new Error(`no handler for ${tool}`);
      return (await handler({ args })) as { content: unknown; metadata?: unknown };
    },
    tools: () => [...handlers.keys()],
  };
}

describe('buildAgentCommsArgs', () => {
  it('maps a route request to snake_case with the model wrapped', () => {
    const args = buildAgentCommsArgs('route', { prompt: 'hi', model: 'gpt5', temperature: 0.5 });
    expect(args).toMatchObject({ operation: 'route', prompt: 'hi', temperature: 0.5, models: [{ model: 'gpt5' }] });
  });

  it('maps a consensus request with mixed string/object models + stances', () => {
    const args = buildAgentCommsArgs('consensus', {
      prompt: 'ship it?',
      models: ['flash', { model: 'pro', stance: 'against', stancePrompt: 'be critical' }],
      systemPrompt: 'you are terse',
      continuationId: 'thread-123',
      createThread: true,
    });
    expect(args).toMatchObject({
      operation: 'consensus',
      prompt: 'ship it?',
      system_prompt: 'you are terse',
      continuation_id: 'thread-123',
      create_thread: true,
      models: [{ model: 'flash' }, { model: 'pro', stance: 'against', stance_prompt: 'be critical' }],
    });
  });

  it('models operation carries no prompt', () => {
    expect(buildAgentCommsArgs('models', {})).toEqual({ operation: 'models' });
  });

  it('omits an empty/whitespace continuation id and non-finite temperature', () => {
    const args = buildAgentCommsArgs('route', { prompt: 'x', continuationId: '  ', temperature: Number.NaN });
    expect(args).not.toHaveProperty('continuation_id');
    expect(args).not.toHaveProperty('temperature');
  });
});

describe('palCommsEngineBinder', () => {
  it('registers all four recoder.pal-comms tools', () => {
    const cap = captureRouter();
    palCommsEngineBinder(fakeEngine(ok({})).engine)(cap.router);
    expect(cap.tools().sort()).toEqual(
      [
        'recoder.pal-comms:pal.consensus',
        'recoder.pal-comms:pal.debate',
        'recoder.pal-comms:pal.models',
        'recoder.pal-comms:pal.route',
      ].sort(),
    );
  });

  it('pal.route delegates to the agentcomms op with the built args and returns content', async () => {
    const { engine, calls } = fakeEngine(ok({ status: 'ok', model: 'gpt5', answer: { content: '42' } }));
    const cap = captureRouter();
    palCommsEngineBinder(engine)(cap.router);
    const res = await cap.call('pal.route', { prompt: 'meaning of life', model: 'gpt5' });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('agentcomms');
    expect(calls[0].input).toMatchObject({ operation: 'route', prompt: 'meaning of life', models: [{ model: 'gpt5' }] });
    expect(res.content).toMatchObject({ status: 'ok', model: 'gpt5' });
  });

  it('pal.consensus forwards a parsed models array', async () => {
    const { engine, calls } = fakeEngine(ok({ status: 'ok', responses: [] }));
    const cap = captureRouter();
    palCommsEngineBinder(engine)(cap.router);
    await cap.call('pal.consensus', { prompt: 'q', models: ['a', { model: 'b', stance: 'for' }] });
    expect(calls[0].input).toMatchObject({
      operation: 'consensus',
      models: [{ model: 'a' }, { model: 'b', stance: 'for' }],
    });
  });

  it('pal.debate requires models', async () => {
    const cap = captureRouter();
    palCommsEngineBinder(fakeEngine(ok({})).engine)(cap.router);
    await expect(cap.call('pal.debate', { prompt: 'q' })).rejects.toThrow(/requires args\.models/);
  });

  it('pal.models needs no args and forwards the models operation', async () => {
    const { engine, calls } = fakeEngine(ok({ status: 'ok', models: ['flash'] }));
    const cap = captureRouter();
    palCommsEngineBinder(engine)(cap.router);
    const res = await cap.call('pal.models', {});
    expect(calls[0].input).toEqual({ operation: 'models' });
    expect(res.content).toMatchObject({ models: ['flash'] });
  });

  it('rejects a missing prompt (boundary validation)', async () => {
    const cap = captureRouter();
    palCommsEngineBinder(fakeEngine(ok({})).engine)(cap.router);
    await expect(cap.call('pal.route', {})).rejects.toThrow(/requires args\.prompt/);
  });

  it('rejects an invalid stance', async () => {
    const cap = captureRouter();
    palCommsEngineBinder(fakeEngine(ok({})).engine)(cap.router);
    await expect(
      cap.call('pal.consensus', { prompt: 'q', models: [{ model: 'a', stance: 'sideways' }] }),
    ).rejects.toThrow(/stance must be/);
  });

  it('TRUTHFUL DEGRADE: a null client throws (never a fabricated answer)', async () => {
    const cap = captureRouter();
    palCommsEngineBinder(null)(cap.router);
    await expect(cap.call('pal.route', { prompt: 'q' })).rejects.toThrow(/not bound/);
  });

  it('TRUTHFUL DEGRADE: an engine `!ok` surfaces the real reason, not a result', async () => {
    const cap = captureRouter();
    palCommsEngineBinder(fakeEngine(fail('pal venv absent', 'unavailable')).engine)(cap.router);
    await expect(cap.call('pal.route', { prompt: 'q' })).rejects.toThrow(/pal\.route failed: pal venv absent/);
  });
});

describe('PalMcpAdapter agentic-communications methods', () => {
  it('degrades truthfully (unavailable) when the pal venv is absent', async () => {
    const adapter = new PalMcpAdapter({ supervisor: deadSupervisor, config: config({ palRootDir: '/nonexistent/pal' }), log });
    for (const res of [
      await adapter.route({ prompt: 'hi' }),
      await adapter.consensus({ prompt: 'hi', models: ['a', 'b'] }),
      await adapter.debate({ prompt: 'hi', models: [{ model: 'a', stance: 'for' }] }),
      await adapter.listModels(),
    ]) {
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('unavailable');
    }
  });

  it.runIf(HAS_REAL_PAL)('with the real pal dir + host transport, route reaches the stdio server as tool `agentcomms`', async () => {
    const seen: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const externalCall: PalExternalCall = async (tool, args) => {
      seen.push({ tool, args });
      return { status: 'ok', model: 'flash', answer: { status: 'ok', content: 'hello' } };
    };
    const adapter = new PalMcpAdapter({
      supervisor: liveStdioSupervisor,
      config: config({ palRootDir: REAL_PAL_ROOT }),
      log,
      externalCall,
    });
    const res = await adapter.route({ prompt: 'say hi', model: 'flash' });
    expect(res.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].tool).toBe('agentcomms');
    expect(seen[0].args).toMatchObject({ operation: 'route', prompt: 'say hi', models: [{ model: 'flash' }] });
  });
});
