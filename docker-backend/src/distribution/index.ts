/**
 * Distribution module for docker-backend — the wired, USED surface of
 * `@recoder/distribution`.
 *
 * Composes concrete ports (auth → recoder.xyz, billing → real Polar adapter,
 * events → durable RunEvent sink, secret → env) and exposes Express routers for
 * CLI device-flow auth, billing/entitlement/quota status, the device registry,
 * org seats, and the signature-verified Polar webhook, plus entitlement-gating
 * middleware for premium capability.
 */
export {
  buildDistributionModule,
  getDistributionModule,
  resetDistributionModule,
  type DistributionModule,
  type BuildDistributionModuleOptions,
} from './module.js';
export { createCliAuthRouter } from './cli-auth.routes.js';
export { createBillingRouter, createBillingWebhookRouter } from './billing.routes.js';
export {
  requireFeature,
  requireParallelWorkspaceHeadroom,
  PARALLEL_WORKSPACE_LIMIT,
} from './entitlement-gate.middleware.js';
export { loadDistributionRuntimeConfig, type DistributionRuntimeConfig } from './config.js';
export { createRecoderAuthPort, createIdentityCache } from './recoder-auth-port.js';
export { createDistributionEventBus, type DistributionEventBus } from './event-bus-port.js';
