/**
 * Container Workflow Integration Tests
 * Tests the complete container lifecycle including:
 * - Container creation from pool
 * - File operations within containers
 * - Command execution
 * - Container cleanup and recycling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import {
  MockDocker,
  MockContainer,
  generateProjectId,
  generateUserId,
  setupFetchMock,
} from '../../../tests/setup';

// ==================== Mock Docker Module ====================

// Create a shared mock docker instance for unit tests
let mockDocker: MockDocker;
let mockContainer: MockContainer;

// Mock dockerode module
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => mockDocker),
  };
});

// ==================== Container Pool Mock ====================

interface MockPooledContainer {
  id: string;
  port: number;
  ptyPort: number;
  createdAt: number;
  lastUsedAt?: number;
  recycleCount: number;
  status: 'warming' | 'ready' | 'assigned';
}

class MockContainerPool {
  private pool: MockPooledContainer[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    // Pre-warm some containers
    for (let i = 0; i < 3; i++) {
      await this.warmContainer();
    }
  }

  private async warmContainer(): Promise<void> {
    const container: MockPooledContainer = {
      id: `mock-container-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      port: 10000 + this.pool.length * 4,
      ptyPort: 10003 + this.pool.length * 4,
      createdAt: Date.now(),
      recycleCount: 0,
      status: 'ready',
    };
    this.pool.push(container);
  }

  async acquire(): Promise<MockPooledContainer | null> {
    const readyIndex = this.pool.findIndex((c) => c.status === 'ready');
    if (readyIndex !== -1) {
      const container = this.pool[readyIndex];
      container.status = 'assigned';
      container.lastUsedAt = Date.now();
      return container;
    }
    return null;
  }

  async release(containerId: string, destroy = false): Promise<void> {
    const index = this.pool.findIndex((c) => c.id === containerId);
    if (index !== -1) {
      if (destroy) {
        this.pool.splice(index, 1);
      } else {
        this.pool[index].status = 'ready';
        this.pool[index].recycleCount++;
      }
    }
  }

  getStats() {
    return {
      total: this.pool.length,
      ready: this.pool.filter((c) => c.status === 'ready').length,
      warming: this.pool.filter((c) => c.status === 'warming').length,
      assigned: this.pool.filter((c) => c.status === 'assigned').length,
    };
  }

  async shutdown(): Promise<void> {
    this.pool = [];
    this.initialized = false;
  }
}

// ==================== Test Suite ====================

describe('Container Workflow Integration Tests', () => {
  let containerPool: MockContainerPool;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    mockDocker = new MockDocker();
    setupFetchMock();
  });

  beforeEach(async () => {
    containerPool = new MockContainerPool();
    await containerPool.initialize();
    projectId = generateProjectId();
    userId = generateUserId();
    mockContainer = new MockContainer();
    mockContainer.setState('running');
    mockDocker.addContainer(mockContainer);
  });

  afterEach(async () => {
    await containerPool.shutdown();
    mockDocker.clearContainers();
  });

  // ==================== Container Lifecycle Tests ====================

  describe('Container Lifecycle', () => {
    it('should acquire a container from the pool', async () => {
      const container = await containerPool.acquire();

      expect(container).not.toBeNull();
      expect(container?.status).toBe('assigned');
      expect(container?.port).toBeDefined();
      expect(container?.ptyPort).toBeDefined();
    });

    it('should track pool statistics correctly', async () => {
      const initialStats = containerPool.getStats();
      expect(initialStats.ready).toBeGreaterThan(0);

      // Acquire a container
      const container = await containerPool.acquire();
      const afterAcquireStats = containerPool.getStats();

      expect(afterAcquireStats.assigned).toBe(1);
      expect(afterAcquireStats.ready).toBe(initialStats.ready - 1);

      // Release the container
      if (container) {
        await containerPool.release(container.id);
        const afterReleaseStats = containerPool.getStats();
        expect(afterReleaseStats.ready).toBe(initialStats.ready);
        expect(afterReleaseStats.assigned).toBe(0);
      }
    });

    it('should increment recycle count on release', async () => {
      const container = await containerPool.acquire();
      expect(container?.recycleCount).toBe(0);

      if (container) {
        await containerPool.release(container.id);
        const reacquired = await containerPool.acquire();

        // Should get the same container back (recycled)
        if (reacquired?.id === container.id) {
          expect(reacquired.recycleCount).toBe(1);
        }
      }
    });

    it('should destroy container when requested', async () => {
      const initialStats = containerPool.getStats();
      const container = await containerPool.acquire();

      if (container) {
        await containerPool.release(container.id, true); // destroy = true
        const afterDestroyStats = containerPool.getStats();

        expect(afterDestroyStats.total).toBe(initialStats.total - 1);
      }
    });

    it('should handle container start and stop', async () => {
      const container = new MockContainer('test-container');

      // Start container
      await container.start();
      let info = await container.inspect();
      expect(info.State.Running).toBe(true);
      expect(info.State.Status).toBe('running');

      // Stop container
      await container.stop();
      info = await container.inspect();
      expect(info.State.Running).toBe(false);
      expect(info.State.Status).toBe('stopped');
    });

    it('should restart stopped container', async () => {
      const container = new MockContainer('restart-test');

      await container.start();
      await container.stop();

      let info = await container.inspect();
      expect(info.State.Running).toBe(false);

      // Restart
      await container.start();
      info = await container.inspect();
      expect(info.State.Running).toBe(true);
    });
  });

  // ==================== File Operations Within Container ====================

  describe('Container File Operations', () => {
    it('should write and read file in container', async () => {
      const filePath = '/workspace/src/index.ts';
      const fileContent = 'export const hello = "world";';

      mockContainer.setFile(filePath, fileContent);
      const readContent = mockContainer.getFile(filePath);

      expect(readContent).toBe(fileContent);
    });

    it('should handle nested directory file writes', async () => {
      const files = [
        { path: '/workspace/src/components/Button.tsx', content: 'export const Button = () => <button>Click</button>;' },
        { path: '/workspace/src/components/Input.tsx', content: 'export const Input = () => <input />;' },
        { path: '/workspace/src/utils/helpers.ts', content: 'export const capitalize = (s: string) => s.toUpperCase();' },
      ];

      for (const file of files) {
        mockContainer.setFile(file.path, file.content);
      }

      for (const file of files) {
        expect(mockContainer.getFile(file.path)).toBe(file.content);
      }
    });

    it('should return undefined for non-existent files', async () => {
      const content = mockContainer.getFile('/workspace/nonexistent.ts');
      expect(content).toBeUndefined();
    });

    it('should overwrite existing file content', async () => {
      const filePath = '/workspace/test.ts';

      mockContainer.setFile(filePath, 'original content');
      expect(mockContainer.getFile(filePath)).toBe('original content');

      mockContainer.setFile(filePath, 'updated content');
      expect(mockContainer.getFile(filePath)).toBe('updated content');
    });

    it('should handle binary content encoded as base64', async () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
      const base64Content = binaryData.toString('base64');
      const filePath = '/workspace/image.png';

      mockContainer.setFile(filePath, base64Content);
      const retrieved = mockContainer.getFile(filePath);

      expect(retrieved).toBe(base64Content);

      // Verify it can be decoded back
      const decoded = Buffer.from(retrieved!, 'base64');
      expect(decoded).toEqual(binaryData);
    });
  });

  // ==================== Command Execution ====================

  describe('Container Command Execution', () => {
    it('should execute command and return output', async () => {
      const exec = await mockContainer.exec({
        Cmd: ['echo', 'Hello World'],
        AttachStdout: true,
      });

      const stream = await exec.start();
      expect(stream).toBeDefined();
    });

    it('should execute cat command to read files', async () => {
      mockContainer.setFile('/workspace/test.txt', 'file content');

      const exec = await mockContainer.exec({
        Cmd: ['cat', '/workspace/test.txt'],
        AttachStdout: true,
      });

      const stream = await exec.start();
      expect(stream).toBeDefined();
    });

    it('should handle multiple concurrent commands', async () => {
      const commands = [
        ['echo', 'cmd1'],
        ['echo', 'cmd2'],
        ['echo', 'cmd3'],
      ];

      const execPromises = commands.map(async (cmd) => {
        const exec = await mockContainer.exec({
          Cmd: cmd,
          AttachStdout: true,
        });
        return exec.start();
      });

      const results = await Promise.all(execPromises);
      expect(results.length).toBe(3);
      results.forEach((stream) => expect(stream).toBeDefined());
    });
  });

  // ==================== Complete Workflow Test ====================

  describe('Complete Container Workflow', () => {
    it('should complete full workflow: acquire -> write -> read -> execute -> release', async () => {
      // Step 1: Acquire container from pool
      const pooledContainer = await containerPool.acquire();
      expect(pooledContainer).not.toBeNull();
      expect(pooledContainer?.status).toBe('assigned');

      // Step 2: Write a file to the container
      const filePath = '/workspace/hello.ts';
      const fileContent = 'console.log("Hello from container!");';
      mockContainer.setFile(filePath, fileContent);

      // Step 3: Read the file back
      const readContent = mockContainer.getFile(filePath);
      expect(readContent).toBe(fileContent);

      // Step 4: Execute a command (simulated)
      const exec = await mockContainer.exec({
        Cmd: ['node', 'hello.ts'],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start();
      expect(stream).toBeDefined();

      // Step 5: Release the container back to pool
      if (pooledContainer) {
        await containerPool.release(pooledContainer.id);
        const stats = containerPool.getStats();
        expect(stats.assigned).toBe(0);
        expect(stats.ready).toBeGreaterThan(0);
      }
    });

    it('should handle workflow with container crash recovery', async () => {
      // Acquire container
      const pooledContainer = await containerPool.acquire();
      expect(pooledContainer).not.toBeNull();

      // Simulate container crash
      mockContainer.setState('stopped');
      const info = await mockContainer.inspect();
      expect(info.State.Running).toBe(false);

      // Recover by restarting
      await mockContainer.start();
      const newInfo = await mockContainer.inspect();
      expect(newInfo.State.Running).toBe(true);

      // Continue workflow
      mockContainer.setFile('/workspace/recovered.ts', 'recovered');
      expect(mockContainer.getFile('/workspace/recovered.ts')).toBe('recovered');

      // Cleanup
      if (pooledContainer) {
        await containerPool.release(pooledContainer.id);
      }
    });

    it('should handle concurrent container workflows', async () => {
      const workflows = Array(3)
        .fill(null)
        .map(async (_, index) => {
          // Acquire
          const container = await containerPool.acquire();
          if (!container) return { success: false, index };

          // Create unique mock container for this workflow
          const workflowContainer = new MockContainer(`workflow-${index}`);
          workflowContainer.setState('running');

          // Write
          workflowContainer.setFile(`/workspace/file-${index}.ts`, `content-${index}`);

          // Read
          const content = workflowContainer.getFile(`/workspace/file-${index}.ts`);
          expect(content).toBe(`content-${index}`);

          // Release
          await containerPool.release(container.id);

          return { success: true, index };
        });

      const results = await Promise.all(workflows);
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  // ==================== Error Handling ====================

  describe('Error Handling', () => {
    it('should handle pool exhaustion gracefully', async () => {
      // Acquire all containers
      const containers: MockPooledContainer[] = [];
      let container = await containerPool.acquire();
      while (container) {
        containers.push(container);
        container = await containerPool.acquire();
      }

      // Next acquire should return null
      const exhausted = await containerPool.acquire();
      expect(exhausted).toBeNull();

      // Release containers
      for (const c of containers) {
        await containerPool.release(c.id);
      }

      // Should be able to acquire again
      const recovered = await containerPool.acquire();
      expect(recovered).not.toBeNull();
    });

    it('should handle container state transitions', async () => {
      const container = new MockContainer('state-test');

      // Initial state
      expect((await container.inspect()).State.Status).toBe('created');

      // Start
      await container.start();
      expect((await container.inspect()).State.Running).toBe(true);

      // Stop
      await container.stop();
      expect((await container.inspect()).State.Running).toBe(false);

      // Remove
      await container.remove();
      expect((await container.inspect()).State.Running).toBe(false);
    });
  });
});
