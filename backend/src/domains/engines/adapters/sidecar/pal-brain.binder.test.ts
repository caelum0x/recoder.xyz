/**
 * Contract tests for the `recoder.pal-brain` facet verdict surface:
 *  - `parseVerdictRequest`   — the boundary validator (prompt required, flat
 *    `models: string[]`, snake_case aliases, bad input throws the exact problem).
 *  - `palVerdictEngineBinder` — the two MCP handlers over a fake `PalVerdictFacet`:
 *    correct delegation to `consensus`/`debate`, the deny-biased verdict surfaced
 *    verbatim as tool content, and TRUTHFUL DEGRADE (null facet throws; a facet
 *    `abstain` is surfaced as content, NOT thrown — the facet is degrade-safe).
 *
 * This is the PARALLEL decision surface to `recoder.pal-comms` (raw answers): the
 * verdict tools return the facet's `{recommendation,reason,models,degraded,engine}`.
 */
import { describe, it, expect } from 'vitest';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type {
  PalConsensusRequest,
  PalConsensusResult,
} from '../../ports/pal-brain.port.js';
import {
  palVerdictEngineBinder,
  parseVerdictRequest,
  recoderPalBrainServer,
  type PalVerdictFacet,
} from './pal-brain.binder.js';

/** A fake facet recording every call and returning a fixed verdict per verb. */
function fakeFacet(verdict: PalConsensusResult): {
  facet: PalVerdictFacet;
  consensusCalls: PalConsensusRequest[];
  debateCalls: PalConsensusRequest[];
} {
  const consensusCalls: PalConsensusRequest[] = [];
  const debateCalls: PalConsensusRequest[] = [];
  return {
    consensusCalls,
    debateCalls,
    facet: {
      async consensus(req) {
        consensusCalls.push(req);
        return verdict;
      },
      async debate(req) {
        debateCalls.push(req);
        return verdict;
      },
    },
  };
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
      const handler = handlers.get(`${recoderPalBrainServer.serverId}:${tool}`);
      if (!handler) throw new Error(`no handler for ${tool}`);
      return (await handler({ args })) as { content: unknown; metadata?: unknown };
    },
    tools: () => [...handlers.keys()],
  };
}

const ALLOW: PalConsensusResult = {
  recommendation: 'allow',
  reason: 'consensus cleared it',
  models: ['flash', 'pro'],
  degraded: false,
  engine: 'pal-mcp',
};

const ABSTAIN: PalConsensusResult = {
  recommendation: 'abstain',
  reason: 'pal consensus timed out',
  models: [],
  degraded: true,
  engine: 'synthetic',
};

describe('parseVerdictRequest', () => {
  it('parses prompt + systemPrompt (snake_case) + models + timeoutMs', () => {
    const req = parseVerdictRequest(
      { prompt: 'ship it?', system_prompt: 'be terse', models: ['a', 'b'], timeout_ms: 5000 },
      'pal.consensus_verdict',
    );
    expect(req).toEqual({ prompt: 'ship it?', systemPrompt: 'be terse', models: ['a', 'b'], timeoutMs: 5000 });
  });

  it('omits models when absent and a non-positive/non-finite timeout', () => {
    const req = parseVerdictRequest({ prompt: 'q', timeoutMs: 0 }, 'pal.debate_verdict');
    expect(req).toEqual({ prompt: 'q' });
    expect(req).not.toHaveProperty('models');
    expect(req).not.toHaveProperty('timeoutMs');
  });

  it('rejects a missing/blank prompt', () => {
    expect(() => parseVerdictRequest({}, 'pal.consensus_verdict')).toThrow(/requires a non-empty string args\.prompt/);
    expect(() => parseVerdictRequest({ prompt: '   ' }, 'pal.consensus_verdict')).toThrow(/args\.prompt/);
  });

  it('rejects a non-array models arg and empty model names', () => {
    expect(() => parseVerdictRequest({ prompt: 'q', models: 'a' }, 'pal.consensus_verdict')).toThrow(/must be an array/);
    expect(() => parseVerdictRequest({ prompt: 'q', models: ['a', ''] }, 'pal.consensus_verdict')).toThrow(/empty or non-string/);
  });
});

describe('palVerdictEngineBinder', () => {
  it('registers both recoder.pal-brain verdict tools', () => {
    const cap = captureRouter();
    palVerdictEngineBinder(fakeFacet(ALLOW).facet)(cap.router);
    expect(cap.tools().sort()).toEqual(
      ['recoder.pal-brain:pal.consensus_verdict', 'recoder.pal-brain:pal.debate_verdict'].sort(),
    );
  });

  it('pal.consensus_verdict delegates to facet.consensus and returns the verdict verbatim', async () => {
    const { facet, consensusCalls } = fakeFacet(ALLOW);
    const cap = captureRouter();
    palVerdictEngineBinder(facet)(cap.router);
    const res = await cap.call('pal.consensus_verdict', { prompt: 'ship it?', models: ['flash'] });
    expect(consensusCalls).toEqual([{ prompt: 'ship it?', models: ['flash'] }]);
    expect(res.content).toEqual(ALLOW);
    expect(res.metadata).toMatchObject({ engine: 'pal-brain', tool: 'pal.consensus_verdict' });
  });

  it('pal.debate_verdict delegates to facet.debate', async () => {
    const { facet, debateCalls } = fakeFacet(ALLOW);
    const cap = captureRouter();
    palVerdictEngineBinder(facet)(cap.router);
    const res = await cap.call('pal.debate_verdict', { prompt: 'for or against?' });
    expect(debateCalls).toEqual([{ prompt: 'for or against?' }]);
    expect(res.content).toEqual(ALLOW);
  });

  it('TRUTHFUL DEGRADE: a facet abstain is surfaced as content, never thrown', async () => {
    const cap = captureRouter();
    palVerdictEngineBinder(fakeFacet(ABSTAIN).facet)(cap.router);
    const res = await cap.call('pal.consensus_verdict', { prompt: 'q' });
    expect(res.content).toEqual(ABSTAIN);
  });

  it('TRUTHFUL DEGRADE: a null facet throws the real reason (never a fabricated verdict)', async () => {
    const cap = captureRouter();
    palVerdictEngineBinder(null)(cap.router);
    await expect(cap.call('pal.consensus_verdict', { prompt: 'q' })).rejects.toThrow(/facet not bound/);
  });

  it('rejects a missing prompt at the handler boundary', async () => {
    const cap = captureRouter();
    palVerdictEngineBinder(fakeFacet(ALLOW).facet)(cap.router);
    await expect(cap.call('pal.debate_verdict', {})).rejects.toThrow(/requires a non-empty string args\.prompt/);
  });
});
