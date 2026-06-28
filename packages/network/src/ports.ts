/**
 * ports.ts — the seams between the pure @recoder/network logic and the concrete
 * governance-backed implementations that live in the adopting service.
 *
 * The package owns the DECISION logic (decideNetworkAuthz) and the XDR pipeline
 * (parse -> detect -> seal). It does NOT own the policy engine or the Merkle
 * audit store: those are real @recoder/governance capabilities, injected here as
 * ports so the package stays free of runtime/IO concerns and depends only on the
 * type surface of @recoder/governance and @recoder/agent-os.
 *
 * The adopting service (docker-backend) constructs the concrete adapters:
 *   - a PolicyAdvisorPort backed by @recoder/governance `evaluatePolicy`
 *   - an AuditSinkPort backed by @recoder/governance `InMemoryAuditStore`
 */
import type { PolicyInput } from '@recoder/governance';
import type { AuditInput, AuditEntry, IntegrityResult } from '@recoder/governance';

/**
 * The verdict the policy advisor returns. This is the load-bearing subset of the
 * governance `PolicyDecision` the network authz decision consumes: an effect and
 * a safe-to-log reason. `allow` is the only effect that authorizes the request;
 * any other effect (deny, needs_approval, ...) is treated as deny upstream.
 */
export interface PolicyAdvisorVerdict {
  readonly effect: string;
  readonly reason: string;
}

/**
 * PolicyAdvisorPort — evaluates a mapped PolicyInput against the real Recoder
 * policy engine. The mapping from a NetworkAuthzRequest to a PolicyInput stays in
 * the package (ext-authz.ts); only the engine call is injected so the package
 * never imports the engine's runtime.
 *
 * MUST be synchronous and MUST NOT throw for a routine deny — return a deny-shaped
 * verdict instead. If it does throw, the decision logic fails closed (deny).
 */
export interface PolicyAdvisorPort {
  evaluate(input: PolicyInput): PolicyAdvisorVerdict;
}

/**
 * The integrity result an audit sink reports for its hash chain. Re-exported from
 * @recoder/governance so the governance `InMemoryAuditStore` satisfies the port
 * structurally with byte-identical semantics (no lossy re-shaping).
 */
export type AuditChainIntegrity = IntegrityResult;

/**
 * AuditSinkPort — the append-only, tamper-evident sink each XDR detection is
 * sealed into. Backed by the real @recoder/governance `InMemoryAuditStore` in the
 * adopting service: `record` advances the SHA-256 Merkle tip and returns the
 * sealed entry (whose `hash` becomes the detection's `auditHash`).
 *
 * The surface mirrors exactly the `InMemoryAuditStore` methods the XDR sink uses,
 * so the governance store satisfies this port structurally with no wrapper logic.
 */
export interface AuditSinkPort {
  record(input: AuditInput): AuditEntry;
  tipHash(): string;
  verify(): AuditChainIntegrity;
}
