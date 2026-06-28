// Facade
export { Governance } from './governance';
export {
  type GovernanceConfig,
  type GovernanceConfigInput,
  loadGovernanceConfig,
  defaultGovernanceConfig,
  governanceConfigSchema,
  resolveDaemonSocketPath,
  GOVERNANCE_SOCKET_ENV,
} from './governance-config';

// Errors + result envelope
export * from './errors';
export * from './result';

// Domain types
export * from './domain';

// Capability modules
export * from './policy';
export * from './routing';
export * from './approval';
export * from './enforcement';
export * from './audit';

// IPC transport to the owned Rust governance daemon (UDS, length-prefixed JSON).
export * from './ipc';

// Compatibility seam: re-export the upstream @recoder/agent-policy public API for
// one minor version so existing importers can switch to @recoder/governance.
export {
  evaluatePolicy,
  decision,
  type PolicyInput,
  type PolicyAction,
} from '@recoder/agent-policy';
