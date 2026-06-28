/**
 * Recoder Network + XDR module — the Envoy control plane (docker-backend adapter).
 *
 * The pure subsystem now lives in @recoder/network. This module re-exports that
 * surface and adds the docker-backend-local IO/adapter pieces:
 *
 *   - the Express routers (network.routes)
 *   - the concrete governance-backed ports (governance-ports)
 *   - the process-wide XDR sink singleton (xdr-sink)
 *
 * Re-exporting from @recoder/network keeps every existing importer (server.ts and
 * friends) working unchanged.
 */

// Pure subsystem: config generation, authz decision, XDR pipeline, ports, types.
export * from '@recoder/network';

// docker-backend adapters (IO + concrete governance ports + sink singleton).
export {
  createNetworkRouter,
  createNetworkInternalRouter,
  type NetworkRouterOptions,
} from './network.routes.js';
export { governancePolicyAdvisor, createGovernanceAuditSink } from './governance-ports.js';
export { getXdrSink, __resetXdrSinkForTests } from './xdr-sink.js';
