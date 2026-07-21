/**
 * Composition-root seam tests for the bootstrap → agent-os wiring
 * (`agent-os-seams.ts`): the opt-in squad-seed env parser and the squad-autopilot
 * → conductor dispatch adapter. `parseSquadSeedEnv` must be DEGRADE-TRUTHFUL —
 * absent / malformed env ⇒ `null` (seed OFF), never a fabricated squad; the
 * dispatch adapter launches through the real `createWorkspace` under a fixed
 * internal principal and surfaces a refused/faulted launch as `ok:false`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EnvSource } from './config.js';
import {
  parseSquadSeedEnv,
  createSquadAutopilotDispatch,
  type SquadAutopilotLauncher,
} from './agent-os-seams.js';

describe('parseSquadSeedEnv (opt-in squad seed)', () => {
  it('returns null when nothing is configured (seed OFF, pass-through)', () => {
    expect(parseSquadSeedEnv({} as EnvSource)).toBeNull();
  });

  it('returns null for a bare RECODER_SQUAD_ID with no members', () => {
    expect(parseSquadSeedEnv({ RECODER_SQUAD_ID: 'squad-a' } as EnvSource)).toBeNull();
  });

  it('parses a full RECODER_SQUAD_DEF JSON object', () => {
    const seed = parseSquadSeedEnv({
      RECODER_SQUAD_DEF: JSON.stringify({
        squadId: 'squad-a',
        displayName: 'Alpha',
        members: [{ agentId: 'agent-1', role: 'leader' }, { agentId: 'agent-2' }],
      }),
    } as EnvSource);
    expect(seed).toMatchObject({
      squadId: 'squad-a',
      displayName: 'Alpha',
      spaceId: 'space-default',
      routingStrategy: 'leader',
    });
    expect(seed?.members).toHaveLength(2);
  });

  it('parses RECODER_SQUAD_ID + members csv with weight + leader marking', () => {
    const seed = parseSquadSeedEnv({
      RECODER_SQUAD_ID: 'squad-b',
      RECODER_SQUAD_MEMBERS: 'agent-1:2, agent-2',
      RECODER_SQUAD_LEADER: 'agent-1',
      RECODER_SQUAD_NAME: 'Bravo',
      RECODER_SQUAD_SPACE: 'space-x',
      RECODER_SQUAD_STRATEGY: 'weighted',
    } as EnvSource);
    expect(seed).toMatchObject({
      squadId: 'squad-b',
      displayName: 'Bravo',
      spaceId: 'space-x',
      leaderAgentId: 'agent-1',
      routingStrategy: 'weighted',
    });
    expect(seed?.members).toEqual([
      { agentId: 'agent-1', role: 'leader', weight: 2 },
      { agentId: 'agent-2' },
    ]);
  });

  it('degrades to null (never throws) on a malformed RECODER_SQUAD_DEF', () => {
    expect(parseSquadSeedEnv({ RECODER_SQUAD_DEF: '{ not json' } as EnvSource)).toBeNull();
  });

  it('degrades to null when the seed fails schema validation (empty members ok, but no squadId)', () => {
    expect(
      parseSquadSeedEnv({ RECODER_SQUAD_DEF: JSON.stringify({ displayName: 'x' }) } as EnvSource),
    ).toBeNull();
  });
});

describe('createSquadAutopilotDispatch (autopilot over conductor createWorkspace)', () => {
  it('dispatches through createWorkspace under the fixed internal principal', async () => {
    const createWorkspace = vi.fn(async () => ({
      ok: true,
      value: { workspaceId: 'ws-1', runId: 'run-1' },
    }));
    const port = createSquadAutopilotDispatch({
      conductor: { createWorkspace } as unknown as SquadAutopilotLauncher,
      repoRoot: '/repo',
    });

    const res = await port.dispatch({ taskId: 'rec-1', title: 'T', prompt: 'do it' });

    expect(res).toEqual({ ok: true, workspaceId: 'ws-1', runId: 'run-1' });
    const [input, principal] = createWorkspace.mock.calls[0];
    expect(input).toMatchObject({
      spaceId: 'space-default',
      projectId: 'squad-autopilot',
      taskId: 'rec-1',
      repoPath: '/repo',
      runtimeId: 'claude_code',
      prompt: 'do it',
    });
    expect(input).not.toHaveProperty('metadata');
    expect(principal).toMatchObject({ userId: 'squad-autopilot', kind: 'internal' });
  });

  it('carries the routed agent onto the workspace metadata when present', async () => {
    const createWorkspace = vi.fn(async () => ({ ok: true, value: { workspaceId: 'ws-2' } }));
    const port = createSquadAutopilotDispatch({
      conductor: { createWorkspace } as unknown as SquadAutopilotLauncher,
      repoRoot: '/repo',
    });

    const res = await port.dispatch({
      taskId: 'rec-2',
      title: 'T',
      prompt: 'p',
      routedAgentId: 'agent-7',
    });

    expect(res).toEqual({ ok: true, workspaceId: 'ws-2' });
    expect(createWorkspace.mock.calls[0][0]).toMatchObject({
      metadata: { routedAgentId: 'agent-7' },
    });
  });

  it('surfaces a truthful ok:false with the conductor reason on a refused launch', async () => {
    const port = createSquadAutopilotDispatch({
      conductor: {
        createWorkspace: async () => ({ ok: false, reason: 'quota exceeded' }),
      } as unknown as SquadAutopilotLauncher,
      repoRoot: '/repo',
    });

    expect(await port.dispatch({ taskId: 'rec-3', title: 'T', prompt: 'p' })).toEqual({
      ok: false,
      reason: 'quota exceeded',
    });
  });

  it('falls back to a default reason when the launch produced no value', async () => {
    const port = createSquadAutopilotDispatch({
      conductor: {
        createWorkspace: async () => ({ ok: true, value: null }),
      } as unknown as SquadAutopilotLauncher,
      repoRoot: '/repo',
    });

    expect(await port.dispatch({ taskId: 'rec-4', title: 'T', prompt: 'p' })).toEqual({
      ok: false,
      reason: 'conductor refused workspace.create',
    });
  });
});
