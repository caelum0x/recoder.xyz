import {
  isSignedEnvelope,
  validateSignedEnvelopeIngress,
  type SignedEnvelope,
} from "@recoder/a2a-sdk";
import {
  canCallMcpTool,
  type McpServerRegistration,
  type McpToolCallDecision,
} from "@recoder/agent-mcp";
import type { AgentProfile, TaskSpec } from "@recoder/agent-os";
import { verifyEd25519Signature, type Ed25519PublicKey } from "./ed25519";

/**
 * The signed-envelope ingress gate — interop's first real, owned module.
 *
 * Doctrine (from the package charter): every inbound A2A envelope is UNTRUSTED
 * until its signature, identity, and policy are proven AT THE EDGE. This gate is
 * that edge. It fuses two existing Recoder contracts into one admission decision:
 *
 *   1. SIGNATURE (a2a-sdk): the envelope must be a well-formed `SignedEnvelope`
 *      and carry a valid signature. HMAC-SHA256 is delegated to the SDK's
 *      `validateSignedEnvelopeIngress` (timestamp skew, expiry, secret, constant-
 *      time compare). ED25519 is verified here (the SDK leaves it unsupported) via
 *      the asymmetric `verifyEd25519Signature` over the same canonical payload.
 *
 *   2. PERMISSION (agent-mcp): only AFTER identity is proven does the gate map the
 *      envelope's claimed MCP tool-call to `canCallMcpTool` against the server
 *      registry and the actor's `AgentProfile` tool policy. A signed-but-forbidden
 *      call is denied with a policy decision, never admitted.
 *
 * The result is a discriminated union — `admitted: true` carries the verified
 * payload + the MCP policy decision; `admitted: false` carries the stage that
 * failed, a stable code, and an actionable reason. The gate NEVER throws on
 * untrusted input (malformed envelope, bad key, bad signature) — that is the
 * whole point of a hostile-by-default edge.
 */

/** The MCP tool-call an inbound envelope is requesting admission for. */
export interface McpCallClaim {
  /** Which registered MCP server the call targets. */
  readonly server: McpServerRegistration;
  /** The tool the envelope wants to invoke. */
  readonly toolName: string;
  /** The (already-authenticated) actor profile whose policy is checked. */
  readonly actor: AgentProfile;
  /** The task the call runs under, if any (carried into the policy decision). */
  readonly task?: TaskSpec;
  /** Arbitrary tool args (carried verbatim into the policy decision metadata). */
  readonly args?: Record<string, unknown>;
}

/** Options controlling how the gate verifies a signature. */
export interface SignedIngressGateOptions {
  /** Shared secret for HMAC-SHA256 envelopes (required to admit an HMAC envelope). */
  readonly hmacSecret?: string;
  /**
   * Resolve the ed25519 public key for a signature's `key_id`. Returning null
   * (unknown key) is a clean DENY, not a throw. Required to admit ed25519 envelopes.
   */
  readonly resolveEd25519Key?: (keyId: string) => Ed25519PublicKey | null;
  /** Clock injection for deterministic timestamp/expiry checks (defaults to now). */
  readonly now?: Date;
  /** Max future skew for `signed_at`, in ms (defaults to the SDK's 5 minutes). */
  readonly maxFutureSkewMs?: number;
}

/** Which stage of the gate rejected an envelope. */
export type GateRejectionStage = "signature" | "permission";

/** Stable rejection codes (signature codes mirror the SDK; permission is local). */
export type GateRejectionCode =
  | "signed_envelope_required"
  | "signed_envelope_expired"
  | "signed_envelope_not_yet_valid"
  | "signed_envelope_bad_timestamp"
  | "signed_envelope_unsupported_algorithm"
  | "signed_envelope_secret_missing"
  | "signed_envelope_key_unknown"
  | "signed_envelope_bad_signature"
  | "mcp_permission_denied";

/** The gate's admission decision for one inbound envelope. */
export type SignedIngressGateResult<TPayload = unknown> =
  | {
      readonly admitted: true;
      readonly envelope: SignedEnvelope<TPayload>;
      readonly payload: TPayload;
      readonly decision: McpToolCallDecision;
    }
  | {
      readonly admitted: false;
      readonly stage: GateRejectionStage;
      readonly status: number;
      readonly code: GateRejectionCode;
      readonly reason: string;
    };

/**
 * Admit (or reject) one inbound, untrusted A2A envelope for an MCP tool-call.
 *
 * Stage 1 proves the signature; stage 2 proves the MCP permission. Both must pass.
 * Never throws on untrusted input.
 */
export function admitSignedMcpCall<TPayload = unknown>(
  value: unknown,
  claim: McpCallClaim,
  options: SignedIngressGateOptions = {},
): SignedIngressGateResult<TPayload> {
  // --- Stage 1: signature ---------------------------------------------------
  const verified = verifySignature<TPayload>(value, options);
  if (!verified.ok) {
    return {
      admitted: false,
      stage: "signature",
      status: verified.status,
      code: verified.code,
      reason: verified.reason,
    };
  }

  // --- Stage 2: MCP permission (identity is now proven) ---------------------
  const decision = canCallMcpTool({
    server: claim.server,
    toolName: claim.toolName,
    actor: claim.actor,
    task: claim.task,
    args: claim.args ?? {},
  });
  if (!decision.allowed) {
    return {
      admitted: false,
      stage: "permission",
      status: 403,
      code: "mcp_permission_denied",
      reason: decision.reason,
    };
  }

  return {
    admitted: true,
    envelope: verified.envelope,
    payload: verified.payload,
    decision,
  };
}

/** Internal stage-1 result. */
type SignatureResult<TPayload> =
  | { ok: true; envelope: SignedEnvelope<TPayload>; payload: TPayload }
  | SignatureRejection;

/** The rejection arm of a stage-1 result (payload-agnostic). */
type SignatureRejection = {
  ok: false;
  status: number;
  code: GateRejectionCode;
  reason: string;
};

/**
 * Verify the envelope's signature. A signed envelope is ALWAYS required here (the
 * gate is hostile-by-default), so an unsigned/unwrapped value is rejected. HMAC is
 * delegated to the SDK; ed25519 is verified locally over the same canonical payload.
 */
function verifySignature<TPayload>(
  value: unknown,
  options: SignedIngressGateOptions,
): SignatureResult<TPayload> {
  if (!isSignedEnvelope(value)) {
    return {
      ok: false,
      status: 400,
      code: "signed_envelope_required",
      reason: "Expected a signed A2A envelope.",
    };
  }

  const algorithm = value.signature.algorithm;
  if (algorithm === "ed25519") {
    return verifyEd25519Envelope<TPayload>(value, options);
  }

  // hmac-sha256 (and any other algorithm the SDK recognizes/rejects).
  const sdk = validateSignedEnvelopeIngress<TPayload>(value, {
    secret: options.hmacSecret,
    requireSignature: true,
    now: options.now,
    maxFutureSkewMs: options.maxFutureSkewMs,
  });
  if (!sdk.ok) {
    return {
      ok: false,
      status: sdk.status,
      code: sdk.code as GateRejectionCode,
      reason: sdk.message,
    };
  }
  return { ok: true, envelope: sdk.envelope, payload: sdk.payload };
}

/**
 * Verify an ed25519-signed envelope. Re-runs the SDK's timestamp/expiry checks by
 * borrowing them (so skew + expiry behave identically across algorithms), then
 * resolves the signer's public key by `key_id` and verifies asymmetrically.
 */
function verifyEd25519Envelope<TPayload>(
  envelope: SignedEnvelope,
  options: SignedIngressGateOptions,
): SignatureResult<TPayload> {
  const timing = checkTiming(envelope, options);
  if (timing) {
    return timing;
  }

  if (!options.resolveEd25519Key) {
    return {
      ok: false,
      status: 500,
      code: "signed_envelope_secret_missing",
      reason: "ed25519 verification requires a resolveEd25519Key resolver.",
    };
  }
  const publicKey = options.resolveEd25519Key(envelope.signature.key_id);
  if (!publicKey) {
    return {
      ok: false,
      status: 401,
      code: "signed_envelope_key_unknown",
      reason: `No ed25519 public key for key_id: ${envelope.signature.key_id}`,
    };
  }

  if (
    !verifyEd25519Signature(
      envelope.payload,
      envelope.signature.signature,
      publicKey,
    )
  ) {
    return {
      ok: false,
      status: 401,
      code: "signed_envelope_bad_signature",
      reason: "Invalid ed25519 A2A envelope signature.",
    };
  }
  return {
    ok: true,
    envelope: envelope as SignedEnvelope<TPayload>,
    payload: envelope.payload as TPayload,
  };
}

/**
 * Shared timestamp + expiry checks (the same rules the SDK applies to HMAC), so an
 * ed25519 envelope is held to identical freshness guarantees. Returns a rejection
 * or null when timing is acceptable.
 */
function checkTiming(
  envelope: SignedEnvelope,
  options: SignedIngressGateOptions,
): SignatureRejection | null {
  const nowMs = options.now?.getTime() ?? Date.now();
  const signedAtMs = Date.parse(envelope.signature.signed_at);
  if (!Number.isFinite(signedAtMs)) {
    return {
      ok: false,
      status: 400,
      code: "signed_envelope_bad_timestamp",
      reason: "Signed A2A envelope has an invalid signed_at timestamp.",
    };
  }
  const maxFutureSkewMs = options.maxFutureSkewMs ?? 5 * 60 * 1000;
  if (signedAtMs - nowMs > maxFutureSkewMs) {
    return {
      ok: false,
      status: 401,
      code: "signed_envelope_not_yet_valid",
      reason: "Signed A2A envelope timestamp is too far in the future.",
    };
  }
  if (envelope.signature.expires_at) {
    const expiresAtMs = Date.parse(envelope.signature.expires_at);
    if (!Number.isFinite(expiresAtMs)) {
      return {
        ok: false,
        status: 400,
        code: "signed_envelope_bad_timestamp",
        reason: "Signed A2A envelope has an invalid expires_at timestamp.",
      };
    }
    if (expiresAtMs < nowMs) {
      return {
        ok: false,
        status: 401,
        code: "signed_envelope_expired",
        reason: "Signed A2A envelope expired.",
      };
    }
  }
  return null;
}
