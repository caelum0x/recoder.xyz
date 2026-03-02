/**
 * @module adapters
 *
 * Barrel export for A2A protocol adapters.
 *
 * Adapters translate A2A envelopes to/from different communication protocols,
 * enabling agents on various platforms to participate in the A2A mesh.
 *
 * - REST adapter: HTTP-based agents (Replit, custom webhooks, external services)
 * - Git adapter: File/branch-based agents (VS Code+Copilot, JetBrains)
 */

// REST adapter
export {
  RestAdapter,
  buildEnvelope,
  registerRestAdapter,
  getRestAdapter,
  listRestAdapters,
  unregisterRestAdapter,
  resetRestAdapters,
  DEFAULT_REST_ADAPTER_CONFIG,
  type RestAuthMethod,
  type RestAdapterConfig,
  type RestAdapterResult,
  type RestAdapterHealthResult,
  type RestAdapterStatus,
  type RestAdapterState,
  type RestAdapterEvents,
} from './rest-adapter';

// Git adapter
export {
  GitAdapter,
  DefaultGitExecutor,
  registerGitAdapter,
  getGitAdapter,
  listGitAdapters,
  unregisterGitAdapter,
  resetGitAdapters,
  DEFAULT_GIT_ADAPTER_CONFIG,
  type GitAuthMethod,
  type GitAdapterConfig,
  type GitTaskDescriptor,
  type GitTaskResult,
  type GitArtifact,
  type GitTaskBranch,
  type GitAdapterStatus,
  type GitAdapterState,
  type GitAdapterEvents,
  type GitAdapterCreateResult,
  type GitAdapterPollResult,
  type GitExecutor,
} from './git-adapter';

// REST adapter routes
export { restAdapterRouter } from './rest-adapter.routes';

// Git adapter routes
export { gitAdapterRouter } from './git-adapter.routes';

// Unified Adapter Registry
export {
  AdapterRegistry,
  getAdapterRegistry,
  resetAdapterRegistry,
  type AdapterType,
  type AdapterEntry,
  type AdapterHealthSummary,
  type AdapterRegistryEvents,
} from './adapter-registry';
