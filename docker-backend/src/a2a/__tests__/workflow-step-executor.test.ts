import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../metering/openmeter-client.js', () => ({
  trackLlmCall: vi.fn(),
  trackSandboxExec: vi.fn(),
}));

const publishMock = vi.fn();

vi.mock('../a2a-event-bus.js', () => ({
  A2AEventType: {
    TaskStream: 'task.stream',
  },
  getA2AEventBus: () => ({
    publish: publishMock,
  }),
}));

import { executeWorkflowSteps } from '../workflow-step-executor.js';
import { trackLlmCall, trackSandboxExec } from '../../metering/openmeter-client.js';

describe('workflow-step-executor metering', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
    vi.stubEnv('DAYTONA_API_KEY', 'test-daytona-key');
    vi.stubEnv('DAYTONA_SERVER_URL', 'http://daytona.example/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('tracks llm steps with measured token usage and duration', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'workflow answer' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }),
    } as unknown as Response);

    const result = await executeWorkflowSteps(
      [
        {
          name: 'llm-step',
          type: 'llm',
          config: {
            prompt: 'Summarize {{topic}}',
            model: 'openai/gpt-4o-mini',
          },
        },
      ],
      { _userId: 'user-1', _projectId: 'project-1', topic: 'Nike' },
    );

    expect(result.success).toBe(true);
    expect(trackLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'openai/gpt-4o-mini',
      inputTokens: 11,
      outputTokens: 7,
      provider: 'openrouter',
      projectId: 'project-1',
    }));

    const llmCall = vi.mocked(trackLlmCall).mock.calls[0]?.[0];
    expect(llmCall?.durationMs).toEqual(expect.any(Number));
    expect(llmCall?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks code steps with measured duration and sandbox exit code', async () => {
    fetchMock.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({
        stdout: 'ok',
        exitCode: 0,
      }),
    } as unknown as Response);

    const result = await executeWorkflowSteps(
      [
        {
          name: 'code-step',
          type: 'code',
          config: {
            code: 'print("ok")',
            language: 'python',
          },
        },
      ],
      { _userId: 'user-2', _projectId: 'project-2', sandboxId: 'sandbox-1' },
    );

    expect(result.success).toBe(true);
    expect(trackSandboxExec).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-2',
      projectId: 'project-2',
      command: 'python3 -c "print(\\"ok\\")"',
      exitCode: 0,
    }));

    const codeCall = vi.mocked(trackSandboxExec).mock.calls[0]?.[0];
    expect(codeCall?.durationMs).toEqual(expect.any(Number));
    expect(codeCall?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits task.stream events for streaming llm steps', async () => {
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"world from stream with enough detail"}}]}\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n'));
          controller.close();
        },
      }),
    } as unknown as Response);

    const result = await executeWorkflowSteps(
      [
        {
          name: 'llm-stream-step',
          type: 'llm',
          config: {
            prompt: 'Stream {{topic}}',
            model: 'openai/gpt-4o-mini',
          },
        },
      ],
      {
        _taskId: 'task-stream-1',
        _workspaceId: 'workspace-stream-1',
        _userId: 'user-3',
        _projectId: 'project-3',
        topic: 'Nike',
      },
    );

    expect(result.success).toBe(true);
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task.stream',
      taskId: 'task-stream-1',
      workspaceId: 'workspace-stream-1',
      data: expect.objectContaining({
        chunk: 'world from stream with enough detail',
        done: false,
      }),
    }));
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task.stream',
      taskId: 'task-stream-1',
      workspaceId: 'workspace-stream-1',
      data: expect.objectContaining({
        done: true,
      }),
    }));
  });
});
