/**
 * Conductor WRITE MCP tools — steer / stop / advance exposed as governed tools.
 *
 * Proves: each tool BINDS to the module's already-gated write method with a
 * service principal synthesized from `actorId`; a non-`allow` verdict flows back as
 * `{ ok:false, gated:true }` (no faked mutation); bad input fails fast BEFORE any
 * module call; and `conductor_advance` rejects non-advance targets.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace, WorkspaceState } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { GateVerdict } from '../ports/index.js';
import type { SteerInput } from '../types.js';
import type { ConductorWriteResult } from '../conductor-module.js';
import { buildConductorWriteTools, type ConductorWriteSurface } from './conductor-write-tools.js';

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'low',
    reason: effect === 'allow' ? 'allowed' : `${effect} by policy`,
    degraded: false,
    engine: 'ts',
    createdAt: new Date().toISOString(),
  };
}

interface Recorded {
  steer: { input: SteerInput; principal: Principal }[];
  stop: { id: string; principal: Principal }[];
  advance: { id: string; to: WorkspaceState; principal: Principal }[];
}

/** A recording write surface whose verdict effect is configurable per instance. */
function makeSurface(effect: GateVerdict['effect'] = 'allow'): {
  surface: ConductorWriteSurface;
  calls: Recorded;
} {
  const calls: Recorded = { steer: [], stop: [], advance: [] };
  const allowed = effect === 'allow';
  const result = <T>(value?: T): ConductorWriteResult<T> => ({
    ok: allowed,
    verdict: verdict(effect),
    ...(allowed && value !== undefined ? { value } : {}),
    ...(allowed ? {} : { reason: `${effect} by policy` }),
  });
  const surface: ConductorWriteSurface = {
    async steerWorkspace(input, principal) {
      calls.steer.push({ input, principal });
      return result<void>();
    },
    async stopWorkspace(id, principal) {
      calls.stop.push({ id, principal });
      return result<Workspace>({ workspaceId: id, state: 'cancelled' } as Workspace);
    },
    async advanceWorkspaceState(id, to, principal) {
      calls.advance.push({ id, to, principal });
      return result<Workspace>({ workspaceId: id, state: to } as Workspace);
    },
  };
  return { surface, calls };
}

function toolByName(surface: ConductorWriteSurface, name: string) {
  const tool = buildConductorWriteTools(surface).find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe('conductor write MCP tools', () => {
  it('registers exactly the steer/stop/advance write tools', () => {
    const { surface } = makeSurface();
    const names = buildConductorWriteTools(surface).map((t) => t.name);
    expect(names).toEqual(['conductor_steer', 'conductor_stop', 'conductor_advance']);
  });

  it('conductor_steer binds to steerWorkspace with a service principal from actorId', async () => {
    const { surface, calls } = makeSurface('allow');
    const res = (await toolByName(surface, 'conductor_steer').handler({
      actorId: 'agent-7',
      workspaceId: 'ws-1',
      keys: 'run the tests',
      submit: false,
    })) as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(res.gated).toBe(false);
    expect(calls.steer).toHaveLength(1);
    expect(calls.steer[0]!.input).toEqual({ workspaceId: 'ws-1', keys: 'run the tests', submit: false });
    expect(calls.steer[0]!.principal).toMatchObject({ userId: 'agent-7', kind: 'internal' });
  });

  it('conductor_stop binds to stopWorkspace and returns the cancelled workspace', async () => {
    const { surface, calls } = makeSurface('allow');
    const res = (await toolByName(surface, 'conductor_stop').handler({
      actorId: 'agent-7',
      workspaceId: 'ws-2',
    })) as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(calls.stop).toEqual([{ id: 'ws-2', principal: expect.objectContaining({ userId: 'agent-7' }) }]);
    expect((res.value as Workspace).state).toBe('cancelled');
  });

  it('conductor_advance binds to advanceWorkspaceState for a legal target', async () => {
    const { surface, calls } = makeSurface('allow');
    const res = (await toolByName(surface, 'conductor_advance').handler({
      actorId: 'agent-7',
      workspaceId: 'ws-3',
      to: 'awaiting_review',
    })) as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(calls.advance).toEqual([
      { id: 'ws-3', to: 'awaiting_review', principal: expect.objectContaining({ userId: 'agent-7' }) },
    ]);
  });

  it('surfaces a denied verdict as ok:false + gated (no faked mutation)', async () => {
    const { surface, calls } = makeSurface('deny');
    const res = (await toolByName(surface, 'conductor_steer').handler({
      actorId: 'agent-7',
      workspaceId: 'ws-1',
      keys: 'x',
    })) as Record<string, unknown>;

    expect(res.ok).toBe(false);
    expect(res.gated).toBe(true);
    expect((res.verdict as GateVerdict).effect).toBe('deny');
    // The method IS invoked (it self-gates); the point is the tool never fakes ok:true.
    expect(calls.steer).toHaveLength(1);
  });

  it('treats needs_approval as gated (ok:false)', async () => {
    const { surface } = makeSurface('needs_approval');
    const res = (await toolByName(surface, 'conductor_stop').handler({
      actorId: 'a',
      workspaceId: 'ws-1',
    })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.gated).toBe(true);
  });

  it('fails fast on missing input BEFORE calling the module', async () => {
    const { surface, calls } = makeSurface('allow');

    const noActor = (await toolByName(surface, 'conductor_steer').handler({
      workspaceId: 'ws-1',
      keys: 'x',
    })) as Record<string, unknown>;
    expect(noActor).toEqual({ ok: false, error: 'actorId is required' });

    const noWs = (await toolByName(surface, 'conductor_stop').handler({ actorId: 'a' })) as Record<string, unknown>;
    expect(noWs).toEqual({ ok: false, error: 'workspaceId is required' });

    const noKeys = (await toolByName(surface, 'conductor_steer').handler({
      actorId: 'a',
      workspaceId: 'ws-1',
      keys: '   ',
    })) as Record<string, unknown>;
    expect(noKeys).toEqual({ ok: false, error: 'keys is required' });

    expect(calls.steer).toHaveLength(0);
    expect(calls.stop).toHaveLength(0);
  });

  it('conductor_advance rejects a non-advance target (delivery states own their edges)', async () => {
    const { surface, calls } = makeSurface('allow');
    const res = (await toolByName(surface, 'conductor_advance').handler({
      actorId: 'a',
      workspaceId: 'ws-1',
      to: 'merged',
    })) as Record<string, unknown>;

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/to must be one of/);
    expect(calls.advance).toHaveLength(0);
  });
});
