import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { backendApiGetMock, handleApiErrorMock } = vi.hoisted(() => ({
  backendApiGetMock: vi.fn(),
  handleApiErrorMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  backendApi: {
    get: backendApiGetMock,
  },
}));

vi.mock('@/lib/error-handler', () => ({
  handleApiError: handleApiErrorMock,
}));

describe('active runs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns active runs on success', async () => {
    backendApiGetMock.mockResolvedValue({
      data: [
        {
          id: 'run-1',
          agent_id: 'agent-1',
          agent_name: 'Writer',
          model: 'gpt-5',
          started_at: '2026-04-21T00:00:00Z',
          token_count: 123,
          estimated_cost: 0.01,
          status: 'running',
        },
      ],
    });

    const { activeRunsApi } = await import('@/lib/api/active-runs');
    const runs = await activeRunsApi.getActiveRuns();

    expect(runs).toHaveLength(1);
    expect(backendApiGetMock).toHaveBeenCalledWith('/agents/active-runs', {
      showErrors: false,
    });
  });

  it('degrades to an empty list when the endpoint returns an error response', async () => {
    backendApiGetMock.mockResolvedValue({
      error: {
        status: 502,
        message: 'Bad Gateway',
      },
    });

    const { activeRunsApi } = await import('@/lib/api/active-runs');
    const runs = await activeRunsApi.getActiveRuns();

    expect(runs).toEqual([]);
    expect(handleApiErrorMock).not.toHaveBeenCalled();
  });

  it('returns an empty list and silences transient fetch exceptions', async () => {
    backendApiGetMock.mockRejectedValue(new Error('Failed to fetch'));

    const { activeRunsApi } = await import('@/lib/api/active-runs');
    const runs = await activeRunsApi.getActiveRuns();

    expect(runs).toEqual([]);
    expect(handleApiErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'list active runs',
        resource: 'active runs',
        silent: true,
      }),
    );
  });
});
