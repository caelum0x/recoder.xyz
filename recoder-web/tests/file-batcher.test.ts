import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { dockerPostMock } = vi.hoisted(() => {
  const dockerPostMock = vi.fn(async (endpoint: string) => {
    if (endpoint.includes('/api/files/') && endpoint.endsWith('/batch')) {
      return {
        success: true,
        count: 2,
        failedFiles: [{ path: 'src/b.ts', error: 'write failed' }],
      };
    }

    // Single-file retry path (via dockerPost - not used by writeFileSingle)
    if (endpoint.includes('/api/file/')) {
      return { success: true };
    }

    return { success: true };
  });
  return { dockerPostMock };
});

vi.mock('~/lib/services/docker-api', async () => {
  return {
    dockerPost: dockerPostMock,
    DOCKER_URL: 'http://localhost:3100',
    getSessionToken: () => null,
  };
});

import {
  queueFileWrites,
  flushFileWrites,
  setFileBatcherProject,
  clearPendingFiles,
} from '~/lib/services/file-batcher';

// Track fetch calls for the single-file retry path (writeFileSingle uses fetch directly)
const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ success: true }),
}));

describe('file-batcher', () => {
  beforeEach(() => {
    setFileBatcherProject('project-1');
    // writeFileSingle uses global fetch, not dockerPost
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    clearPendingFiles();
    dockerPostMock.mockClear();
    fetchMock.mockClear();
  });

  it('retries only failed files from batch response', async () => {
    queueFileWrites([
      { path: 'src/a.ts', content: 'a' },
      { path: 'src/b.ts', content: 'b' },
    ]);

    const result = await flushFileWrites();

    expect(result.totalFiles).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.successCount).toBe(2);

    // Batch endpoint called once via dockerPost
    const dockerCalls = dockerPostMock.mock.calls.map((c) => c[0]);
    expect(dockerCalls.filter((c: string) => c.endsWith('/batch')).length).toBe(1);

    // Single-file retry called once via fetch (for the failed src/b.ts)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('/api/file/');
  });

  describe('batch performance', () => {
    it('should batch multiple files into single request', async () => {
      const files = Array.from({ length: 10 }, (_, i) => ({
        path: `src/file${i}.ts`,
        content: `export const x${i} = ${i};`,
      }));

      queueFileWrites(files);
      const result = await flushFileWrites();

      // Should only make one batch call, not 10 individual calls
      const batchCalls = dockerPostMock.mock.calls.filter((c) => 
        (c[0] as string).endsWith('/batch')
      );
      expect(batchCalls.length).toBe(1);
    });

    it('should handle empty file queue', async () => {
      const result = await flushFileWrites();
      
      expect(result.totalFiles).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should retry failed files individually', async () => {
      // First batch has partial failure (mocked above)
      queueFileWrites([
        { path: 'src/a.ts', content: 'a' },
        { path: 'src/b.ts', content: 'b' }, // This one fails in batch
      ]);

      await flushFileWrites();

      // Should have retried the failed file
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('project configuration', () => {
    it('should use configured project ID in API calls', async () => {
      setFileBatcherProject('my-test-project');
      
      queueFileWrites([{ path: 'test.ts', content: 'test' }]);
      await flushFileWrites();

      const batchCall = dockerPostMock.mock.calls.find((c) => 
        (c[0] as string).endsWith('/batch')
      );
      expect(batchCall?.[0]).toContain('my-test-project');
    });
  });
});
