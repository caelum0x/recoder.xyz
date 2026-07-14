import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const execCommand = vi.fn();
  const getWorkDir = vi.fn();
  const getPreviewUrl = vi.fn();
  const deleteSession = vi.fn();
  const createSession = vi.fn();
  const execInSession = vi.fn();
  const getSessionLogs = vi.fn();
  const getDaytonaPreviewAccess = vi.fn();
  const createSessionClient = vi.fn();
  const prompt = vi.fn();
  const deleteOpencodeSession = vi.fn();

  return {
    daytonaClient: {
      execCommand,
      getWorkDir,
      getPreviewUrl,
      deleteSession,
      createSession,
      execInSession,
      getSessionLogs,
    },
    getDaytonaPreviewAccess,
    createSessionClient,
    prompt,
    deleteOpencodeSession,
  };
});

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../daytona-client.js', () => ({
  getDaytonaClient: () => mocks.daytonaClient,
}));

vi.mock('../../daytona-preview.js', () => ({
  getDaytonaPreviewAccess: mocks.getDaytonaPreviewAccess,
}));

vi.mock('@recoder/shared/opencode-client', () => ({
  createRecoderOpencodeClient: vi.fn(() => ({
    createSession: mocks.createSessionClient,
    prompt: mocks.prompt,
    deleteSession: mocks.deleteOpencodeSession,
  })),
}));

describe('opencode-connector.service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));

    mocks.daytonaClient.execCommand.mockReset();
    mocks.daytonaClient.getWorkDir.mockReset();
    mocks.daytonaClient.getPreviewUrl.mockReset();
    mocks.daytonaClient.deleteSession.mockReset();
    mocks.daytonaClient.createSession.mockReset();
    mocks.daytonaClient.execInSession.mockReset();
    mocks.daytonaClient.getSessionLogs.mockReset();
    mocks.getDaytonaPreviewAccess.mockReset();
    mocks.createSessionClient.mockReset();
    mocks.prompt.mockReset();
    mocks.deleteOpencodeSession.mockReset();

    mocks.daytonaClient.getWorkDir.mockResolvedValue('/workspace');
    mocks.daytonaClient.getPreviewUrl.mockReturnValue('https://1234-sbx.proxy.daytona.works');
    mocks.daytonaClient.execCommand.mockResolvedValue({ exitCode: 0, output: '' });
    mocks.daytonaClient.deleteSession.mockResolvedValue(undefined);
    mocks.daytonaClient.createSession.mockResolvedValue('opencode-serve-proj_1');
    mocks.daytonaClient.execInSession.mockResolvedValue({ cmdId: 'cmd_1' });
    mocks.daytonaClient.getSessionLogs.mockResolvedValue('opencode server listening');
    mocks.getDaytonaPreviewAccess.mockResolvedValue({
      url: 'https://4096-sbx.proxy.daytona.works',
      token: 'preview-token',
      host: '4096-sbx.proxy.daytona.works',
      port: 4096,
      signed: false,
    });
    mocks.createSessionClient.mockResolvedValue({ id: 'oc_session_1' });
    mocks.prompt.mockResolvedValue({
      info: { id: 'msg_1' },
      parts: [{ type: 'text', text: 'done' }],
    });
    mocks.deleteOpencodeSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches preview access once during session startup and reuses it', async () => {
    const { startSession } = await import('../opencode-connector.service.js');

    const session = await startSession({
      projectId: 'proj_1',
      sandboxId: 'sbx_1',
      sandboxExecUrl: 'http://test/exec',
      daytonaApiKey: 'key',
    });

    expect(mocks.getDaytonaPreviewAccess).toHaveBeenCalledTimes(1);
    expect(session.serverUrl).toBe('https://4096-sbx.proxy.daytona.works');
    expect(session.previewAccess?.token).toBe('preview-token');
  });

  it('refreshes preview access before retrying a prompt after auth-like failure', async () => {
    mocks.prompt
      .mockRejectedValueOnce(new Error('failed (403)'))
      .mockResolvedValueOnce({
        info: { id: 'msg_2' },
        parts: [{ type: 'text', text: 'retried ok' }],
      });
    mocks.createSessionClient
      .mockResolvedValueOnce({ id: 'oc_session_1' })
      .mockResolvedValueOnce({ id: 'oc_session_2' });

    const { startSession, sendPrompt } = await import('../opencode-connector.service.js');

    await startSession({
      projectId: 'proj_1',
      sandboxId: 'sbx_1',
      sandboxExecUrl: 'http://test/exec',
      daytonaApiKey: 'key',
    });

    const result = await sendPrompt({
      projectId: 'proj_1',
      prompt: 'retry me',
      sandboxExecUrl: 'http://test/exec',
      daytonaApiKey: 'key',
    });

    expect(mocks.getDaytonaPreviewAccess).toHaveBeenCalledTimes(2);
    expect(mocks.prompt).toHaveBeenCalledTimes(2);
    expect(mocks.createSessionClient).toHaveBeenCalledTimes(2);
    expect(result.messageId).toBe('msg_2');
  });
});
