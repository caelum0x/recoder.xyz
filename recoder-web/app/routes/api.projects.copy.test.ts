import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockGetProject,
  mockGetUserProjects,
  mockCreateProject,
  mockDeleteProject,
  mockFetch,
  mockCopySecretsToWorkspace,
  mockCopyTriggersToWorkspace,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockGetProject: vi.fn(),
  mockGetUserProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockDeleteProject: vi.fn(),
  mockFetch: vi.fn(),
  mockCopySecretsToWorkspace: vi.fn(),
  mockCopyTriggersToWorkspace: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/db/projects-db', () => ({
  ProjectsDB: vi.fn().mockImplementation(() => ({
    getProject: mockGetProject,
    getUserProjects: mockGetUserProjects,
    createProject: mockCreateProject,
    deleteProject: mockDeleteProject,
  })),
}));

vi.mock('~/lib/.server/workspaces/workspace-vault-store', () => ({
  copySecretsToWorkspace: mockCopySecretsToWorkspace,
}));

vi.mock('~/lib/.server/workspaces/triggers-store', () => ({
  copyTriggersToWorkspace: mockCopyTriggersToWorkspace,
}));

import { action as copyProjectAction } from './api.projects.copy';

function okResponse(payload: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function errorResponse(status: number, text: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: text }),
    text: async () => text,
  } as unknown as Response;
}

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('api.projects.copy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockCopySecretsToWorkspace.mockReturnValue({ copied: 0, skipped: 0 });
    mockCopyTriggersToWorkspace.mockReturnValue({ copied: 0, skipped: 0, idMap: {} });
  });

  it('copies project and triggers workspace copy', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockGetProject.mockResolvedValueOnce({
      id: 'src-1',
      name: 'Source App',
      description: 'desc',
      type: 'web',
      framework: 'react',
      language: 'ts',
      isPrivate: false,
      templateId: null,
      starterPath: null,
      config: { a: 1 },
      metadata: { any: 'value' },
      knowledge: 'k',
      messageHistory: '[]',
    });
    mockGetUserProjects.mockResolvedValueOnce([{ name: 'Another Project' }]);
    mockCreateProject.mockResolvedValueOnce({ id: 'new-1', name: 'Source App (Copy)' });

    mockFetch
      .mockResolvedValueOnce(okResponse()) // ensure source container
      .mockResolvedValueOnce(okResponse()) // ensure target container
      .mockResolvedValueOnce(okResponse({ success: true })); // workspace copy

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ sourceProjectId: 'src-1', includeGit: false }),
    } as any;

    const response = await copyProjectAction({
      request,
      context: { cloudflare: { env: { DATABASE_URL: 'postgres://test', DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(200);
    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const workspaceCopyCall = mockFetch.mock.calls[2];
    const workspaceCopyPayload = JSON.parse(workspaceCopyCall[1].body as string);
    expect(workspaceCopyPayload).toMatchObject({
      sourceProjectId: 'src-1',
      targetProjectId: 'new-1',
      includeGit: false,
      includeGitRemotes: false,
      includeTriggers: false,
      includeEnvFiles: false,
      includeSecrets: false,
      includeDeployConfig: false,
      includeDomains: false,
    });
    expect(mockDeleteProject).not.toHaveBeenCalled();
  });

  it('rolls back db project when workspace copy fails', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockGetProject.mockResolvedValueOnce({
      id: 'src-1',
      name: 'Source App',
      description: 'desc',
      type: 'web',
      framework: 'react',
      language: 'ts',
      isPrivate: false,
      templateId: null,
      starterPath: null,
      config: {},
      metadata: {},
      knowledge: null,
      messageHistory: null,
    });
    mockGetUserProjects.mockResolvedValueOnce([]);
    mockCreateProject.mockResolvedValueOnce({ id: 'new-rollback', name: 'Source App (Copy)' });
    mockDeleteProject.mockResolvedValueOnce(true);

    mockFetch
      .mockResolvedValueOnce(okResponse()) // ensure source container
      .mockResolvedValueOnce(okResponse()) // ensure target container
      .mockResolvedValueOnce(errorResponse(500, 'copy failed')); // workspace copy fails

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ sourceProjectId: 'src-1' }),
    } as any;

    const response = await copyProjectAction({
      request,
      context: { cloudflare: { env: { DATABASE_URL: 'postgres://test', DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(500);
    expect(mockDeleteProject).toHaveBeenCalledWith('new-rollback', 'user-1');
  });

  it('disables includeGitRemotes unless includeGit is true', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockGetProject.mockResolvedValueOnce({
      id: 'src-2',
      name: 'Source App',
      description: 'desc',
      type: 'web',
      framework: 'react',
      language: 'ts',
      isPrivate: false,
      templateId: null,
      starterPath: null,
      config: {},
      metadata: {},
      knowledge: null,
      messageHistory: null,
    });
    mockGetUserProjects.mockResolvedValueOnce([]);
    mockCreateProject.mockResolvedValueOnce({ id: 'new-2', name: 'Source App (Copy)' });

    mockFetch
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse({ success: true }));

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ sourceProjectId: 'src-2', includeGit: false, includeGitRemotes: true }),
    } as any;

    const response = await copyProjectAction({
      request,
      context: { cloudflare: { env: { DATABASE_URL: 'postgres://test', DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(200);
    const workspaceCopyCall = mockFetch.mock.calls[2];
    const workspaceCopyPayload = JSON.parse(workspaceCopyCall[1].body as string);
    expect(workspaceCopyPayload.includeGit).toBe(false);
    expect(workspaceCopyPayload.includeGitRemotes).toBe(false);
  });

  it('copies linked secrets and triggers only when opted in', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockGetProject.mockResolvedValueOnce({
      id: 'src-3',
      name: 'Source App',
      description: 'desc',
      type: 'web',
      framework: 'react',
      language: 'ts',
      isPrivate: false,
      templateId: null,
      starterPath: null,
      config: {},
      metadata: {},
      knowledge: null,
      messageHistory: null,
    });
    mockGetUserProjects.mockResolvedValueOnce([]);
    mockCreateProject.mockResolvedValueOnce({ id: 'new-3', name: 'Source App (Copy)', metadata: {} });
    mockCopySecretsToWorkspace.mockReturnValueOnce({ copied: 2, skipped: 0 });
    mockCopyTriggersToWorkspace.mockReturnValueOnce({ copied: 1, skipped: 0, idMap: { old: 'new' } });

    mockFetch
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse({ success: true }));

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ sourceProjectId: 'src-3', includeSecrets: true, includeTriggers: true }),
    } as any;

    const response = await copyProjectAction({
      request,
      context: { cloudflare: { env: { DATABASE_URL: 'postgres://test', DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(200);
    expect(mockCopySecretsToWorkspace).toHaveBeenCalledWith('src-3', 'new-3', 'user-1');
    expect(mockCopyTriggersToWorkspace).toHaveBeenCalledWith('src-3', 'new-3', 'user-1');
  });
});
