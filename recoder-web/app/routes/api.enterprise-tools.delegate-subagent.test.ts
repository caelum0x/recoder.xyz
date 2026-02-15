import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockGetDockerBackendUrl,
  mockCreateDockerProxyHeaders,
  mockDockerFetchJson,
  mockBuildSubagentWorkflowPlan,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockGetDockerBackendUrl: vi.fn(),
  mockCreateDockerProxyHeaders: vi.fn(),
  mockDockerFetchJson: vi.fn(),
  mockBuildSubagentWorkflowPlan: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/http/docker-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/http/docker-server')>();
  return {
    ...actual,
    getDockerBackendUrl: mockGetDockerBackendUrl,
    createDockerProxyHeaders: mockCreateDockerProxyHeaders,
    dockerFetchJson: mockDockerFetchJson,
  };
});

vi.mock('~/lib/services/subagent-workflow.server', () => ({
  buildSubagentWorkflowPlan: mockBuildSubagentWorkflowPlan,
}));

import { action as enterpriseToolsAction } from './api.enterprise-tools';

async function getPayload(response: any): Promise<any> {
  if (response && typeof response.json === 'function') {
    return response.json();
  }
  if (response && typeof response.text === 'function') {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  if (response?.body && typeof response.body === 'string') {
    try {
      return JSON.parse(response.body);
    } catch {
      return { raw: response.body };
    }
  }
  return response?.data ?? response;
}

describe('api.enterprise-tools delegateSubagent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ user: { id: 'u1', email: 'dev@recoder.xyz' } });
    mockGetDockerBackendUrl.mockReturnValue('http://docker');
    mockCreateDockerProxyHeaders.mockReturnValue({ Authorization: 'Bearer token', 'Content-Type': 'application/json' });
    mockBuildSubagentWorkflowPlan.mockReturnValue({
      mode: 'continuous',
      summary: 'local summary',
      lanes: [],
      nextActions: [],
    });
  });

  function makeRequest(body: unknown): any {
    return {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => body,
    };
  }

  it('uses project-scoped docker workflow endpoint when projectId is provided', async () => {
    mockDockerFetchJson.mockResolvedValueOnce({
      contract: 'internal-agent-workflow-v1',
      workflow: {
        mode: 'continuous',
        summary: 'remote summary',
        lanes: [],
        nextActions: [],
      },
    });

    const response = await enterpriseToolsAction({
      request: makeRequest({
        tool: 'delegateSubagent',
        params: {
          agentType: 'coder',
          task: 'ship feature',
          projectId: 'proj-123',
        },
      }),
      context: {},
      params: {},
    } as any);

    const data = await getPayload(response);
    expect(mockDockerFetchJson).toHaveBeenCalledWith(
      'http://docker/api/agent/workflow/proj-123',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Object),
    );
    expect(data.source).toBe('docker-backend');
    expect(data.output).toBe('remote summary');
    expect(data.backend).toEqual(expect.objectContaining({
      endpoint: 'http://docker/api/agent/workflow/proj-123',
      contract: 'internal-agent-workflow-v1',
      responseContract: 'internal-agent-workflow-v1',
      contractStatus: 'match',
      attempts: 1,
      maxAttempts: 2,
    }));
    expect(data.fallbackReason).toBeUndefined();
  });

  it('falls back to local workflow when docker workflow request fails', async () => {
    mockDockerFetchJson.mockRejectedValueOnce(new Error('docker unavailable'));
    mockDockerFetchJson.mockRejectedValueOnce(new Error('docker unavailable'));

    const response = await enterpriseToolsAction({
      request: makeRequest({
        tool: 'delegateSubagent',
        params: {
          agentType: 'tester',
          task: 'validate release',
        },
      }),
      context: {},
      params: {},
    } as any);

    const data = await getPayload(response);
    expect(data.source).toBe('local-fallback');
    expect(data.output).toBe('local summary');
    expect(data.fallbackReason).toContain('attempt 2/2');
    expect(data.backend).toEqual(expect.objectContaining({
      endpoint: 'http://docker/api/agent/workflow',
      attempts: 2,
      maxAttempts: 2,
    }));
    expect(Array.isArray(data.backend.warnings)).toBe(true);
    expect(mockBuildSubagentWorkflowPlan).toHaveBeenCalledTimes(1);
  });

  it('uses local fallback in strict mode when response contract mismatches', async () => {
    mockDockerFetchJson.mockResolvedValueOnce({
      contract: 'public-agent-workflow-v1',
      workflow: {
        mode: 'continuous',
        summary: 'remote summary',
        lanes: [],
        nextActions: [],
      },
    });

    const response = await enterpriseToolsAction({
      request: makeRequest({
        tool: 'delegateSubagent',
        params: {
          agentType: 'coder',
          task: 'ship strict contract',
          strict: true,
        },
      }),
      context: {},
      params: {},
    } as any);

    const data = await getPayload(response);
    expect(data.source).toBe('local-fallback');
    expect(data.output).toBe('local summary');
    expect(data.fallbackReason).toContain('strict contract check failed');
    expect(data.backend).toEqual(expect.objectContaining({
      contract: 'internal-agent-workflow-v1',
      responseContract: 'public-agent-workflow-v1',
      contractStatus: 'mismatch',
      strictContract: true,
    }));
  });
});
