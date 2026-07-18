/**
 * `mcp/inference-engine` — verifies the inference MCP tools: they are registered
 * (tools + gated-registry descriptor stay in sync), route valid calls through the
 * routing service, validate input at the boundary (never touching the service on
 * a malformed call), and pass degraded results through truthfully (never
 * fabricated vectors).
 *
 * SECURITY: `inference.complete` / `.embed` / `.feedback` attribute quota + spend
 * to the HOST-AUTHORIZED, edge-bound caller (2nd handler param), NEVER to a
 * caller-supplied `args.requestedBy` — asserted here to prove the cross-tenant
 * quota-drain / spend-misattribution hole stays closed.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildInferenceMcpTools, inferenceMcpServer, type InferenceMcpDeps } from './inference-engine.js';
import type { EmbeddingResult, InferenceResult, FeedbackResult } from '../types.js';

const ROUTED: EmbeddingResult = {
  routed: true,
  tier: 'napi',
  model: 'text-embedding-3-small',
  embeddings: [[0.1, 0.2]],
  usage: { inputTokens: 3 },
};

function depsOf(result: EmbeddingResult): InferenceMcpDeps & { embed: ReturnType<typeof vi.fn> } {
  const embed = vi.fn(async () => result);
  return {
    gateway: {
      complete: vi.fn(),
      completeStream: vi.fn(),
      embed: vi.fn(),
      feedback: vi.fn(),
      health: vi.fn(),
    } as unknown as InferenceMcpDeps['gateway'],
    catalog: { list: vi.fn(async () => []) } as unknown as InferenceMcpDeps['catalog'],
    routing: { complete: vi.fn(), embed, feedback: vi.fn() } as unknown as InferenceMcpDeps['routing'],
    embed,
  };
}

function embedTool(deps: InferenceMcpDeps) {
  const tool = buildInferenceMcpTools(deps).find((t) => t.name === 'inference.embed');
  if (!tool) throw new Error('inference.embed tool not registered');
  return tool;
}

describe('inference.embed registration', () => {
  it('registers the tool and keeps the server descriptor toolNames in sync', () => {
    const names = buildInferenceMcpTools(depsOf(ROUTED)).map((t) => t.name);
    expect(names).toContain('inference.embed');
    expect(inferenceMcpServer.toolNames).toEqual(names);
  });
});

describe('inference.embed handler', () => {
  it('routes a valid call through the embed seam with the parsed input, attributing the edge-bound caller', async () => {
    const deps = depsOf(ROUTED);
    const out = await embedTool(deps).handler(
      { model: ' text-embedding-3-small ', input: ['a', 'b'] },
      { userId: 'u1' },
    );
    expect(out).toEqual({ result: ROUTED });
    expect(deps.embed).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['a', 'b'],
      userId: 'u1',
    });
  });

  it('SECURITY: attributes usage to the edge-bound caller, NEVER a caller-supplied requestedBy (cross-tenant drain)', async () => {
    const deps = depsOf(ROUTED);
    // Attacker (caller `attacker`) tries to bill a victim via args.requestedBy.
    await embedTool(deps).handler(
      { model: 'text-embedding-3-small', input: 'hi', requestedBy: 'victim-user-id' },
      { userId: 'attacker' },
    );
    expect(deps.embed).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'hi',
      userId: 'attacker',
    });
    // The victim id must never reach the routing/quota/metering seam.
    expect(deps.embed.mock.calls[0]?.[0]).not.toMatchObject({ userId: 'victim-user-id' });
  });

  it('SECURITY: leaves the call unattributed (no userId) when there is no edge-bound caller, even if requestedBy is supplied', async () => {
    const deps = depsOf(ROUTED);
    await embedTool(deps).handler({ model: 'text-embedding-3-small', input: 'hi', requestedBy: 'victim-user-id' });
    expect(deps.embed).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'hi' });
  });

  it('rejects a missing model / malformed input without touching the service', async () => {
    const deps = depsOf(ROUTED);
    const tool = embedTool(deps);
    expect(await tool.handler({ input: 'hi' })).toEqual({ error: 'model (string) is required' });
    expect(await tool.handler({ model: 'm' })).toMatchObject({ error: expect.stringContaining('input') });
    expect(await tool.handler({ model: 'm', input: [] })).toMatchObject({ error: expect.stringContaining('input') });
    expect(await tool.handler({ model: 'm', input: ['ok', 1] })).toMatchObject({
      error: expect.stringContaining('input'),
    });
    expect(deps.embed).not.toHaveBeenCalled();
  });

  it('passes a degraded { routed:false, reason } result through truthfully', async () => {
    const degraded: EmbeddingResult = {
      routed: false,
      tier: 'none',
      model: 'm',
      embeddings: null,
      reason: 'no embedding tier available',
    };
    const deps = depsOf(degraded);
    const out = await embedTool(deps).handler({ model: 'm', input: 'hi' });
    expect(out).toEqual({ result: degraded });
  });
});

describe('inference.complete / inference.feedback tenant attribution', () => {
  const COMPLETION: InferenceResult = {
    routed: true,
    tier: 'napi',
    model: 'gpt-x',
    content: 'ok',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  };
  const FEEDBACK: FeedbackResult = {
    routed: true,
    tier: 'napi',
    inferenceId: 'inf1',
    metricName: 'thumbs',
    feedbackId: 'fb1',
  };

  function completeDeps() {
    const complete = vi.fn(async () => COMPLETION);
    const deps = {
      gateway: {} as unknown as InferenceMcpDeps['gateway'],
      catalog: {} as unknown as InferenceMcpDeps['catalog'],
      routing: { complete, embed: vi.fn(), feedback: vi.fn() } as unknown as InferenceMcpDeps['routing'],
    };
    return { deps, complete };
  }

  function feedbackDeps() {
    const feedback = vi.fn(async () => FEEDBACK);
    const deps = {
      gateway: {} as unknown as InferenceMcpDeps['gateway'],
      catalog: {} as unknown as InferenceMcpDeps['catalog'],
      routing: { complete: vi.fn(), embed: vi.fn(), feedback } as unknown as InferenceMcpDeps['routing'],
    };
    return { deps, feedback };
  }

  function toolNamed(deps: InferenceMcpDeps, name: string) {
    const tool = buildInferenceMcpTools(deps).find((t) => t.name === name);
    if (!tool) throw new Error(`${name} tool not registered`);
    return tool;
  }

  it('SECURITY: inference.complete attributes usage/spend to the edge-bound caller, not args.requestedBy', async () => {
    const { deps, complete } = completeDeps();
    await toolNamed(deps, 'inference.complete').handler(
      { model: 'gpt-x', messages: [{ role: 'user', content: 'hi' }], requestedBy: 'victim-user-id' },
      { userId: 'attacker' },
    );
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-x', userId: 'attacker' }),
    );
    expect(complete.mock.calls[0]?.[0]).not.toMatchObject({ userId: 'victim-user-id' });
  });

  it('SECURITY: inference.feedback attributes to the edge-bound caller, not args.requestedBy', async () => {
    const { deps, feedback } = feedbackDeps();
    await toolNamed(deps, 'inference.feedback').handler(
      { inferenceId: 'inf1', metricName: 'thumbs', value: true, requestedBy: 'victim-user-id' },
      { userId: 'attacker' },
    );
    expect(feedback).toHaveBeenCalledWith(
      expect.objectContaining({ inferenceId: 'inf1', metricName: 'thumbs', value: true, userId: 'attacker' }),
    );
    expect(feedback.mock.calls[0]?.[0]).not.toMatchObject({ userId: 'victim-user-id' });
  });
});
