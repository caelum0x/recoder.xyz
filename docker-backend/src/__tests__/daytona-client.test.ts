import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaytonaClient } from '../daytona-client.js';

describe('DaytonaClient path resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves relative writes against the sandbox workdir returned by Daytona', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ dir: '/workspace/project' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);

    const client = new DaytonaClient({
      baseUrl: 'http://daytona.test/api',
      apiKey: 'api-key',
      toolboxApiKey: 'toolbox-key',
      toolboxProxyUrl: 'http://daytona.test/api/toolbox',
    });

    await client.uploadFileNative('sbx-1', 'src/App.tsx', 'export default function App() {}');

    const mkdirCall = fetchMock.mock.calls[1];
    const uploadCall = fetchMock.mock.calls[2];

    expect(mkdirCall[0]).toBe('http://daytona.test/api/toolbox/sbx-1/toolbox/filesystem/mkdir');
    expect(JSON.parse(String(mkdirCall[1]?.body))).toMatchObject({
      path: '/workspace/project/src',
    });

    expect(uploadCall[0]).toBe('http://daytona.test/api/toolbox/sbx-1/toolbox/filesystem/upload');
    expect(JSON.parse(String(uploadCall[1]?.body))).toMatchObject({
      path: '/workspace/project/src/App.tsx',
    });
  });

  it('falls back to /workspace when workdir lookup fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Internal Server Error' }))
      .mockResolvedValueOnce(new Response('{"name":"recoder"}', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }));

    vi.stubGlobal('fetch', fetchMock);

    const client = new DaytonaClient({
      baseUrl: 'http://daytona.test/api',
      apiKey: 'api-key',
      toolboxApiKey: 'toolbox-key',
      toolboxProxyUrl: 'http://daytona.test/api/toolbox',
    });

    const content = await client.downloadFileNative('sbx-2', 'package.json');

    expect(content).toBe('{"name":"recoder"}');
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      encodeURIComponent('/workspace/package.json'),
    );
  });
});
