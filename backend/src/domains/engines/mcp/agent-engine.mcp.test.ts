/**
 * Tests for the agent-engine MCP tools: the truthful facet-null degrade on every
 * tool (never a throw, never fabricated success), the happy-path delegation onto
 * the {@link AgentEngineService} Hands lifecycle + publishEvent verbs, the
 * input-validation failures that never touch the service, the identity gate on
 * every MUTATING tool (absent caller ⇒ refuse, service never invoked), and the
 * six-tool registration shape under the `agent-engine` server id.
 */
import { describe, it, expect, vi } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { AgentEngineService } from '../ports/agent-engine.port.js';
import {
  AGENT_ENGINE_MCP_SERVER_ID,
  AGENT_ENGINE_UNAVAILABLE,
  buildAgentEngineMcpTools,
} from './agent-engine.mcp.js';

const caller: McpToolCaller = { userId: 'u1', scopes: ['read', 'write'] };

/** The six verbs the tools bind — the rest of the facet is out of scope here. */
type HandFacet = Pick<
  AgentEngineService,
  'hands' | 'activateHand' | 'pauseHand' | 'resumeHand' | 'deactivateHand' | 'publishEvent'
>;

function fakeEngine(overrides: Partial<HandFacet> = {}): AgentEngineService {
  const base: HandFacet = {
    hands: async () => ({ hands: [], active: [] }),
    activateHand: async () => ({ ok: true, instanceId: 'inst-1' }),
    pauseHand: async () => true,
    resumeHand: async () => true,
    deactivateHand: async () => true,
    publishEvent: async () => [],
  };
  return { ...base, ...overrides } as AgentEngineService;
}

function toolsWith(engine: AgentEngineService | null) {
  const tools = buildAgentEngineMcpTools(() => engine);
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    handsList: byName.get('agent_engine_hands_list')!,
    activate: byName.get('agent_engine_hand_activate')!,
    pause: byName.get('agent_engine_hand_pause')!,
    resume: byName.get('agent_engine_hand_resume')!,
    deactivate: byName.get('agent_engine_hand_deactivate')!,
    publish: byName.get('agent_engine_publish_event')!,
  };
}

describe('agent-engine MCP tools — registration shape', () => {
  it('declares six uniquely-named tools under the agent-engine server id', () => {
    expect(AGENT_ENGINE_MCP_SERVER_ID).toBe('agent-engine');
    const names = buildAgentEngineMcpTools(() => null).map((t) => t.name);
    expect(names).toEqual([
      'agent_engine_hands_list',
      'agent_engine_hand_activate',
      'agent_engine_hand_pause',
      'agent_engine_hand_resume',
      'agent_engine_hand_deactivate',
      'agent_engine_publish_event',
    ]);
    expect(new Set(names).size).toBe(6);
  });

  it('states the write nature of every mutating tool in its description', () => {
    const byName = new Map(buildAgentEngineMcpTools(() => null).map((t) => [t.name, t]));
    for (const name of [
      'agent_engine_hand_activate',
      'agent_engine_hand_pause',
      'agent_engine_hand_resume',
      'agent_engine_hand_deactivate',
      'agent_engine_publish_event',
    ]) {
      expect(byName.get(name)!.description).toMatch(/WRITE/);
    }
    expect(byName.get('agent_engine_hands_list')!.description).toMatch(/READ-ONLY/);
  });
});

describe('facet-null degrade — truthful, never a throw', () => {
  it('degrades every tool with the truthful unavailable reason', async () => {
    const tools = toolsWith(null);
    const degraded = { ok: false, reason: AGENT_ENGINE_UNAVAILABLE };
    await expect(tools.handsList.handler({}, caller)).resolves.toEqual(degraded);
    await expect(tools.activate.handler({ handId: 'h1' }, caller)).resolves.toEqual(degraded);
    await expect(tools.pause.handler({ instanceId: 'i1' }, caller)).resolves.toEqual(degraded);
    await expect(tools.resume.handler({ instanceId: 'i1' }, caller)).resolves.toEqual(degraded);
    await expect(tools.deactivate.handler({ instanceId: 'i1' }, caller)).resolves.toEqual(degraded);
    await expect(tools.publish.handler({ event: { type: 'x' } }, caller)).resolves.toEqual(degraded);
  });

  it('resolves the facet lazily per call (a late-bound engine is picked up)', async () => {
    let engine: AgentEngineService | null = null;
    const tools = buildAgentEngineMcpTools(() => engine);
    const handsList = tools.find((t) => t.name === 'agent_engine_hands_list')!;
    await expect(handsList.handler({}, caller)).resolves.toEqual({
      ok: false,
      reason: AGENT_ENGINE_UNAVAILABLE,
    });
    engine = fakeEngine();
    await expect(handsList.handler({}, caller)).resolves.toEqual({ ok: true, hands: [], active: [] });
  });
});

describe('happy-path delegation', () => {
  it('hands_list projects hands + active from the service view', async () => {
    const hands = [{ id: 'h1', activeInstances: [{ instanceId: 'i1' }] }];
    const active = [{ instanceId: 'i1' }];
    const handsSpy = vi.fn(async () => ({ hands, active }));
    const { handsList } = toolsWith(fakeEngine({ hands: handsSpy }));
    await expect(handsList.handler({}, undefined)).resolves.toEqual({ ok: true, hands, active });
    expect(handsSpy).toHaveBeenCalledOnce();
  });

  it('hand_activate forwards the trimmed handId and returns the instanceId', async () => {
    const activateSpy = vi.fn(async () => ({ ok: true as const, instanceId: 'inst-9' }));
    const { activate } = toolsWith(fakeEngine({ activateHand: activateSpy }));
    await expect(activate.handler({ handId: ' h9 ' }, caller)).resolves.toEqual({
      ok: true,
      instanceId: 'inst-9',
    });
    expect(activateSpy).toHaveBeenCalledWith('h9');
  });

  it('pause/resume/deactivate forward the instanceId and report ok truthfully', async () => {
    const pauseSpy = vi.fn(async () => true);
    const resumeSpy = vi.fn(async () => true);
    const deactivateSpy = vi.fn(async () => true);
    const { pause, resume, deactivate } = toolsWith(
      fakeEngine({ pauseHand: pauseSpy, resumeHand: resumeSpy, deactivateHand: deactivateSpy }),
    );
    await expect(pause.handler({ instanceId: 'i2' }, caller)).resolves.toEqual({ ok: true });
    await expect(resume.handler({ instanceId: 'i2' }, caller)).resolves.toEqual({ ok: true });
    await expect(deactivate.handler({ instanceId: 'i2' }, caller)).resolves.toEqual({ ok: true });
    expect(pauseSpy).toHaveBeenCalledWith('i2');
    expect(resumeSpy).toHaveBeenCalledWith('i2');
    expect(deactivateSpy).toHaveBeenCalledWith('i2');
  });

  it('a false lifecycle write surfaces as a truthful { ok:false, reason }', async () => {
    const { pause } = toolsWith(fakeEngine({ pauseHand: async () => false }));
    const out = (await pause.handler({ instanceId: 'i3' }, caller)) as Record<string, unknown>;
    expect(out.ok).toBe(false);
    expect(typeof out.reason).toBe('string');
    expect(out.reason).toMatch(/refused|failed|unavailable/i);
  });

  it('a failed activate surfaces the service reason unchanged', async () => {
    const { activate } = toolsWith(
      fakeEngine({ activateHand: async () => ({ ok: false, reason: 'unknown hand' }) }),
    );
    await expect(activate.handler({ handId: 'h1' }, caller)).resolves.toEqual({
      ok: false,
      reason: 'unknown hand',
    });
  });

  it('publish_event forwards the event object and projects the fired agents', async () => {
    const fired = [{ agentId: 'a1', message: 'ping' }];
    const publishSpy = vi.fn(async () => fired);
    const { publish } = toolsWith(fakeEngine({ publishEvent: publishSpy }));
    await expect(publish.handler({ event: { type: 'deploy' } }, caller)).resolves.toEqual({
      ok: true,
      fired,
      count: 1,
    });
    expect(publishSpy).toHaveBeenCalledWith({ type: 'deploy' });
  });
});

describe('input validation — truthful failure, service never invoked', () => {
  it('hand_activate without a handId', async () => {
    const activateSpy = vi.fn(async () => ({ ok: true as const }));
    const { activate } = toolsWith(fakeEngine({ activateHand: activateSpy }));
    await expect(activate.handler({}, caller)).resolves.toEqual({ ok: false, reason: 'handId required' });
    await expect(activate.handler({ handId: '  ' }, caller)).resolves.toEqual({
      ok: false,
      reason: 'handId required',
    });
    expect(activateSpy).not.toHaveBeenCalled();
  });

  it('pause/resume/deactivate without an instanceId', async () => {
    const pauseSpy = vi.fn(async () => true);
    const resumeSpy = vi.fn(async () => true);
    const deactivateSpy = vi.fn(async () => true);
    const { pause, resume, deactivate } = toolsWith(
      fakeEngine({ pauseHand: pauseSpy, resumeHand: resumeSpy, deactivateHand: deactivateSpy }),
    );
    const refused = { ok: false, reason: 'instanceId required' };
    await expect(pause.handler({}, caller)).resolves.toEqual(refused);
    await expect(resume.handler({ instanceId: 42 }, caller)).resolves.toEqual(refused);
    await expect(deactivate.handler(null, caller)).resolves.toEqual(refused);
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
    expect(deactivateSpy).not.toHaveBeenCalled();
  });

  it('publish_event without a plain event object', async () => {
    const publishSpy = vi.fn(async () => []);
    const { publish } = toolsWith(fakeEngine({ publishEvent: publishSpy }));
    const refused = { ok: false, reason: 'event object required' };
    await expect(publish.handler({}, caller)).resolves.toEqual(refused);
    await expect(publish.handler({ event: 'deploy' }, caller)).resolves.toEqual(refused);
    await expect(publish.handler({ event: ['x'] }, caller)).resolves.toEqual(refused);
    expect(publishSpy).not.toHaveBeenCalled();
  });
});

describe('identity gate — mutating tools refuse an absent caller', () => {
  it('refuses with AUTH_REQUIRED and never invokes the service', async () => {
    const activateSpy = vi.fn(async () => ({ ok: true as const }));
    const pauseSpy = vi.fn(async () => true);
    const resumeSpy = vi.fn(async () => true);
    const deactivateSpy = vi.fn(async () => true);
    const publishSpy = vi.fn(async () => []);
    const tools = toolsWith(
      fakeEngine({
        activateHand: activateSpy,
        pauseHand: pauseSpy,
        resumeHand: resumeSpy,
        deactivateHand: deactivateSpy,
        publishEvent: publishSpy,
      }),
    );
    const mutating = [
      { tool: tools.activate, args: { handId: 'h1' } },
      { tool: tools.pause, args: { instanceId: 'i1' } },
      { tool: tools.resume, args: { instanceId: 'i1' } },
      { tool: tools.deactivate, args: { instanceId: 'i1' } },
      { tool: tools.publish, args: { event: { type: 'x' } } },
    ];
    for (const { tool, args } of mutating) {
      await expect(tool.handler(args, undefined)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
      await expect(tool.handler(args, { userId: '  ' })).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      });
    }
    expect(activateSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
    expect(deactivateSpy).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('hands_list is a read and stays callable without a caller identity', async () => {
    const { handsList } = toolsWith(fakeEngine());
    await expect(handsList.handler({}, undefined)).resolves.toEqual({ ok: true, hands: [], active: [] });
  });
});
