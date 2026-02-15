/**
 * Test setup file for Vitest
 * Configures global test environment and mocks
 */

import { vi, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock environment variables
process.env.NODE_ENV = 'test';

const testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoder-test-home-'));
process.env.HOME = testHomeDir;
process.env.USERPROFILE = testHomeDir;
process.env.XDG_CONFIG_HOME = testHomeDir;
process.env.XDG_STATE_HOME = testHomeDir;
process.env.XDG_DATA_HOME = testHomeDir;

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = vi.fn();
console.warn = vi.fn();
console.error = vi.fn();

// Restore console for debugging when needed
global.restoreConsole = () => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
};

// Mock setTimeout and setInterval for faster tests
vi.mock('setTimeout', () => vi.fn((fn) => fn()));
vi.mock('setInterval', () => vi.fn((fn) => fn()));

// Mock TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Request/Response for API testing
global.Request = class MockRequest {
  url: string;
  method: string;
  headers: Headers;
  private _body?: string;

  constructor(url: string, init?: any) {
    this.url = url;
    this.method = init?.method ?? 'GET';
    this.headers = new Headers(init?.headers ?? {});
    this._body = typeof init?.body === 'string' ? init.body : undefined;
  }

  async json() {
    if (!this._body) return {};
    return JSON.parse(this._body);
  }

  async text() {
    return this._body ?? '';
  }
} as any;

global.Response = class MockResponse {
  body: any;
  init: any;
  status: number;
  ok: boolean;
  headers: Headers;

  constructor(body?: any, init?: any) {
    this.body = body;
    this.init = init;
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Headers(init?.headers ?? {});
  }

  async json() {
    if (typeof this.body === 'string') return JSON.parse(this.body);
    return this.body;
  }

  async text() {
    if (typeof this.body === 'string') return this.body;
    return JSON.stringify(this.body);
  }
} as any;

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  fs.rmSync(testHomeDir, { recursive: true, force: true });
});

export {};
