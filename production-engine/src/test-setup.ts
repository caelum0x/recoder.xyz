/**
 * Jest test setup for Production Engine
 */

import { afterAll, afterEach, beforeAll, jest } from '@jest/globals';

// Mock environment variables for testing
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
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

// Mock missing provider modules
jest.mock('../providers/bedrock', () => ({
  AwsBedrockHandler: jest.fn()
}), { virtual: true });

// Mock VSCode module globally
jest.mock('vscode', () => {
  const LanguageModelChatMessageRole = {
    Assistant: "assistant",
    User: "user",
  }

  class MockLanguageModelTextPart {
    type = "text"
    constructor(public value: string) {}
  }

  class MockLanguageModelToolCallPart {
    type = "tool_call"
    constructor(
      public callId: string,
      public name: string,
      public input: any,
    ) {}
  }

  class MockLanguageModelToolResultPart {
    type = "tool_result"
    constructor(
      public toolUseId: string,
      public parts: MockLanguageModelTextPart[],
    ) {}
  }

  return {
    LanguageModelChatMessage: {
      Assistant: jest.fn((content: any) => ({
        role: LanguageModelChatMessageRole.Assistant,
        name: "assistant",
        content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(String(content))],
      })),
      User: jest.fn((content: any) => ({
        role: LanguageModelChatMessageRole.User,
        name: "user",
        content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(String(content))],
      })),
    },
    LanguageModelChatMessageRole,
    LanguageModelTextPart: MockLanguageModelTextPart,
    LanguageModelToolCallPart: MockLanguageModelToolCallPart,
    LanguageModelToolResultPart: MockLanguageModelToolResultPart,
  }
}, { virtual: true });

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

// Mock security and compliance services with proper typing
const mockSecurityValidationResult = {
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
};

const mockComplianceResult = {
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
};

const mockGeneratedCode = `# Test Generated Code

This is a test response from the AI model.

\`\`\`typescript file:src/test.ts
export function testFunction(): string {
  return "Hello, World!";
}
\`\`\`

## Setup Instructions

1. Install dependencies: npm install
2. Run the project: npm start
`;

const mockAvailableProviders = ['anthropic', 'openai', 'groq'];

jest.mock('./services/security-integration', () => ({
  SecurityIntegrationService: jest.fn().mockImplementation(() => ({
    validateGeneratedCode: jest.fn(() => Promise.resolve(mockSecurityValidationResult)),
  })),
  securityIntegrationService: {
    validateGeneratedCode: jest.fn(() => Promise.resolve(mockSecurityValidationResult)),
  },
}));

jest.mock('./compliance/compliance-integration', () => ({
  ComplianceIntegrationService: jest.fn().mockImplementation(() => ({
    validateSingleFile: jest.fn(() => Promise.resolve(mockComplianceResult)),
    updateConfiguration: jest.fn(),
    getConfiguration: jest.fn(() => ({
      enabled: true,
      enforceBlocking: false,
      autoRemediation: true,
      reportGeneration: true,
      industryStandards: ['SOX', 'ISO_27001'],
      dataClassification: 'INTERNAL',
      projectType: 'WEB_APPLICATION',
      customRules: []
    })),
    scanProject: jest.fn(() => Promise.resolve(new Map())),
    generateProjectComplianceDashboard: jest.fn(() => Promise.resolve('Mock dashboard HTML')),
  })),
  IndustryStandard: {
    SOC2: 'SOC2',
    PCI: 'PCI',
    HIPAA: 'HIPAA',
    GDPR: 'GDPR',
    SOX: 'SOX',
    ISO_27001: 'ISO_27001'
  },
  DataClassification: {
    PUBLIC: 'public',
    INTERNAL: 'internal',
    CONFIDENTIAL: 'confidential',
    RESTRICTED: 'restricted'
  },
  ProjectType: {
    WEB: 'web',
    WEB_APPLICATION: 'web',
    MOBILE: 'mobile',
    API: 'api',
    BLOCKCHAIN: 'blockchain',
    AI: 'ai',
    DESKTOP: 'desktop',
    PAYMENTS: 'payments',
    PAYMENT_SYSTEM: 'payments'
  }
}));

jest.mock('./services/commercial-ai-hub-service', () => ({
  commercialAIHubService: {
    generateWithBestModel: jest.fn(() => Promise.resolve(mockGeneratedCode)),
    getAvailableProviders: jest.fn(() => Promise.resolve(mockAvailableProviders)),
  },
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