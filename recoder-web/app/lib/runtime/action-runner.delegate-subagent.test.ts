import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';

function makeActionData(strict?: boolean): any {
  return {
    artifactId: 'artifact-1',
    messageId: 'message-1',
    actionId: `action-${strict === undefined ? 'none' : strict ? 'true' : 'false'}`,
    action: {
      type: 'delegate_subagent',
      content: '',
      agentType: 'coder',
      taskDescription: 'ship strict contract propagation',
      context: 'test',
      ...(strict === undefined ? {} : { strict }),
    },
  };
}

async function waitForFetch(mock: ReturnType<typeof vi.fn>): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (mock.mock.calls.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('delegate_subagent fetch was not called in time');
}

describe('ActionRunner delegate_subagent strict propagation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as any).__RECODER_WORKFLOW_STRICT_CONTRACT;
    delete (globalThis as any).__OPENCLAW_WORKFLOW_STRICT_CONTRACT;
  });

  it('propagates strict=true when action explicitly requests strict mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, output: 'ok', message: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const runner = new ActionRunner();
    const data = makeActionData(true);
    runner.addAction(data);
    await runner.runAction(data);
    await waitForFetch(fetchMock);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(body.tool).toBe('delegateSubagent');
    expect(body.params.strict).toBe(true);
  });

  it('propagates strict=true from global strict toggle when action omits strict', async () => {
    (globalThis as any).__RECODER_WORKFLOW_STRICT_CONTRACT = 'true';
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, output: 'ok', message: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const runner = new ActionRunner();
    const data = makeActionData(undefined);
    runner.addAction(data);
    await runner.runAction(data);
    await waitForFetch(fetchMock);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(body.params.strict).toBe(true);
  });

  it('propagates strict=false by default when no strict override is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, output: 'ok', message: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const runner = new ActionRunner();
    const data = makeActionData(undefined);
    runner.addAction(data);
    await runner.runAction(data);
    await waitForFetch(fetchMock);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(body.params.strict).toBe(false);
  });
});

