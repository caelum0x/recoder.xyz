import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('squad project bindings', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../persistence', () => ({
      loadStore: vi.fn(() => ({})),
      debouncedSave: vi.fn(),
    }));
    vi.doMock('./collab-events.service.js', () => ({
      emitCollabEvent: vi.fn(),
    }));
  });

  it('resolves dispatch project from request, member, then squad default', async () => {
    const {
      addMember,
      createSquad,
      resolveSquadDispatchProject,
      setMemberRole,
    } = await import('./squad.service.js');

    const squad = createSquad({
      name: 'Build squad',
      ownerId: 'user_1',
      projectId: 'proj_default',
      members: [
        { id: 'agent_one', kind: 'agent', role: 'builder', projectId: 'proj_member' },
      ],
    });

    expect(resolveSquadDispatchProject({
      squadId: squad.id,
      assignedMemberIds: ['agent_one'],
      explicitProjectId: 'proj_request',
    })).toEqual({ projectId: 'proj_request', source: 'request' });

    expect(resolveSquadDispatchProject({
      squadId: squad.id,
      assignedMemberIds: ['agent_one'],
    })).toEqual({ projectId: 'proj_member', source: 'member' });

    addMember(squad.id, {
      id: 'agent_two',
      kind: 'agent',
      role: 'reviewer',
      projectId: 'proj_other',
    }, 'user_1');

    expect(resolveSquadDispatchProject({
      squadId: squad.id,
      assignedMemberIds: ['agent_one', 'agent_two'],
    })).toEqual({ projectId: 'proj_default', source: 'squad' });

    setMemberRole(squad.id, 'agent_one', undefined, 'user_1', { projectId: null });
    expect(resolveSquadDispatchProject({
      squadId: squad.id,
      assignedMemberIds: ['agent_one'],
    })).toEqual({ projectId: 'proj_default', source: 'squad' });
  });

  it('preserves project bindings in portable squads and clones', async () => {
    const {
      cloneSquad,
      createSquad,
      exportSquad,
    } = await import('./squad.service.js');

    const squad = createSquad({
      name: 'Portable squad',
      ownerId: 'user_1',
      projectId: 'proj_default',
      members: [
        { id: 'agent_one', kind: 'agent', role: 'builder', projectId: 'proj_member' },
      ],
    });

    expect(exportSquad(squad.id)).toMatchObject({
      projectId: 'proj_default',
      members: [{ id: 'agent_one', projectId: 'proj_member' }],
    });

    const clone = cloneSquad(squad.id, 'user_2');
    expect(clone).toMatchObject({
      projectId: 'proj_default',
      members: [{ id: 'agent_one', projectId: 'proj_member' }],
    });
  });
});
