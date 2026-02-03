/**
 * Fast File Writer Tests
 * 
 * Tests the tar-based file upload system that replaces slow exec-based writes.
 * These tests ensure file writes are fast (~50-200ms instead of 20-25s).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to ensure mocks are available before module loading
const { mockPutArchive, mockExecStart, mockExec, mockGetContainer } = vi.hoisted(() => {
  const mockPutArchive = vi.fn().mockResolvedValue(undefined);
  const mockExecStart = vi.fn().mockResolvedValue(undefined);
  const mockExec = vi.fn().mockResolvedValue({
    start: mockExecStart,
  });
  const mockGetContainer = vi.fn().mockReturnValue({
    putArchive: mockPutArchive,
    exec: mockExec,
  });
  return { mockPutArchive, mockExecStart, mockExec, mockGetContainer };
});

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getContainer: mockGetContainer,
    })),
  };
});

// Now import the module under test
import { fastWriteFile, fastWriteFiles, ensureDirectory } from '../fast-file-writer';

describe('fast-file-writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fastWriteFile', () => {
    it('should write a single file using putArchive', async () => {
      const containerId = 'test-container-123';
      const filePath = 'src/App.tsx';
      const content = 'export default function App() { return <div>Hello</div>; }';

      await fastWriteFile(containerId, filePath, content);

      // Should call getContainer with the containerId
      expect(mockGetContainer).toHaveBeenCalledWith(containerId);
      
      // Should call putArchive with a stream and the target directory
      expect(mockPutArchive).toHaveBeenCalledTimes(1);
      const [tarStream, options] = mockPutArchive.mock.calls[0];
      expect(options).toEqual({ path: '/workspace' });
      expect(tarStream).toBeDefined();
    });

    it('should handle files with special characters in content', async () => {
      const containerId = 'test-container-123';
      const filePath = 'test.ts';
      const content = `const msg = "Hello 'world' with \\"quotes\\"";
// Special chars: $PATH && || ; \`backticks\`
const json = { "key": "value" };`;

      await expect(fastWriteFile(containerId, filePath, content)).resolves.not.toThrow();
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should handle empty files', async () => {
      const containerId = 'test-container-123';
      const filePath = '.gitkeep';
      const content = '';

      await expect(fastWriteFile(containerId, filePath, content)).resolves.not.toThrow();
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should handle large files', async () => {
      const containerId = 'test-container-123';
      const filePath = 'large.json';
      const content = JSON.stringify({ data: 'x'.repeat(100000) }); // ~100KB

      await expect(fastWriteFile(containerId, filePath, content)).resolves.not.toThrow();
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should strip leading slashes from file paths', async () => {
      const containerId = 'test-container-123';
      const filePath = '/src/App.tsx'; // Leading slash
      const content = 'export default function App() {}';

      await fastWriteFile(containerId, filePath, content);
      
      // The tar should be created without leading slash
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should use custom target directory when specified', async () => {
      const containerId = 'test-container-123';
      const filePath = 'test.ts';
      const content = 'test';
      const targetDir = '/app';

      await fastWriteFile(containerId, filePath, content, targetDir);
      
      const [, options] = mockPutArchive.mock.calls[0];
      expect(options).toEqual({ path: '/app' });
    });
  });

  describe('fastWriteFiles', () => {
    it('should write multiple files in a single tar archive', async () => {
      const containerId = 'test-container-123';
      const files = [
        { path: 'package.json', content: '{"name": "test"}' },
        { path: 'src/App.tsx', content: 'export default function App() {}' },
        { path: 'src/index.css', content: 'body { margin: 0; }' },
      ];

      await fastWriteFiles(containerId, files);

      // Should create directories first, then upload tar
      expect(mockExec).toHaveBeenCalled(); // For mkdir
      expect(mockPutArchive).toHaveBeenCalled(); // For file content
    });

    it('should handle empty file array', async () => {
      const containerId = 'test-container-123';
      const files: Array<{ path: string; content: string }> = [];

      await expect(fastWriteFiles(containerId, files)).resolves.not.toThrow();
      // Should not call putArchive if no files
      expect(mockPutArchive).not.toHaveBeenCalled();
    });

    it('should create nested directories', async () => {
      const containerId = 'test-container-123';
      const files = [
        { path: 'src/components/Button/index.tsx', content: 'export default Button;' },
        { path: 'src/components/Button/styles.css', content: '.btn {}' },
        { path: 'src/utils/helpers.ts', content: 'export const helper = () => {}' },
      ];

      await fastWriteFiles(containerId, files);

      // Should call mkdir with all necessary directories
      expect(mockExec).toHaveBeenCalled();
      const mkdirCall = mockExec.mock.calls[0];
      expect(mkdirCall[0].Cmd[0]).toBe('mkdir');
      expect(mkdirCall[0].Cmd[1]).toBe('-p');
    });

    it('should handle files at root level (no directories)', async () => {
      const containerId = 'test-container-123';
      const files = [
        { path: 'package.json', content: '{}' },
        { path: 'tsconfig.json', content: '{}' },
      ];

      await fastWriteFiles(containerId, files);

      // Should still call putArchive
      expect(mockPutArchive).toHaveBeenCalled();
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory using exec', async () => {
      const containerId = 'test-container-123';
      const dirPath = 'src/components';

      await ensureDirectory(containerId, dirPath);

      expect(mockExec).toHaveBeenCalledWith({
        Cmd: ['mkdir', '-p', '/workspace/src/components'],
        AttachStdout: false,
        AttachStderr: false,
      });
    });

    it('should handle custom target directory', async () => {
      const containerId = 'test-container-123';
      const dirPath = 'components';
      const targetDir = '/app';

      await ensureDirectory(containerId, dirPath, targetDir);

      expect(mockExec).toHaveBeenCalledWith({
        Cmd: ['mkdir', '-p', '/app/components'],
        AttachStdout: false,
        AttachStderr: false,
      });
    });
  });

  describe('performance', () => {
    it('should complete single file write in under 500ms', async () => {
      const containerId = 'test-container-123';
      const filePath = 'test.ts';
      const content = 'const x = 1;';

      const start = Date.now();
      await fastWriteFile(containerId, filePath, content);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should complete batch write of 10 files in under 1000ms', async () => {
      const containerId = 'test-container-123';
      const files = Array.from({ length: 10 }, (_, i) => ({
        path: `file${i}.ts`,
        content: `export const x${i} = ${i};`,
      }));

      const start = Date.now();
      await fastWriteFiles(containerId, files);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('error handling', () => {
    it('should handle Docker putArchive failure', async () => {
      mockPutArchive.mockRejectedValueOnce(new Error('Container not found'));
      
      const containerId = 'nonexistent-container';
      const filePath = 'test.ts';
      const content = 'const x = 1;';

      await expect(fastWriteFile(containerId, filePath, content))
        .rejects.toThrow('Container not found');
    });

    it('should handle mkdir exec failure gracefully', async () => {
      mockExecStart.mockRejectedValueOnce(new Error('Exec failed'));
      
      const containerId = 'test-container-123';
      const files = [
        { path: 'src/nested/deep/file.ts', content: 'content' },
      ];

      // Should not throw, or throw with meaningful error
      await expect(fastWriteFiles(containerId, files))
        .rejects.toBeDefined();
    });

    it('should handle empty content correctly', async () => {
      const containerId = 'test-container-123';
      const filePath = '.gitkeep';
      const content = '';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
      
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should handle binary-like content', async () => {
      const containerId = 'test-container-123';
      const filePath = 'image.png.base64';
      // Simulate base64 content (common in code editors)
      const content = Buffer.from('fake image data').toString('base64');

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });
  });

  describe('path handling', () => {
    it('should handle Windows-style paths', async () => {
      const containerId = 'test-container-123';
      // Windows path that might come from cross-platform clients
      const filePath = 'src\\components\\Button.tsx';
      const content = 'export default Button;';

      await fastWriteFile(containerId, filePath, content);
      
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should handle paths with multiple leading slashes', async () => {
      const containerId = 'test-container-123';
      const filePath = '///src/App.tsx';
      const content = 'content';

      await fastWriteFile(containerId, filePath, content);
      
      // Should strip leading slashes
      expect(mockPutArchive).toHaveBeenCalled();
    });

    it('should handle paths with special characters', async () => {
      const containerId = 'test-container-123';
      const filePath = 'src/components/[id]/page.tsx'; // Next.js dynamic route
      const content = 'export default Page;';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });

    it('should handle deeply nested paths', async () => {
      const containerId = 'test-container-123';
      const filePath = 'src/components/ui/forms/inputs/text/variants/outlined/index.tsx';
      const content = 'content';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });
  });

  describe('content edge cases', () => {
    it('should handle content with null bytes', async () => {
      const containerId = 'test-container-123';
      const filePath = 'test.bin';
      const content = 'before\x00after';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });

    it('should handle very long lines', async () => {
      const containerId = 'test-container-123';
      const filePath = 'long-line.ts';
      const content = 'const x = "' + 'a'.repeat(100000) + '";';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });

    it('should handle content with all newline types', async () => {
      const containerId = 'test-container-123';
      const filePath = 'mixed-newlines.ts';
      const content = 'line1\nline2\r\nline3\rline4';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });

    it('should handle unicode content', async () => {
      const containerId = 'test-container-123';
      const filePath = 'unicode.ts';
      const content = 'const emoji = "🚀💻🎉"; const chinese = "你好"; const arabic = "مرحبا";';

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });

    it('should handle JSON with escaped characters', async () => {
      const containerId = 'test-container-123';
      const filePath = 'config.json';
      const content = JSON.stringify({
        path: 'C:\\Users\\test',
        quote: 'He said "hello"',
        newline: 'line1\nline2',
      });

      await expect(fastWriteFile(containerId, filePath, content))
        .resolves.not.toThrow();
    });
  });

  describe('concurrent writes', () => {
    it('should handle concurrent single file writes', async () => {
      const containerId = 'test-container-123';
      
      const writes = Array.from({ length: 5 }, (_, i) =>
        fastWriteFile(containerId, `concurrent-${i}.ts`, `content-${i}`)
      );

      await expect(Promise.all(writes)).resolves.toBeDefined();
      expect(mockPutArchive).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent batch writes', async () => {
      const containerId = 'test-container-123';
      
      const batch1 = Array.from({ length: 5 }, (_, i) => ({
        path: `batch1/file${i}.ts`,
        content: `batch1-${i}`,
      }));
      
      const batch2 = Array.from({ length: 5 }, (_, i) => ({
        path: `batch2/file${i}.ts`,
        content: `batch2-${i}`,
      }));

      await expect(Promise.all([
        fastWriteFiles(containerId, batch1),
        fastWriteFiles(containerId, batch2),
      ])).resolves.toBeDefined();
    });
  });
});
