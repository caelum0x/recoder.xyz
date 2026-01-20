/**
 * Test setup/teardown for docker-backend tests
 * Provides mocks, utilities, and test helpers
 */

import { vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ==================== Environment Setup ====================

// Set test environment
process.env.NODE_ENV = 'test';
process.env.REQUIRE_AUTH = 'false';
process.env.ENABLE_CONTAINER_POOL = 'false';
process.env.APP_API_URL = 'http://localhost:3000';
process.env.INTERNAL_SERVICE_KEY = 'test-service-key';
process.env.MAX_CONTAINERS_PER_USER = '5';

// ==================== Mock Implementations ====================

/**
 * Mock Docker container
 */
export class MockContainer {
  id: string;
  private _state: 'created' | 'running' | 'stopped' | 'paused' = 'created';
  private _files: Map<string, string> = new Map();

  constructor(id: string = 'mock-container-id-' + Math.random().toString(36).slice(2, 10)) {
    this.id = id;
  }

  async start(): Promise<void> {
    this._state = 'running';
  }

  async stop(): Promise<void> {
    this._state = 'stopped';
  }

  async remove(): Promise<void> {
    this._state = 'stopped';
  }

  async inspect(): Promise<{ State: { Running: boolean; Status: string } }> {
    return {
      State: {
        Running: this._state === 'running',
        Status: this._state,
      },
    };
  }

  async exec(options: { Cmd: string[]; AttachStdout?: boolean; AttachStderr?: boolean }): Promise<MockExec> {
    return new MockExec(options.Cmd, this._files);
  }

  // Test helpers
  setFile(path: string, content: string): void {
    this._files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this._files.get(path);
  }

  setState(state: 'created' | 'running' | 'stopped' | 'paused'): void {
    this._state = state;
  }
}

/**
 * Mock Docker exec
 */
class MockExec {
  private _cmd: string[];
  private _files: Map<string, string>;

  constructor(cmd: string[], files: Map<string, string>) {
    this._cmd = cmd;
    this._files = files;
  }

  async start(options?: { Detach?: boolean }): Promise<MockStream> {
    // Simulate command execution
    const output = this._executeCommand();
    return new MockStream(output);
  }

  private _executeCommand(): string {
    const cmd = this._cmd.join(' ');

    // Handle cat command
    if (cmd.startsWith('cat ')) {
      const path = this._cmd[1];
      return this._files.get(path) || '';
    }

    // Handle ls command
    if (cmd.startsWith('ls ')) {
      return Array.from(this._files.keys()).join('\n');
    }

    // Handle find command
    if (cmd.startsWith('find ')) {
      return Array.from(this._files.keys()).join('\n');
    }

    // Handle echo/base64 write
    if (cmd.includes('base64 -d >')) {
      return '';
    }

    return '';
  }
}

/**
 * Mock Docker stream
 */
class MockStream {
  private _data: string;

  constructor(data: string) {
    this._data = data;
  }

  on(event: string, callback: (data: Buffer) => void): this {
    if (event === 'data') {
      // Format as Docker multiplexed stream (8-byte header + data)
      const content = Buffer.from(this._data);
      const header = Buffer.alloc(8);
      header.writeUInt8(1, 0); // stdout
      header.writeUInt32BE(content.length, 4);
      const chunk = Buffer.concat([header, content]);
      callback(chunk);
    }
    if (event === 'end') {
      callback(Buffer.alloc(0));
    }
    return this;
  }
}

/**
 * Mock Dockerode instance
 */
export class MockDocker {
  private _containers: Map<string, MockContainer> = new Map();

  async createContainer(options: any): Promise<MockContainer> {
    const container = new MockContainer();
    this._containers.set(container.id, container);
    return container;
  }

  getContainer(id: string): MockContainer {
    const container = this._containers.get(id);
    if (!container) {
      const newContainer = new MockContainer(id);
      this._containers.set(id, newContainer);
      return newContainer;
    }
    return container;
  }

  async listContainers(options?: { all?: boolean }): Promise<Array<{ Id: string; Ports: Array<{ PublicPort?: number }> }>> {
    return Array.from(this._containers.values()).map((c) => ({
      Id: c.id,
      Ports: [],
    }));
  }

  // Test helpers
  addContainer(container: MockContainer): void {
    this._containers.set(container.id, container);
  }

  clearContainers(): void {
    this._containers.clear();
  }
}

// ==================== Express Test Utilities ====================

/**
 * Create a mock Express request
 */
export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/',
    ...overrides,
  } as Request;
}

/**
 * Create a mock Express response
 */
export function createMockResponse(): Response & { _data: any; _status: number } {
  const res: any = {
    _data: null,
    _status: 200,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(data: any) {
      this._data = data;
      return this;
    },
    send(data: any) {
      this._data = data;
      return this;
    },
    setHeader: vi.fn(),
  };
  return res;
}

/**
 * Create a mock next function
 */
export function createMockNext(): NextFunction & { _called: boolean; _error?: Error } {
  const next: any = function (err?: Error) {
    next._called = true;
    next._error = err;
  };
  next._called = false;
  return next;
}

// ==================== API Response Helpers ====================

/**
 * Standard API success response format
 */
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  requestId?: string;
}

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  requestId?: string;
}

/**
 * Create a consistent error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: any,
  requestId?: string
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    requestId,
  };
}

/**
 * Create a consistent success response
 */
export function createSuccessResponse<T>(data: T, requestId?: string): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    requestId,
  };
}

// ==================== Test Data Generators ====================

/**
 * Generate a random project ID
 */
export function generateProjectId(): string {
  return 'test-project-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Generate a random user ID
 */
export function generateUserId(): string {
  return 'test-user-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Generate a mock session token
 */
export function generateSessionToken(): string {
  return 'test-token-' + Math.random().toString(36).slice(2, 18);
}

/**
 * Generate mock file content
 */
export function generateMockFile(path: string, content?: string): { path: string; content: string } {
  return {
    path,
    content: content || `// Mock file: ${path}\nexport default {};`,
  };
}

// ==================== Fetch Mock Setup ====================

/**
 * Mock fetch for API calls
 */
export function setupFetchMock(responses: Record<string, any> = {}): void {
  global.fetch = vi.fn(async (url: string | URL, options?: any) => {
    const urlStr = url.toString();

    // Default responses
    const defaultResponses: Record<string, any> = {
      '/api/auth/verify-token': { success: true, user: { id: 'test-user-id' } },
      '/api/project/verify-ownership': { isOwner: true },
      '/api/user/claude-code': { hasToken: false },
      '/api/user/ai-provider-keys': { keys: {} },
      ...responses,
    };

    // Find matching response
    for (const [pattern, response] of Object.entries(defaultResponses)) {
      if (urlStr.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => response,
        };
      }
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    };
  }) as any;
}

// ==================== Console Mock ====================

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

/**
 * Silence console output during tests
 */
export function silenceConsole(): void {
  console.log = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
  console.info = vi.fn();
}

/**
 * Restore console output
 */
export function restoreConsole(): void {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
}

// ==================== Test Lifecycle Hooks ====================

beforeAll(() => {
  silenceConsole();
  setupFetchMock();
});

afterAll(() => {
  restoreConsole();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ==================== Exports for Tests ====================

export const testUtils = {
  MockDocker,
  MockContainer,
  createMockRequest,
  createMockResponse,
  createMockNext,
  createErrorResponse,
  createSuccessResponse,
  generateProjectId,
  generateUserId,
  generateSessionToken,
  generateMockFile,
  setupFetchMock,
  silenceConsole,
  restoreConsole,
};
