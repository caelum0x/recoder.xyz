module.exports = {
  displayName: 'CLI',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,ts}',
    '<rootDir>/src/**/*.{test,spec}.{js,ts}'
  ],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,js}',
    '!src/**/*.spec.{ts,js}',
    '!src/test-setup.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
  bail: 1,
  forceExit: true,
  detectOpenHandles: true,
  maxConcurrency: 5,
  // Integration test specific configuration
  globalSetup: '<rootDir>/src/test-global-setup.ts',
  globalTeardown: '<rootDir>/src/test-global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  // Mock configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Performance monitoring
  slowTestThreshold: 5000,
};