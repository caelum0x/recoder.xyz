import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockCopySecretsToWorkspace,
  mockCopyTriggersToWorkspace,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockCopySecretsToWorkspace: vi.fn(),
  mockCopyTriggersToWorkspace: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/workspaces/workspace-vault-store', () => ({
  copySecretsToWorkspace: mockCopySecretsToWorkspace,
}));

vi.mock('~/lib/.server/workspaces/triggers-store', () => ({
  copyTriggersToWorkspace: mockCopyTriggersToWorkspace,
}));

import {
  __getWorkspaceStoreForTests,
  __resetWorkspaceStoreForTests,
  action as workspaceAction,
} from './api.workspaces';

function getStatus(response: any): number {
  if (typeof response?.status === 'number') return response.status;
  if (typeof response?.init?.status === 'number') return response.init.status;
  return -1;
}

function parseBodyJson(response: any): any {
  if (typeof response?.body !== 'string') return {};
  try {
    return JSON.parse(response.body);
  } catch {
    return {};
  }
}

describe('api.workspaces route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWorkspaceStoreForTests();
    mockVerifySession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCopySecretsToWorkspace.mockReturnValue({ copied: 0, skipped: 0 });
    mockCopyTriggersToWorkspace.mockReturnValue({ copied: 0, skipped: 0, idMap: {} });
  });

  it('duplicates workspace with node/connection remap and optional linked asset copies', async () => {
    const sourceWorkspaceId = 'ws_source_1';
    __getWorkspaceStoreForTests().set(sourceWorkspaceId, {
      id: sourceWorkspaceId as any,
      name: 'Source Workspace',
      description: 'source',
      nodes: [
        {
          id: 'nd_source_1',
          type: 'operation',
          position: { x: 0, y: 0 },
          data: { nodeRef: 'nd_source_2', triggerRef: 'trg_source_1' },
        },
        {
          id: 'nd_source_2',
          type: 'operation',
          position: { x: 10, y: 10 },
          data: { parentNodeId: 'nd_source_1' },
        },
      ],
      connections: [
        {
          id: 'con_source_1',
          source: 'nd_source_1',
          target: 'nd_source_2',
        },
      ],
      metadata: { userId: 'user-1' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    mockCopySecretsToWorkspace.mockReturnValueOnce({ copied: 2, skipped: 0 });
    mockCopyTriggersToWorkspace.mockReturnValueOnce({
      copied: 1,
      skipped: 0,
      idMap: { trg_source_1: 'trg_copied_1' },
    });

    const duplicateRequest = {
      method: 'POST',
      url: 'http://localhost/api/workspaces?action=duplicate',
      json: async () => ({
        sourceWorkspaceId,
        includeSecrets: true,
        includeTriggers: true,
      }),
    } as any;

    const duplicated = await workspaceAction({ request: duplicateRequest, context: {} as any, params: {} } as any);
    expect(getStatus(duplicated)).toBe(200);
    const duplicatedBody = parseBodyJson(duplicated);
    expect(duplicatedBody.success).toBe(true);
    const stored = Array.from(__getWorkspaceStoreForTests().values());
    expect(stored).toHaveLength(2);
    const duplicatedWorkspace = stored.find((workspace) => (workspace.metadata as any)?.copiedFromWorkspaceId === sourceWorkspaceId) as {
      nodes: Array<{ id: string; data: Record<string, unknown> }>;
      connections: Array<{ id: string; source: string; target: string }>;
      metadata?: Record<string, any>;
    } | undefined;
    expect(duplicatedWorkspace).toBeTruthy();
    if (!duplicatedWorkspace) return;

    const duplicatedWorkspaceId = Array.from(__getWorkspaceStoreForTests().entries())
      .find(([, workspace]) => workspace === duplicatedWorkspace)?.[0];
    expect(duplicatedWorkspaceId).toBeTypeOf('string');
    expect(mockCopySecretsToWorkspace).toHaveBeenCalledWith(sourceWorkspaceId, duplicatedWorkspaceId, 'user-1');
    expect(mockCopyTriggersToWorkspace).toHaveBeenCalledWith(sourceWorkspaceId, duplicatedWorkspaceId, 'user-1');

    const originalNodeIds = new Set(['nd_source_1', 'nd_source_2']);
    const duplicateNodeIds = duplicatedWorkspace.nodes.map((n) => n.id);
    expect(duplicateNodeIds.some((id) => originalNodeIds.has(id))).toBe(false);
    expect(duplicatedWorkspace.connections[0].id).not.toBe('con_source_1');
    expect(duplicateNodeIds).toContain(duplicatedWorkspace.connections[0].source);
    expect(duplicateNodeIds).toContain(duplicatedWorkspace.connections[0].target);

    const nodeIdMap = duplicatedWorkspace.metadata?.idMap?.nodeIdMap as Record<string, string>;
    expect(nodeIdMap.nd_source_1).toBeTypeOf('string');
    expect(nodeIdMap.nd_source_2).toBeTypeOf('string');

    const copiedNode1 = duplicatedWorkspace.nodes.find((n) => n.id === nodeIdMap.nd_source_1);
    expect(copiedNode1?.data.nodeRef).toBe(nodeIdMap.nd_source_2);
    expect(copiedNode1?.data.triggerRef).toBe('trg_copied_1');
    expect(duplicatedWorkspace.metadata?.idMap?.triggerIdMap).toMatchObject({ trg_source_1: 'trg_copied_1' });
  });
});
