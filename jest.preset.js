const { pathsToModuleNameMapper } = require('ts-jest');
const path = require('path');

// Read the tsconfig for path mapping
const tsconfig = require('./tsconfig.base.json');

module.exports = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  
  // Module name mapping for TypeScript paths
  moduleNameMapper: {
    ...pathsToModuleNameMapper(tsconfig.compilerOptions.paths || {}, {
      prefix: '<rootDir>/'
    }),
    // Additional mappings for monorepo structure
    '^@recoder/(.*)$': '<rootDir>/packages/$1/src',
    '^@roo-code/(.*)$': '<rootDir>/packages/$1/src',
  },

  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        downlevelIteration: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strict: false,
        noImplicitAny: false,
        noImplicitReturns: false
      },
      isolatedModules: true,
      useESM: false
    }],
    '^.+\\.(js|jsx)$': 'babel-jest'
  },

  // Test file patterns
  testMatch: [
    '<rootDir>/**/__tests__/**/*.{js,ts,tsx}',
    '<rootDir>/**/*.{test,spec}.{js,ts,tsx}'
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/.next/',
    '/build/',
    '/out/'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    '<rootDir>/**/*.{ts,tsx,js,jsx}',
    '!<rootDir>/**/*.d.ts',
    '!<rootDir>/**/node_modules/**',
    '!<rootDir>/**/dist/**',
    '!<rootDir>/**/.next/**',
    '!<rootDir>/**/build/**',
    '!<rootDir>/**/out/**',
    '!<rootDir>/**/*.config.{js,ts}',
    '!<rootDir>/**/__tests__/**',
    '!<rootDir>/**/*.{test,spec}.{js,ts,tsx}',
    '!<rootDir>/**/coverage/**'
  ],

  // Setup files
  setupFilesAfterEnv: [],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },

  // Test timeout
  testTimeout: 20000,

  // Performance settings
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',

  // Logging
  verbose: false,
  silent: false,

  // Error handling
  bail: 0,
  forceExit: true,
  detectOpenHandles: true,

  // Mock configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Environment variables for tests
  globals: {
    'ts-jest': {
      useESM: false
    }
  }
};