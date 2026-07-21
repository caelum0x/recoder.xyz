/**
 * Contract tests for PAL's agentic-communications capability on the TS side:
 *  - `buildAgentCommsArgs`  — the pure camelCase→snake_case tool-arg mapper.
 *  - `palCommsEngineBinder` — the `recoder.pal-comms` MCP handlers over a mocked
 *    pal `EngineClientPort` (no live sidecar): correct `agentcomms` op + args,
 *    boundary validation, and TRUTHFUL degrade (client absent / invoke `!ok`
 *    ⇒ the handler throws the real reason, never a fabricated model answer).
 *
 * The pal-comms binder stays a thin parallel surface over the frozen
 * `EngineClientPort.invoke({ op:'agentcomms' })` transport (the backend
 * consensus/debate path lives on the `PalBrainService` facet, not here).
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { EngineClientPort, EngineCall } from '../../ports/engine-client.port.js';
import { down, ok, fail, type InvokeResult } from '../../types.js';
import { buildAgentCommsArgs, palCommsEngineBinder, recoderPalCommsServer } from './pal-comms.binder.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

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
