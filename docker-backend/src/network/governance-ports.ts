/**
 * governance-ports.ts — the docker-backend adapter that binds the REAL
 * @recoder/governance capabilities to the @recoder/network ports.
 *
 * @recoder/network owns the pure logic (config generation, the authz decision,
 * the XDR pipeline) but never imports a policy engine or an audit store at
 * runtime. This thin adapter is where the concrete governance implementations are
 * wired in:
 *
 *   - PolicyAdvisorPort -> @recoder/governance `evaluatePolicy`
 *   - AuditSinkPort     -> @recoder/governance `InMemoryAuditStore`
 *
 * This is the same wiring the package tests use; nothing here is a stub.
 */
import { evaluatePolicy, InMemoryAuditStore } from '@recoder/governance';
import type { PolicyAdvisorPort, AuditSinkPort } from '@recoder/network';

/**
 * The real Recoder policy engine, exposed as a PolicyAdvisorPort. The network
 * authz decision (decideNetworkAuthz) maps a request into a PolicyInput and asks
 * this advisor for the verdict.
 */
export const governancePolicyAdvisor: PolicyAdvisorPort = {
  evaluate: (input) => evaluatePolicy(input),
};

/**
 * Construct a fresh governance-backed AuditSinkPort. `InMemoryAuditStore` already
 * implements `record` / `tipHash` / `verify` with matching shapes, so it
 * satisfies the port structurally with no wrapper logic — every sealed detection
 * advances the real SHA-256 Merkle tip.
 */
export function createGovernanceAuditSink(): AuditSinkPort {
  return new InMemoryAuditStore();
}
