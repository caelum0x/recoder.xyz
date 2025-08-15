/**
 * Jest test setup for Production Engine
 */

import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/recoder_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'test-key';

// Mock external AI APIs
jest.mock('@anthropic-ai/sdk');
jest.mock('openai');
jest.mock('groq-sdk');
jest.mock('@google/generative-ai');

// Mock file system operations
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
  createWriteStream: jest.fn(),
}));

// Mock logger
jest.mock('./utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock security and compliance services
jest.mock('./services/security-integration', () => ({
  securityIntegrationService: {
    validateGeneratedCode: jest.fn().mockResolvedValue({
      success: true,
      securityScore: 85,
      vulnerabilities: [],
      secrets: [],
      complianceIssues: [],
      sanitizationViolations: [],
      recommendations: [],
      metadata: {
        scanDuration: 100,
        scannedFiles: 1,
        rulesApplied: 5
      }
    }),
  },
}));

jest.mock('./compliance/compliance-integration', () => ({
  ComplianceIntegrationService: jest.fn().mockImplementation(() => ({
    validateSingleFile: jest.fn().mockResolvedValue({
      passed: true,
      report: {
        summary: {
          overallScore: 90,
          riskLevel: 'low',
          criticalViolations: 0,
          highViolations: 0
        },
        violations: []
      },
      blockedByCompliance: false,
      recommendations: []
    }),
    updateConfiguration: jest.fn(),
    getConfiguration: jest.fn(),
    scanProject: jest.fn(),
    generateProjectComplianceDashboard: jest.fn(),
  })),
}));

// Mock AI Hub Service
jest.mock('./services/ai-hub-service', () => ({
  AIHubService: jest.fn().mockImplementation(() => ({
    generateWithBestModel: jest.fn().mockResolvedValue(`
# Test Generated Code

This is a test response from the AI model.

\`\`\`typescript file:src/test.ts
export function testFunction(): string {
  return "Hello, World!";
}
\`\`\`

## Setup Instructions

1. Install dependencies: npm install
2. Run the project: npm start
`),
    getAvailableProviders: jest.fn().mockResolvedValue(['anthropic', 'openai', 'groq']),
  })),
}));

// Setup global test timeout
jest.setTimeout(15000);

// Mock console to reduce test output noise
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

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});