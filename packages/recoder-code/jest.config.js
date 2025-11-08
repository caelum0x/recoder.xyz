module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/plugin-registry-service/',
    '/ml-training-service/',
    '/collaboration-service/',
    '/dist/',
    '/temp/',
    '/venv/',
    '/checkpoints/',
    '/datasets/',
    '/models/'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  collectCoverageFrom: [
    'cli/**/*.{ts,js}',
    'api/**/*.{ts,js}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/*.d.ts'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|#ansi-styles|strip-ansi|ansi-regex)/)'
  ],
  testTimeout: 30000,
  verbose: true,
  // Disable file watchers to prevent EMFILE errors
  watchman: false,
  // Run tests serially to reduce file handles
  maxWorkers: 1
};