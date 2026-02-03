/**
 * Sandbox Abstraction Layer
 *
 * Provides a unified interface for sandbox providers (Docker, E2B, Daytona).
 * Docker is the primary provider for recoder-web, with E2B and Daytona
 * available as cloud alternatives.
 *
 * Features:
 * - Unified interface for all sandbox providers
 * - Health checking with caching
 * - Automatic retry with exponential backoff
 * - Provider fallback for high availability
 * - Timeout management
 * - Comprehensive error handling
 *
 * Usage:
 * ```typescript
 * import {
 *   createSandbox,
 *   connectToSandbox,
 *   getSandboxFactory,
 * } from '~/lib/services/sandbox';
 *
 * // Create a sandbox (uses default provider - Docker)
 * const sandbox = await createSandbox({
 *   projectId: 'my-project',
 *   template: 'vite-react',
 * });
 *
 * // Execute commands
 * const result = await sandbox.executeCommand('npm install');
 *
 * // Write files
 * await sandbox.writeFile({
 *   path: 'src/App.tsx',
 *   content: 'export default function App() { return <div>Hello</div>; }',
 * });
 *
 * // Get preview URL
 * const preview = await sandbox.getPreviewInfo(3000);
 * console.log('Preview URL:', preview.url);
 *
 * // Connect to existing sandbox
 * const existingSandbox = await connectToSandbox('project-id');
 *
 * // Use with specific provider
 * const e2bSandbox = await createSandbox({
 *   projectId: 'my-project',
 *   provider: 'e2b',
 *   template: 'vite-shadcn-template',
 * });
 * ```
 */

// Export types
export type {
  SandboxProviderType,
  SandboxFile,
  CommandResult,
  CommandOptions,
  SandboxConfig,
  SandboxCreateOptions,
  SandboxConnectOptions,
  SandboxInfo,
  SandboxTerminationOptions,
  SandboxCleanupResult,
  FileOperationResult,
  BatchFileOperationResult,
  ProviderConfig,
  SandboxFactoryConfig,
  RetryConfig,
  HealthCheckResult,
  PreviewInfo,
} from './types';

export { SandboxStatus, SandboxErrorType, SandboxError } from './types';

// Export interfaces
export type { ISandbox, ISandboxProvider } from './interfaces';
export { BaseSandbox, BaseSandboxProvider } from './interfaces';

// Export configuration
export {
  CONTAINER_TIMEOUTS,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_SANDBOX_CONFIGS,
  SandboxConfigBuilder,
  createConfigBuilder,
  createDefaultConfig,
  createConfigFromEnvironment,
  getSandboxConfigForTemplate,
  mergeSandboxConfig,
  validateSandboxConfig,
  validateFactoryConfig,
  getTimeoutForUserTier,
} from './config';

// Export utilities
export {
  tryCatch,
  retryWithBackoff,
  executeCommandWithRetry,
  writeFilesWithRetry,
  checkSandboxHealth,
  waitForSandboxReady,
  sanitizeFilePath,
  validateCommand,
  formatFileSize,
  parseEnvironmentVariables,
  createTimeoutPromise,
  debounce,
  throttle,
  createSandboxLogger,
  generateSandboxId,
  isRetryableError,
  calculateRetryDelay,
  sleep,
} from './utils';

// Export providers
export {
  DockerSandboxProvider,
  DockerSandbox,
  E2BSandboxProvider,
  E2BSandbox,
  DaytonaSandboxProvider,
  DaytonaSandbox,
} from './providers';

// Export factory
export {
  SandboxFactory,
  initializeSandboxFactory,
  getSandboxFactory,
  getSandboxFactorySync,
  createSandbox,
  connectToSandbox,
  resumeSandbox,
  createDefaultSandboxFactory,
  createSandboxFactoryFromEnv,
} from './factory';
