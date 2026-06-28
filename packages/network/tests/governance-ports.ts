/**
 * Test wiring: the REAL @recoder/governance capabilities as @recoder/network
 * ports. This is the exact same wiring the adopting service (docker-backend)
 * uses in production — not a mock or stub. The tests exercise the package logic
 * against the real policy engine and the real Merkle audit store.
 */
import { evaluatePolicy, InMemoryAuditStore } from '@recoder/governance';
import type { PolicyAdvisorPort, AuditSinkPort } from '../src/ports';

/** The real governance policy engine, as a PolicyAdvisorPort. */
export const governancePolicyAdvisor: PolicyAdvisorPort = {
  evaluate: (input) => evaluatePolicy(input),
};

/**
 * A fresh real Merkle audit store, as an AuditSinkPort. `InMemoryAuditStore`
 * already implements `record` / `tipHash` / `verify` with matching shapes, so it
 * satisfies the port structurally with no wrapper.
 */
export function newGovernanceAuditSink(): AuditSinkPort {
  return new InMemoryAuditStore();
}
