/**
 * @recoder/distribution — public barrel.
 *
 * The Recoder Distribution subsystem: CLI device-flow auth (recoder.xyz is the
 * source of truth), billing/entitlements over a typed Polar (Merchant of
 * Record) port, Homebrew/desktop packaging, and the gated delivery engine.
 * Distribution is an adapter around Recoder state, never an owner of it.
 */

// Domain + ports + config + errors + result
export * from './domain/index';
export * from './ports/index';
export * from './errors/index';
export * from './result';
export {
  ENV_KEYS,
  DEFAULT_POLAR_API_BASE,
  DEFAULT_CLI_CLIENT_ID,
  DistributionConfigSchema,
  loadDistributionConfig,
  type DistributionConfig,
} from './config/index';

// Engine
export * from './engine/index';

// CLI distribution + device-flow auth
export * from './channels/cli-dist/device-flow/index';

// Billing + entitlements (TS view of fused Polar) + Polar webhook handling
export * from './channels/billing/index';

// Enterprise: orgs + seats, device registry, SSO (OIDC), usage metering
export * from './channels/org/index';
export * from './channels/device-registry/index';
export * from './channels/sso/index';
export * from './channels/usage/index';

// Packaging (homebrew + desktop)
export * from './channels/packaging/index';

// Contract re-exports (kept canonical — never redefined here)
export type { Artifact, Approval, RunEvent } from '@recoder/agent-os';
export type { RecoderCloudEvent } from '@recoder/agent-events';

// Top-level facade
export * from './distribution';
