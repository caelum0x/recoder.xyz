/**
 * Jest test setup file
 * Configures the test environment and global mocks
 */

import { jest } from '@jest/globals';
import { ConfigManager } from './utils/config';
import { Logger } from '@recoder/shared';

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  // Keep console.error and console.warn for debugging
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Mock the logger to prevent file writes during tests
jest.mock('@recoder/shared', () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    withContext: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    })),
  },
}));

// Mock external dependencies that make network requests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    request: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
}));

// Mock inquirer for interactive prompts
jest.mock('inquirer', () => ({
  prompt: jest.fn().mockResolvedValue({
    name: 'test-project',
    description: 'Test project description',
    type: 'web',
    path: './test-project',
    template: 'minimal',
    features: ['auth', 'database'],
    integrations: [],
  }),
}));

// Mock ora spinner
jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  };
  return jest.fn(() => mockSpinner);
});

// Mock boxen for CLI output formatting
jest.mock('boxen', () => jest.fn((text, options) => `[BOX: ${text}]`));

// Mock chalk for colored output
jest.mock('chalk', () => ({
  red: jest.fn((text) => text),
  green: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  blue: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  white: jest.fn((text) => text),
  bold: jest.fn((text) => text),
}));

// Mock file system operations for consistent test behavior
jest.mock('fs-extra', () => ({
  pathExists: jest.fn().mockResolvedValue(true),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('mock file content'),
  readdir: jest.fn().mockResolvedValue(['file1.js', 'file2.js']),
  readJson: jest.fn().mockResolvedValue({ name: 'test', version: '1.0.0' }),
  writeJson: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  copy: jest.fn().mockResolvedValue(undefined),
  move: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({
    isDirectory: () => false,
    isFile: () => true,
    size: 1024,
    mtime: new Date(),
  }),
}));

// Mock chokidar for file watching
jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn(),
    close: jest.fn(),
  }),
}));

// Setup test configuration
beforeEach(() => {
  // Reset configuration for each test
  ConfigManager.reset();
  
  // Set test-specific configuration
  ConfigManager.set('test.mode', true);
  ConfigManager.set('api.baseUrl', 'http://test-api.localhost');
  ConfigManager.set('api.timeout', 5000);
  ConfigManager.set('api.retries', 0);
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledWithCommand(command: string): R;
      toHaveSuccessfulCliExit(): R;
      toHaveErrorCliExit(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toHaveBeenCalledWithCommand(received, command) {
    const pass = received.mock.calls.some((call: any[]) => 
      call.some((arg: any) => arg && arg.toString().includes(command))
    );
    
    return {
      message: () => `expected ${received} to have been called with command "${command}"`,
      pass,
    };
  },

  toHaveSuccessfulCliExit(received) {
    const pass = received.code === 0 || received.code === undefined;
    
    return {
      message: () => `expected CLI to exit successfully (code 0), but got code ${received.code}`,
      pass,
    };
  },

  toHaveErrorCliExit(received) {
    const pass = received.code !== 0 && received.code !== undefined;
    
    return {
      message: () => `expected CLI to exit with error (code !== 0), but got code ${received.code}`,
      pass,
    };
  },
});

// Error handling for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Test helper functions
export const testHelpers = {
  /**
   * Create a temporary test directory
   */
  async createTempDir(name: string): Promise<string> {
    const path = require('path');
    const fs = require('fs-extra');
    const tempDir = path.join(process.cwd(), 'temp-test-dirs', name);
    await fs.ensureDir(tempDir);
    return tempDir;
  },

  /**
   * Clean up temporary test directories
   */
  async cleanupTempDirs(): Promise<void> {
    const path = require('path');
    const fs = require('fs-extra');
    const tempDirsPath = path.join(process.cwd(), 'temp-test-dirs');
    if (await fs.pathExists(tempDirsPath)) {
      await fs.remove(tempDirsPath);
    }
  },

  /**
   * Mock API responses for testing
   */
  mockApiResponses: {
    success: (data: any) => ({ success: true, data }),
    error: (message: string, code: string = 'TEST_ERROR') => ({ 
      success: false, 
      error: { message, code } 
    }),
    paginated: (data: any[], total: number = data.length) => ({
      success: true,
      data: {
        data,
        pagination: {
          page: 1,
          limit: 10,
          total,
          totalPages: Math.ceil(total / 10),
          hasNext: false,
          hasPrev: false,
        },
      },
    }),
  },

  /**
   * Create mock project structure
   */
  createMockProject: (name: string, type: string = 'web') => ({
    id: `test-${name}`,
    name,
    type,
    description: `Test ${name} project`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active',
    files: [],
    structure: {
      directories: [],
      files: [],
      metadata: {
        total_files: 0,
        total_directories: 0,
        total_size: 0,
        languages: [],
        frameworks: [],
        dependencies: [],
      },
    },
  }),

  /**
   * Create mock template
   */
  createMockTemplate: (name: string, category: string = 'web') => ({
    id: `template-${name}`,
    name,
    category,
    description: `Test ${name} template`,
    type: 'project',
    version: '1.0.0',
    author: 'Test Author',
    tags: ['test', category],
    public: true,
    featured: false,
    downloads: 0,
    variables: [],
    files: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  /**
   * Wait for a specific amount of time
   */
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate random test data
   */
  generateTestData: {
    projectName: () => `test-project-${Date.now()}`,
    email: () => `test-${Date.now()}@example.com`,
    uuid: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  },
};