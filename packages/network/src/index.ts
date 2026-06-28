/**
 * @recoder/network — the Recoder Envoy control plane (pure subsystem).
 *
 * This package owns the PURE, IO-free pieces of the network subsystem:
 *
 *   - envoy-config : generate a real, deployable Envoy v3 bootstrap config
 *                    (generateEnvoyConfig / emitYaml / emitJson / defaultNetworkConfig).
 *   - ext-authz    : the default-deny authz DECISION (decideNetworkAuthz), behind
 *                    a PolicyAdvisorPort + the Envoy request extractor.
 *   - xdr          : the access-log -> security-event -> detection pipeline
 *                    (parseAccessLog / detect / XdrSink), with the audit seal
 *                    behind an AuditSinkPort.
 *
 * Ports (ports.ts) inject the real @recoder/governance capabilities (the policy
 * engine, the Merkle audit store). IO — the ext_authz HTTP handler and Express
 * route mounting — and the concrete governance-backed port implementations stay
 * in the adopting service (docker-backend) as thin adapters.
 */
export * from './types';
export * from './ports';
export * from './envoy-config';
export * from './ext-authz';
export * from './xdr';
