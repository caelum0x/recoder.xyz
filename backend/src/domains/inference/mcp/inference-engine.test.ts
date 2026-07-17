/**
 * `mcp/inference-engine` — verifies the `inference.embed` MCP tool: it is
 * registered (tools + gated-registry descriptor stay in sync), routes a valid
 * call through the routing service's embed seam, validates input at the
 * boundary (never touching the service on a malformed call), and passes a
 * degraded result through truthfully (never fabricated vectors).
 */
import { describe, it, expect, vi } from 'vitest';
import { buildInferenceMcpTools, inferenceMcpServer, type InferenceMcpDeps } from './inference-engine.js';
import type { EmbeddingResult } from '../types.js';

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
  it('routes a valid call through the embed seam with the parsed input', async () => {
    const deps = depsOf(ROUTED);
    const out = await embedTool(deps).handler({
      model: ' text-embedding-3-small ',
      input: ['a', 'b'],
      requestedBy: 'u1',
    });
    expect(out).toEqual({ result: ROUTED });
    expect(deps.embed).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['a', 'b'],
      userId: 'u1',
    });
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
