/**
 * Pure composer contract for the openfang agent-runtime introspection views:
 *  - `composeHandIntrospection` joins Hand definitions (tools/skills/MCP) with
 *    live instances, and totals distinct tools,
 *  - `composeAgentRunStatus` folds the four per-agent reads into one snapshot,
 *    degrading each slice independently,
 *  - both are TOTAL: malformed/partial replies never throw.
 */
import { describe, it, expect } from 'vitest';
import { composeAgentRunStatus, composeHandIntrospection } from './openfang-introspect.js';

describe('composeHandIntrospection', () => {
  const defs = {
    ok: true,
    hands: [
      {
        id: 'clip',
        name: 'Clip',
        description: 'clips things',
        category: 'media',
        icon: '✂️',
        tools: ['fs.read', 'fs.write'],
        skills: ['editing'],
        mcp_servers: ['recoder'],
        settings: [{ key: 'quality' }],
        requires: [{ kind: 'env' }],
      },
      { id: 'scout', name: 'Scout', description: 'scouts', tools: ['web.search'], skills: [], mcp_servers: [] },
    ],
  };
  const active = {
    ok: true,
    hands: [
      { instance_id: 'i1', hand_id: 'clip', status: 'Active', agent_id: 'agent_1', agent_name: 'clip-1' },
      { instance_id: 'i2', hand_id: 'clip', status: { Error: 'boom' }, agent_name: 'clip-2' },
    ],
  };

  it('joins definitions with tools and their live instances', () => {
    const result = composeHandIntrospection(defs, active);
    expect(result.ok).toBe(true);
    expect(result.totals).toEqual({ definitions: 2, activeInstances: 2, distinctTools: 3 });

    const clip = result.hands.find((h) => h.id === 'clip')!;
    expect(clip.tools).toEqual(['fs.read', 'fs.write']);
    expect(clip.skills).toEqual(['editing']);
    expect(clip.mcpServers).toEqual(['recoder']);
    expect(clip.settingsCount).toBe(1);
    expect(clip.requiresCount).toBe(1);
    expect(clip.activeInstances).toHaveLength(2);
    expect(clip.activeInstances[0]).toMatchObject({ instanceId: 'i1', status: 'Active', agentId: 'agent_1' });
    // The HandStatus::Error variant normalizes to "Error: <msg>".
    expect(clip.activeInstances[1]?.status).toBe('Error: boom');

    const scout = result.hands.find((h) => h.id === 'scout')!;
    expect(scout.activeInstances).toEqual([]);
  });

  it('is total on malformed replies (never throws, yields empty)', () => {
    expect(composeHandIntrospection(null, undefined)).toEqual({
      ok: true,
      hands: [],
      totals: { definitions: 0, activeInstances: 0, distinctTools: 0 },
    });
    expect(composeHandIntrospection({ ok: false, error: 'x' }, { hands: 'nope' }).hands).toEqual([]);
  });
});

describe('composeAgentRunStatus', () => {
  const agents = { ok: true, agents: [{ id: 'agent_1', name: 'demo', state: 'running' }] };

  it('folds state + context + usage + sessions into one snapshot', () => {
    const result = composeAgentRunStatus(
      'agent_1',
      agents,
      { ok: true, report: { tokens: 42 } },
      { ok: true, input_tokens: 10, output_tokens: 20, cost: 0.5 },
      { ok: true, sessions: [{ id: 's1' }, { id: 's2' }] },
    );
    expect(result).toMatchObject({
      ok: true,
      agentId: 'agent_1',
      name: 'demo',
      state: 'running',
      context: { available: true, report: { tokens: 42 } },
      usage: { available: true, inputTokens: 10, outputTokens: 20, cost: 0.5 },
      sessions: { available: true, count: 2 },
    });
  });

  it('degrades each per-agent slice independently on failure', () => {
    const result = composeAgentRunStatus(
      'agent_1',
      agents,
      { ok: false, error: 'no session' },
      { ok: false, error: 'metering off' },
      { ok: true, sessions: [] },
    );
    expect(result.context).toEqual({ available: false, reason: 'no session' });
    expect(result.usage).toEqual({ available: false, reason: 'metering off' });
    expect(result.sessions).toMatchObject({ available: true, count: 0 });
    // Name/state still resolved from the agent registry.
    expect(result).toMatchObject({ name: 'demo', state: 'running' });
  });

  it('is total when the agent is unknown / replies are malformed', () => {
    const result = composeAgentRunStatus('ghost', null, null, undefined, 'nope');
    expect(result.agentId).toBe('ghost');
    expect(result.name).toBeUndefined();
    expect(result.context.available).toBe(false);
    expect(result.usage.available).toBe(false);
    expect(result.sessions.available).toBe(false);
  });
});
