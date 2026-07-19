/**
 * The coordination MCP tools (`coordination_squad_routing`, `coordination_status`,
 * `coordination_conflicts`, `coordination_request_reroute`) expose the Multica
 * squad/work-lock fabric and one GOVERNED write. These tests pin the load-bearing
 * behaviour with the engine + gate seams MOCKED (no network, no live Multica):
 *   - every tool REFUSES an anonymous caller (`AUTH_REQUIRED`);
 *   - reads pass the seam's TRUTHFUL degrade (`available:false`) straight through;
 *   - the reroute write is BLOCKED on a gate deny (no engine call) and only routes
 *     on a gate allow;
 *   - a down engine degrades the write to `{ ok:false, routed:false }`, never faked.
 * LIVE PATH: with `MULTICA_URL` set the composer wires `MulticaCoordinationAdapter`
 * (covered by `multica-coordination.adapter.test.ts`).
 */
import { describe, it, expect, vi } from 'vitest';
import { buildCoordinationMcpTools } from '../mcp/coordination-engine.js';
import type { AgentOsGovernanceGate, AgentOsGateDecision } from '../adapters/governance-gate.adapter.js';
import type { CoordinationEnginePort } from '../ports/coordination-engine.port.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;
const caller: McpToolCaller = { userId: 'user-a' };

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

function allowGate(): AgentOsGovernanceGate {
  return { guard: async () => ({ allowed: true, effect: 'allow', reason: 'ok', degraded: false }) };
}

function denyGate(): AgentOsGovernanceGate {
  const decision: AgentOsGateDecision = { allowed: false, effect: 'deny', reason: 'policy blocked', degraded: false };
  return { guard: async () => decision };
}

function upEngine(overrides: Partial<CoordinationEnginePort> = {}): CoordinationEnginePort {
  return {
    routingStatus: async () => ({
      available: true,
      mode: 'external',
      squads: [{ squadId: 's1', name: 'Alpha', leaderId: 'agent-1', memberCount: 3 }],
    }),
    coordinationStatus: async () => ({
      available: true,
      mode: 'external',
      locks: [{ squadId: 's1', memberId: 'agent-1', memberType: 'agent', status: 'working', activeIssueIds: ['I-1'] }],
      workingCount: 1,
      idleCount: 0,
    }),
    conflictStatus: async () => ({
      available: true,
      mode: 'external',
      conflicts: [{ issueId: 'I-1', contenders: [{ squadId: 's1', memberId: 'agent-1' }, { squadId: 's1', memberId: 'agent-2' }] }],
    }),
    requestReroute: async () => ({ routed: true, issueId: 'I-1' }),
    ...overrides,
  };
}

function downEngine(): CoordinationEnginePort {
  const reason = 'Multica engine not configured (set MULTICA_URL; needs PG15)';
  return {
    routingStatus: async () => ({ available: false, mode: 'unconfigured', reason, squads: [] }),
    coordinationStatus: async () => ({ available: false, mode: 'unconfigured', reason, locks: [], workingCount: 0, idleCount: 0 }),
    conflictStatus: async () => ({ available: false, mode: 'unconfigured', reason, conflicts: [] }),
    requestReroute: async () => ({ routed: false, reason }),
  };
}

describe('coordination MCP tools — caller binding + degrade + governed write', () => {
  it('every tool refuses an anonymous caller (AUTH_REQUIRED)', async () => {
    const tools = buildCoordinationMcpTools({ engine: upEngine(), gate: allowGate(), logger: silentLogger });
    for (const name of ['coordination_squad_routing', 'coordination_status', 'coordination_conflicts', 'coordination_request_reroute']) {
      await expect(tool(tools, name).handler({ issueId: 'I-1' }, undefined)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    }
  });

  it('squad_routing passes the live routing view through', async () => {
    const tools = buildCoordinationMcpTools({ engine: upEngine(), gate: allowGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_squad_routing').handler({}, caller)) as { available: boolean; squads: unknown[] };
    expect(res.available).toBe(true);
    expect(res.squads).toHaveLength(1);
  });

  it('status surfaces the work-lock counts', async () => {
    const tools = buildCoordinationMcpTools({ engine: upEngine(), gate: allowGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_status').handler({}, caller)) as { workingCount: number; idleCount: number };
    expect(res.workingCount).toBe(1);
    expect(res.idleCount).toBe(0);
  });

  it('conflicts surfaces contended issues', async () => {
    const tools = buildCoordinationMcpTools({ engine: upEngine(), gate: allowGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_conflicts').handler({}, caller)) as { conflicts: { issueId: string }[] };
    expect(res.conflicts.map((c) => c.issueId)).toEqual(['I-1']);
  });

  it('reads degrade truthfully (available:false) when the engine is absent — never faked', async () => {
    const tools = buildCoordinationMcpTools({ engine: downEngine(), gate: allowGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_squad_routing').handler({}, caller)) as { available: boolean; squads: unknown[] };
    expect(res.available).toBe(false);
    expect(res.squads).toEqual([]);
  });

  it('reroute is BLOCKED on a gate deny and never calls the engine', async () => {
    const requestReroute = vi.fn<CoordinationEnginePort['requestReroute']>(async () => ({ routed: true, issueId: 'I-1' }));
    const tools = buildCoordinationMcpTools({ engine: upEngine({ requestReroute }), gate: denyGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_request_reroute').handler({ issueId: 'I-1' }, caller)) as {
      ok: boolean;
      effect: string;
    };
    expect(res.ok).toBe(false);
    expect(res.effect).toBe('deny');
    expect(requestReroute).not.toHaveBeenCalled();
  });

  it('reroute requires issueId', async () => {
    const tools = buildCoordinationMcpTools({ engine: upEngine(), gate: allowGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_request_reroute').handler({}, caller)) as { ok: boolean; error?: string };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/issueId/);
  });

  it('reroute routes on a gate allow (attributes the caller as owner)', async () => {
    const guard = vi.fn<AgentOsGovernanceGate['guard']>(async () => ({ allowed: true, effect: 'allow', reason: 'ok', degraded: false }));
    const tools = buildCoordinationMcpTools({ engine: upEngine(), gate: { guard }, logger: silentLogger });
    const res = (await tool(tools, 'coordination_request_reroute').handler({ issueId: 'I-1', reason: 'contended' }, caller)) as {
      ok: boolean;
      routed: boolean;
    };
    expect(res.ok).toBe(true);
    expect(res.routed).toBe(true);
    expect(guard).toHaveBeenCalledWith(
      'agent-os.coordination.reroute',
      expect.objectContaining({ ownerId: 'user-a', metadata: expect.objectContaining({ issueId: 'I-1', via: 'mcp' }) }),
    );
  });

  it('reroute degrades to { ok:false, routed:false } when the engine is down (gate allowed)', async () => {
    const tools = buildCoordinationMcpTools({ engine: downEngine(), gate: allowGate(), logger: silentLogger });
    const res = (await tool(tools, 'coordination_request_reroute').handler({ issueId: 'I-1' }, caller)) as {
      ok: boolean;
      routed: boolean;
      reason?: string;
    };
    expect(res.ok).toBe(false);
    expect(res.routed).toBe(false);
    expect(res.reason).toBeTruthy();
  });
});
