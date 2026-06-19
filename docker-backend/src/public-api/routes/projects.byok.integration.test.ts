import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let projectsTesting: any;
let sqliteAvailable = true;

try {
  ({ _testing: projectsTesting } = await import('./projects.js'));
} catch (error) {
  const message = String((error as Error)?.message ?? error);
  sqliteAvailable = !message.includes('better_sqlite3.node');
}

process.env.INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'internal-key-test';
process.env.APP_API_URL = process.env.APP_API_URL || 'https://app.recoder.test';

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const suite = sqliteAvailable ? describe : describe.skip;

suite('projects BYOK processing integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await projectsTesting.clearAll();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes a queued prompt task using user BYOK keys and provider call', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/user/ai-provider-keys')) {
        return createJsonResponse({
          keys: {
            openrouter: 'or-key-123',
          },
        });
      }
      if (url === 'https://openrouter.ai/api/v1/chat/completions') {
        return createJsonResponse({
          choices: [{ message: { content: 'BYOK completion content' } }],
        });
      }
      return createJsonResponse({ error: `unexpected url: ${url}` }, 404);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const taskId = 'task-1';
    const now = Date.now();
    projectsTesting.promptTasks.set(taskId, {
      id: taskId,
      projectId: 'project-1',
      apiKeyId: 'key-1',
      userId: 'user-1',
      prompt: 'build app',
      model: 'openrouter/auto',
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    });

    await projectsTesting.processPromptTask(taskId);

    const task = projectsTesting.promptTasks.get(taskId);
    expect(task?.status).toBe('completed');
    expect(task?.result).toContain('BYOK completion content');
    expect(task?.error).toBeUndefined();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith('/api/user/ai-provider-keys'))).toBe(true);
    expect(urls).toContain('https://openrouter.ai/api/v1/chat/completions');
    const byokCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/user/ai-provider-keys'));
    const byokHeaders = (byokCall?.[1] as any)?.headers;
    const byokBody = (byokCall?.[1] as any)?.body;
    const parsedByokBody = JSON.parse(String(byokBody || '{}'));
    expect(byokHeaders?.get('x-internal-timestamp')).toBeTruthy();
    expect(byokHeaders?.get('x-internal-signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(parsedByokBody.userId).toBe('user-1');
    expect(parsedByokBody.serviceKey).toBeUndefined();
  });

  it('marks task as failed when no BYOK provider key is available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/user/ai-provider-keys')) {
        return createJsonResponse({ keys: {} });
      }
      return createJsonResponse({ error: `unexpected url: ${url}` }, 404);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const taskId = 'task-no-key';
    const now = Date.now();
    projectsTesting.promptTasks.set(taskId, {
      id: taskId,
      projectId: 'project-1',
      apiKeyId: 'key-1',
      userId: 'user-1',
      prompt: 'build app',
      model: undefined,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    });

    await projectsTesting.processPromptTask(taskId);

    const task = projectsTesting.promptTasks.get(taskId);
    expect(task?.status).toBe('failed');
    expect(task?.error).toContain('No BYOK provider key found. Configure at least one of: openrouter');
  });

  it('keeps task stream snapshot shape compatible for polling/stream consumers', async () => {
    const now = Date.now();
    const taskId = 'task-shape';
    projectsTesting.promptTasks.set(taskId, {
      id: taskId,
      projectId: 'project-shape',
      apiKeyId: 'key-shape',
      userId: 'user-shape',
      prompt: 'shape',
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });
    projectsTesting.promptTasksByProject.set('project-shape', new Set([taskId]));

    const task = projectsTesting.getPromptTaskForProject('project-shape', taskId, 'key-shape');
    expect(task).toBeTruthy();
    const snapshot = projectsTesting.toPromptTaskResponse(task!);
    expect(snapshot).toMatchObject({
      id: taskId,
      projectId: 'project-shape',
      status: 'running',
    });
  });

  it('marks task as cancelled when aborted during provider completion call', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/user/ai-provider-keys')) {
        return createJsonResponse({
          keys: {
            openrouter: 'or-key-123',
          },
        });
      }
      if (url === 'https://openrouter.ai/api/v1/chat/completions') {
        return await new Promise<Response>((resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
          // If not aborted in time, resolve to avoid dangling promises in tests.
          setTimeout(() => {
            resolve(createJsonResponse({
              choices: [{ message: { content: 'should-not-complete' } }],
            }));
          }, 1_000);
        });
      }
      return createJsonResponse({ error: `unexpected url: ${url}` }, 404);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const taskId = 'task-cancel';
    const now = Date.now();
    projectsTesting.promptTasks.set(taskId, {
      id: taskId,
      projectId: 'project-1',
      apiKeyId: 'key-1',
      userId: 'user-1',
      prompt: 'cancel me',
      model: 'openrouter/auto',
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    });

    const runPromise = projectsTesting.processPromptTask(taskId);
    await Promise.resolve();

    const abortController = projectsTesting.promptTaskAbortControllers.get(taskId);
    expect(abortController).toBeTruthy();
    abortController?.abort();

    await runPromise;

    const task = projectsTesting.promptTasks.get(taskId);
    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('Task cancelled by user');
  });
});
