/**
 * @module interop-gate.adapter
 *
 * Thin docker-backend adapter that routes inbound A2A signed-envelope verification
 * through the OWNED `@recoder/interop` signed-ingress gate (`admitSignedMcpCall`).
 *
 * Doctrine (interop charter): every inbound A2A envelope is UNTRUSTED until its
 * signature, identity, and policy are proven AT THE EDGE. This adapter is the wire
 * between the A2A HTTP ingress middleware and that owned edge:
 *
 *   - HMAC-SHA256 envelopes are verified by the gate via the a2a-sdk's constant-time
 *     HMAC path (timestamp skew + expiry + secret).
 *   - ED25519 envelopes are verified by the gate via interop's REAL asymmetric
 *     `verifyEd25519Signature` (the path the a2a-sdk leaves open) — the verifier
 *     never holds the signer's secret.
 *
 * The gate also fuses an MCP permission stage. A generic A2A ingress request is not
 * always a specific privileged MCP tool-call, so for ingress admission we register a
 * synthetic, locally-owned MCP "server" whose tool set is exactly the envelope's
 * declared `payload_type`, checked against a minimal ingress actor with no deny rules.
 * The signature stage therefore does the real trust work; the permission stage is a
 * clean, owned pass-through for generic ingress while remaining a genuine gate run.
 * When a caller supplies an explicit {@link McpCallClaim}, the real server registry +
 * actor policy are used instead and a signed-but-forbidden call is denied by the gate.
 */

import {
  admitSignedMcpCall,
  type Ed25519PublicKey,
  type McpCallClaim,
  type SignedIngressGateOptions,
  type SignedIngressGateResult,
} from '@recoder/interop';
import { isSignedEnvelope, type SignedEnvelope } from '@recoder/a2a-sdk';
import type { McpServerRegistration } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';

/** Synthetic actor used for generic ingress admission (no deny rules → policy pass). */
const INGRESS_ACTOR_ID = 'a2a-ingress-edge';

/**
 * Build a minimal, locally-owned ingress actor. It carries no `toolRules`, so the
 * gate's MCP permission stage allows any tool registered on the synthetic ingress
 * server — the trust decision is made entirely by the signature stage.
 */
function buildIngressActor(): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: INGRESS_ACTOR_ID,
    displayName: 'A2A Ingress Edge',
    vendorSurface: 'custom',
    connectorId: 'a2a-ingress',
    runtimeKind: 'hosted',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: {
      mode: 'manual',
      requiredRules: [],
      allowAutoApprovalForLowRisk: false,
    },
    memoryScope: 'none',
    cwdPolicy: { mode: 'task_path', allowedRoots: [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/**
 * Build a synthetic, always-enabled MCP server whose only registered tool is the
 * envelope's `payload_type`. This lets the gate's permission stage cleanly admit a
 * signature-verified generic ingress envelope without coupling ingress to a real
 * MCP server, while still running the genuine `admitSignedMcpCall` gate.
 */
function buildIngressClaim(toolName: string): McpCallClaim {
  const server: McpServerRegistration = {
    serverId: 'a2a-ingress',
    kind: 'custom',
    displayName: 'A2A Ingress',
    transport: 'custom',
    enabled: true,
    toolNames: [toolName],
  };
  return {
    server,
    toolName,
    actor: buildIngressActor(),
  };
}

export interface VerifyInboundEnvelopeOptions {
  /** Shared HMAC secret (required to admit an HMAC envelope). */
  readonly hmacSecret?: string;
  /** Resolver for ed25519 public keys by `key_id` (required to admit ed25519). */
  readonly resolveEd25519Key?: (keyId: string) => Ed25519PublicKey | null;
  /** Clock injection for deterministic timestamp/expiry checks. */
  readonly now?: Date;
  /** Max future skew for `signed_at`, in ms. */
  readonly maxFutureSkewMs?: number;
  /**
   * Optional explicit MCP claim. When provided, the gate checks the REAL server
   * registry + actor policy (a signed-but-forbidden call is denied). When omitted,
   * a synthetic ingress claim is used so the signature stage is the trust decision.
   */
  readonly claim?: McpCallClaim;
}

/**
 * Verify an inbound, untrusted A2A signed envelope THROUGH the owned interop gate.
 *
 * Returns the gate's admission decision. Never throws on untrusted input — a
 * malformed envelope, unknown key, or bad signature is a clean `admitted: false`.
 */
export function verifyInboundEnvelopeThroughInteropGate<TPayload = unknown>(
  value: unknown,
  options: VerifyInboundEnvelopeOptions = {},
): SignedIngressGateResult<TPayload> {
  const toolName = isSignedEnvelope(value)
    ? (value as SignedEnvelope).payload_type
    : 'a2a.ingress';
  const claim = options.claim ?? buildIngressClaim(toolName || 'a2a.ingress');
  const gateOptions: SignedIngressGateOptions = {
    hmacSecret: options.hmacSecret,
    resolveEd25519Key: options.resolveEd25519Key,
    now: options.now,
    maxFutureSkewMs: options.maxFutureSkewMs,
  };
  return admitSignedMcpCall<TPayload>(value, claim, gateOptions);
}

/** Re-export so the middleware/tests can type-guard envelope bodies in one place. */
export { isSignedEnvelope };
export type { SignedEnvelope, SignedIngressGateResult };
