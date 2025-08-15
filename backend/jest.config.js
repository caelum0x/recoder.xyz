module.exports = {
  displayName: 'Backend',
  preset: '../jest.preset.js',
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
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  testTimeout: 20000,
  verbose: true,
  bail: 1,
  forceExit: true,
  detectOpenHandles: true,
  maxConcurrency: 3,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};