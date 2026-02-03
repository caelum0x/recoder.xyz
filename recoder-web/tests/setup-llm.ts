/**
 * LLM test setup (isolated from app tests)
 */

import { vi, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';

const testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoder-llm-test-home-'));
process.env.HOME = testHomeDir;
process.env.USERPROFILE = testHomeDir;
process.env.XDG_CONFIG_HOME = testHomeDir;
process.env.XDG_STATE_HOME = testHomeDir;
process.env.XDG_DATA_HOME = testHomeDir;

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = vi.fn();
console.warn = vi.fn();
console.error = vi.fn();

global.restoreConsole = () => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
};

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  fs.rmSync(testHomeDir, { recursive: true, force: true });
});

export {};
