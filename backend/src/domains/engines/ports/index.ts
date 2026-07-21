/**
 * Barrel re-export of every engines-seam port. Adapters + the composer import
 * their contracts from here; consumers import the public ports via the domain
 * `index.ts`.
 */
export type {
  EngineClientPort,
  EngineCall,
} from './engine-client.port.js';
export { EngineClientBase } from './engine-client.port.js';

export type {
  NapiLoaderPort,
  NapiModule,
  NapiLoadSpec,
} from './napi-loader.port.js';

export type {
  DaemonSupervisorPort,
  DaemonSpec,
  DaemonHandle,
} from './daemon-supervisor.port.js';

export type {
  SidecarSupervisorPort,
  SidecarSpec,
  SidecarHandle,
  SidecarTransport,
  PreflightResult,
} from './sidecar-supervisor.port.js';

export type {
  McpHostPort,
  InProcToolHandler,
  HostCallOutcome,
  McpServerRegistration,
  McpToolCallInput,
  McpToolResult,
} from './mcp-host.port.js';

export type {
  EngineRegistryPort,
  EngineHealthRepository,
  EngineRestartRecord,
  EngineHealthLogRow,
} from './engine-registry.port.js';

export type { TensorzeroConfigProvider } from './tensorzero-config.port.js';
