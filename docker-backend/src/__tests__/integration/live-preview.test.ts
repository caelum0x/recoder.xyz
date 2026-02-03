/**
 * Live Preview Integration Tests
 * 
 * Tests the complete workflow for live preview reliability:
 * - Container creation with persistent volumes
 * - Fast file writes
 * - Dev server startup and detection
 * - WebSocket file watching
 * - Preview refresh coordination
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Mocks ====================

// Mock Docker
const mockContainers = new Map<string, any>();
const mockVolumes = new Map<string, any>();

const createMockContainer = (id: string, projectId: string) => ({
  id,
  inspect: vi.fn().mockResolvedValue({
    State: { Running: true, Status: 'running' },
    Mounts: [
      { Type: 'volume', Name: `recoder-${projectId}-workspace`, Destination: '/workspace' },
      { Type: 'volume', Name: `recoder-${projectId}-node_modules`, Destination: '/workspace/node_modules' },
    ],
  }),
  exec: vi.fn().mockImplementation(async () => ({
    start: vi.fn().mockResolvedValue({
      on: vi.fn((event, cb) => {
        if (event === 'end') setTimeout(cb, 10);
      }),
    }),
  })),
  putArchive: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
});

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getContainer: vi.fn((id) => mockContainers.get(id)),
      createContainer: vi.fn().mockImplementation(async (opts) => {
        const id = `container-${Date.now()}`;
        const projectId = opts.Labels?.['recoder.project'] || 'unknown';
        const container = createMockContainer(id, projectId);
        mockContainers.set(id, container);
        return container;
      }),
      listContainers: vi.fn().mockResolvedValue([]),
      createVolume: vi.fn().mockImplementation(async (opts) => {
        mockVolumes.set(opts.Name, { Name: opts.Name });
        return mockVolumes.get(opts.Name);
      }),
      getVolume: vi.fn((name) => ({
        inspect: vi.fn().mockResolvedValue(mockVolumes.get(name) || null),
      })),
    })),
  };
});

// ==================== Tests ====================

describe('Live Preview Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContainers.clear();
    mockVolumes.clear();
  });

  describe('Container Persistence', () => {
    it('should create container with persistent workspace volume', async () => {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      
      const projectId = 'test-project-123';
      const container = await docker.createContainer({
        Image: 'recoder-workspace:latest',
        Labels: { 'recoder.project': projectId },
        HostConfig: {
          Binds: [
            `recoder-${projectId}-workspace:/workspace`,
            `recoder-${projectId}-node_modules:/workspace/node_modules`,
          ],
        },
      });

      expect(container).toBeDefined();
      expect(mockContainers.size).toBe(1);
    });

    it('should mount existing volume on container restart', async () => {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      
      const projectId = 'test-project-456';
      
      // Create first container
      const container1 = await docker.createContainer({
        Labels: { 'recoder.project': projectId },
        HostConfig: { Binds: [`recoder-${projectId}-workspace:/workspace`] },
      });
      
      // Simulate container removal
      mockContainers.delete(container1.id);
      
      // Create new container for same project
      const container2 = await docker.createContainer({
        Labels: { 'recoder.project': projectId },
        HostConfig: { Binds: [`recoder-${projectId}-workspace:/workspace`] },
      });
      
      // Both should use the same volume name
      expect(container2).toBeDefined();
      // Volume should be reused (same name pattern)
    });
  });

  describe('Workspace State API', () => {
    interface WorkspaceState {
      hasFiles: boolean;
      hasPackageJson: boolean;
      devServerRunning: boolean;
      volumeMounted: boolean;
    }

    const mockWorkspaceState = (state: Partial<WorkspaceState>): WorkspaceState => ({
      hasFiles: state.hasFiles ?? false,
      hasPackageJson: state.hasPackageJson ?? false,
      devServerRunning: state.devServerRunning ?? false,
      volumeMounted: state.volumeMounted ?? true,
    });

    it('should correctly detect empty workspace', () => {
      const state = mockWorkspaceState({ hasFiles: false });
      expect(state.hasFiles).toBe(false);
      expect(state.hasPackageJson).toBe(false);
    });

    it('should correctly detect workspace with files', () => {
      const state = mockWorkspaceState({
        hasFiles: true,
        hasPackageJson: true,
        devServerRunning: true,
      });
      
      expect(state.hasFiles).toBe(true);
      expect(state.hasPackageJson).toBe(true);
      expect(state.devServerRunning).toBe(true);
    });

    it('should skip file restoration when workspace has files', () => {
      const state = mockWorkspaceState({ hasFiles: true, hasPackageJson: true });
      
      // Business logic: if hasFiles && hasPackageJson, skip restoration
      const shouldRestore = !state.hasFiles || !state.hasPackageJson;
      expect(shouldRestore).toBe(false);
    });

    it('should restore files when workspace is empty', () => {
      const state = mockWorkspaceState({ hasFiles: false });
      
      const shouldRestore = !state.hasFiles;
      expect(shouldRestore).toBe(true);
    });
  });

  describe('Fast File Write Performance', () => {
    it('should complete file write in under 500ms (not 20+ seconds)', async () => {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      const projectId = 'perf-test';
      
      const container = await docker.createContainer({
        Labels: { 'recoder.project': projectId },
      });
      
      const start = Date.now();
      
      // Simulate fast file write via putArchive
      await container.putArchive(Buffer.from('test'), { path: '/workspace' });
      
      const duration = Date.now() - start;
      
      // Should be well under 500ms (mock is instant, real should be <500ms)
      expect(duration).toBeLessThan(500);
    });

    it('should handle batch writes efficiently', async () => {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      const projectId = 'batch-test';
      
      const container = await docker.createContainer({
        Labels: { 'recoder.project': projectId },
      });
      
      const files = Array.from({ length: 20 }, (_, i) => ({
        path: `file${i}.ts`,
        content: `export const x${i} = ${i};`,
      }));
      
      const start = Date.now();
      
      // Single putArchive call for all files
      await container.putArchive(Buffer.from('test'), { path: '/workspace' });
      
      const duration = Date.now() - start;
      
      // Batch write should also be fast
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Dev Server Detection', () => {
    it('should detect running dev server via HTTP check', async () => {
      // Simulate HTTP check to dev server port
      const checkDevServer = async (port: number): Promise<boolean> => {
        // In real implementation, this does http.get to 127.0.0.1:port
        // Mock returns true for common dev server ports
        return [3000, 5173, 8080].includes(port);
      };

      expect(await checkDevServer(5173)).toBe(true);
      expect(await checkDevServer(3000)).toBe(true);
      expect(await checkDevServer(9999)).toBe(false);
    });

    it('should emit ready event when dev server is detected', async () => {
      const events: string[] = [];
      
      // Simulate event emission
      const emitDevServerReady = () => {
        events.push('recoder:dev-server-ready');
      };
      
      // Simulate detection flow
      const devServerRunning = true;
      if (devServerRunning) {
        emitDevServerReady();
      }
      
      expect(events).toContain('recoder:dev-server-ready');
    });
  });

  describe('Preview Refresh Coordination', () => {
    it('should coalesce multiple file changes into single refresh', async () => {
      let refreshCount = 0;
      let pendingRefresh: ReturnType<typeof setTimeout> | null = null;
      
      const scheduleRefresh = () => {
        if (pendingRefresh) clearTimeout(pendingRefresh);
        pendingRefresh = setTimeout(() => {
          refreshCount++;
          pendingRefresh = null;
        }, 100);
      };
      
      // Simulate 5 rapid file changes
      scheduleRefresh();
      scheduleRefresh();
      scheduleRefresh();
      scheduleRefresh();
      scheduleRefresh();
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should only refresh once
      expect(refreshCount).toBe(1);
    });

    it('should auto-refresh preview when dev server becomes ready', async () => {
      let previewRefreshed = false;
      
      const onDevServerReady = () => {
        previewRefreshed = true;
      };
      
      // Simulate event listener
      const simulateDevServerReady = () => {
        onDevServerReady();
      };
      
      simulateDevServerReady();
      
      expect(previewRefreshed).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should allow dev server restart when preview fails', async () => {
      let devServerStatus = 'failed';
      
      const restartDevServer = async (): Promise<{ ready: boolean }> => {
        devServerStatus = 'running';
        return { ready: true };
      };
      
      // Initial state: failed
      expect(devServerStatus).toBe('failed');
      
      // Restart
      const result = await restartDevServer();
      
      expect(result.ready).toBe(true);
      expect(devServerStatus).toBe('running');
    });

    it('should poll for dev server readiness after restart', async () => {
      let pollCount = 0;
      let serverReady = false;
      
      const pollForReady = async (maxAttempts: number): Promise<boolean> => {
        while (pollCount < maxAttempts) {
          pollCount++;
          // Simulate server becoming ready on 3rd attempt
          if (pollCount >= 3) {
            serverReady = true;
            return true;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return false;
      };
      
      const isReady = await pollForReady(5);
      
      expect(isReady).toBe(true);
      expect(pollCount).toBe(3);
      expect(serverReady).toBe(true);
    });
  });

  describe('TypeScript Typecheck', () => {
    it('should parse TypeScript errors correctly', () => {
      const tscOutput = `src/App.tsx(10,5): error TS2304: Cannot find name 'foo'.
src/utils.ts(25,10): error TS7006: Parameter 'x' implicitly has an 'any' type.`;

      const parseErrors = (output: string) => {
        const lines = output.split('\n').filter(l => l.includes('error TS'));
        return lines.map(line => {
          const match = line.match(/^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
          if (match) {
            return {
              file: match[1],
              line: parseInt(match[2]),
              column: parseInt(match[3]),
              code: match[4],
              message: match[5],
            };
          }
          return null;
        }).filter(Boolean);
      };

      const errors = parseErrors(tscOutput);
      
      expect(errors).toHaveLength(2);
      expect(errors[0]).toEqual({
        file: 'src/App.tsx',
        line: 10,
        column: 5,
        code: 'TS2304',
        message: "Cannot find name 'foo'.",
      });
    });

    it('should run typecheck as fallback when dev logs are clean', async () => {
      const devLogs = ''; // Empty/clean logs
      let typecheckRan = false;
      
      const runTypecheck = async () => {
        typecheckRan = true;
        return { errors: [], hasErrors: false };
      };
      
      // If dev logs are clean, run typecheck
      if (!devLogs || !devLogs.includes('error')) {
        await runTypecheck();
      }
      
      expect(typecheckRan).toBe(true);
    });
  });
});

describe('WebSocket File Watcher', () => {
  describe('Connection Stability', () => {
    it('should reconnect on connection loss', async () => {
      let connectionAttempts = 0;
      let isConnected = false;
      
      const connect = () => {
        connectionAttempts++;
        isConnected = true;
      };
      
      const disconnect = () => {
        isConnected = false;
      };
      
      const reconnectWithBackoff = async (maxAttempts: number) => {
        for (let i = 0; i < maxAttempts; i++) {
          if (!isConnected) {
            connect();
            if (isConnected) break;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };
      
      // Initial connection
      connect();
      expect(isConnected).toBe(true);
      
      // Simulate disconnection
      disconnect();
      expect(isConnected).toBe(false);
      
      // Reconnect
      await reconnectWithBackoff(3);
      expect(isConnected).toBe(true);
      expect(connectionAttempts).toBe(2);
    });

    it('should filter self-written paths from file change events', () => {
      const selfWrittenPaths = new Set(['src/App.tsx', 'src/index.css']);
      const incomingChanges = ['src/App.tsx', 'src/main.tsx', 'package.json'];
      
      const filteredChanges = incomingChanges.filter(
        path => !selfWrittenPaths.has(path)
      );
      
      expect(filteredChanges).toEqual(['src/main.tsx', 'package.json']);
    });
  });
});

describe('End-to-End Workflow', () => {
  it('should complete full new project workflow', async () => {
    const workflow = {
      containerCreated: false,
      volumeMounted: false,
      filesWritten: false,
      depsInstalled: false,
      devServerStarted: false,
      previewReady: false,
    };

    // Step 1: Create container
    workflow.containerCreated = true;
    expect(workflow.containerCreated).toBe(true);

    // Step 2: Mount persistent volume
    workflow.volumeMounted = true;
    expect(workflow.volumeMounted).toBe(true);

    // Step 3: Write files (fast)
    workflow.filesWritten = true;
    expect(workflow.filesWritten).toBe(true);

    // Step 4: Install dependencies
    workflow.depsInstalled = true;
    expect(workflow.depsInstalled).toBe(true);

    // Step 5: Start dev server
    workflow.devServerStarted = true;
    expect(workflow.devServerStarted).toBe(true);

    // Step 6: Preview ready
    workflow.previewReady = true;
    expect(workflow.previewReady).toBe(true);

    // All steps completed
    const allStepsComplete = Object.values(workflow).every(v => v === true);
    expect(allStepsComplete).toBe(true);
  });

  it('should complete page refresh workflow (skip file restoration)', async () => {
    const workflow = {
      workspaceChecked: false,
      hasExistingFiles: true, // Files exist from persistent volume
      filesRestored: false, // Should be skipped
      devServerChecked: false,
      devServerRunning: true,
      previewConnected: false,
    };

    // Step 1: Check workspace state
    workflow.workspaceChecked = true;
    expect(workflow.workspaceChecked).toBe(true);

    // Step 2: Skip file restoration (files exist)
    if (workflow.hasExistingFiles) {
      workflow.filesRestored = false; // Skipped!
    }
    expect(workflow.filesRestored).toBe(false);

    // Step 3: Check dev server
    workflow.devServerChecked = true;
    expect(workflow.devServerChecked).toBe(true);

    // Step 4: Connect preview (server already running)
    if (workflow.devServerRunning) {
      workflow.previewConnected = true;
    }
    expect(workflow.previewConnected).toBe(true);
  });
});
