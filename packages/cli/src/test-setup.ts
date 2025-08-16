/**
 * Jest test setup for CLI package
 */

import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/recoder_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Mock external dependencies
jest.mock('axios');
jest.mock('openai');
jest.mock('@anthropic-ai/sdk');
jest.mock('groq-sdk');
jest.mock('fs-extra');
jest.mock('inquirer');

// Mock console methods in tests to reduce noise
const originalConsole = global.console;
beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;
});

afterAll(() => {
  global.console = originalConsole;
});

// Setup global test timeout
jest.setTimeout(20000);

// Mock file system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  access: jest.fn(),
}));

// Mock Winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Mock CLI dependencies
jest.mock('commander');
jest.mock('ora');
jest.mock('chalk', () => ({
  blue: jest.fn((str) => str),
  green: jest.fn((str) => str),
  red: jest.fn((str) => str),
  yellow: jest.fn((str) => str),
  cyan: jest.fn((str) => str),
  magenta: jest.fn((str) => str),
  bold: jest.fn((str) => str),
}));

// Mock network requests
global.fetch = jest.fn(() => Promise.resolve(new Response()));

// Mock process.exit to prevent tests from exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`Process exit called with code ${code}`);
});

afterEach(() => {
  mockExit.mockClear();
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});