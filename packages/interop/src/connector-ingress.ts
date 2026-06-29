import {
  canonicalJson,
  createSignedEnvelope,
  createSignedEnvelopeSignature,
  type SignedEnvelope,
} from "@recoder/a2a-sdk";
import type { AgentProfile, TaskSpec } from "@recoder/agent-os";
import type { McpServerRegistration } from "@recoder/agent-mcp";
import {
  admitSignedMcpCall,
  type McpCallClaim,
  type SignedIngressGateOptions,
  type SignedIngressGateResult,
} from "./signed-ingress-gate";

/**
 * Connector ingress — the signature-verified bridge from a social/channel
 * connector into the workspace loop.
 *
 * Doctrine: every inbound connector message (Slack/Telegram/Discord/Signal/…) is
 * UNTRUSTED channel traffic. The `@recoder/connectors` gateway normalizes and
 * gates that traffic (allowlist + mention + command), but a gated message is
 * still unsigned — it has no place in interop's hostile-by-default edge until it
 * is wrapped in a canonical {@link SignedEnvelope} and proven AT THE EDGE.
 *
 * This module is that bridge. It is intentionally DECOUPLED from the connectors
 * package: interop is a core control-plane edge and must not import a specific
 * connector runtime (monorepo boundary rule). Instead it defines the minimal
 * STRUCTURAL subset of a normalized connector message that the edge needs. The
 * connectors package maps its own `NormalizedInboundMessage` onto this shape; no
 * package imports the other.
 *
 * Two halves, mirroring the rest of interop:
 *
 *   1. SEAL (trusted edge producer): {@link sealConnectorIngress} wraps a
 *      structural connector message into a `SignedEnvelope`, signing
 *      `canonicalJson(payload)` with the gateway's own HMAC secret + key id.
 *      This is the gateway VOUCHING for traffic it observed and gated — the act
 *      that turns unsigned channel bytes into a first-class A2A envelope.
 *
 *   2. ADMIT (hostile-by-default consumer): {@link admitConnectorIngress} takes
 *      the (now over-the-wire, untrusted-again) value and runs it through the
 *      existing {@link admitSignedMcpCall} gate — signature verified, THEN the
 *      MCP tool-call mapped to the actor's policy. Only an admitted result
 *      carries a verified {@link ConnectorIngressPayload} into the workspace loop.
 *
 * Nothing here changes an existing exported signature; it is a new module that
 * composes `admitSignedMcpCall` and the a2a-sdk signing primitives.
 */

/** Stable `payload_type` for a sealed connector-ingress envelope. */
export const CONNECTOR_INGRESS_PAYLOAD_TYPE = "recoder.connector.inbound.v1" as const;

/**
 * The wire-agnostic, structural subset of a normalized connector message the
 * interop edge carries through verification into the workspace loop. This is a
 * deliberate copy of the fields the edge needs — NOT an import of the connectors
 * package — so the core edge stays decoupled from any connector runtime.
 *
 * The connectors package's `NormalizedInboundMessage` is structurally assignable
 * to this type (its required fields are a superset), so a caller can pass a
 * normalized message directly with no adapter object.
 */
export interface ConnectorIngressPayload {
  /** Which channel produced this message (telegram/slack/discord/…). */
  readonly channel: string;
  /** Connector account id the message arrived on (multi-account aware). */
  readonly accountId: string;
  /** Channel-native message id, used for replies/reactions/dedupe. */
  readonly messageId: string;
  /** Channel-native conversation id (chat/channel/thread). */
  readonly conversationId: string;
  /** Plain-text body of the message. */
  readonly text: string;
  /** Whether the assistant was explicitly @mentioned. */
  readonly wasMentioned: boolean;
  /** Epoch milliseconds the channel reports for the message. */
  readonly timestamp: number;
}

/** Inputs to {@link sealConnectorIngress}: WHAT to seal and HOW to sign it. */
export interface SealConnectorIngressInput {
  /** The structural connector message to wrap (a `NormalizedInboundMessage` fits). */
  readonly message: ConnectorIngressPayload;
  /** Shared HMAC secret the gateway signs with (and the edge verifies against). */
  readonly secret: string;
  /** Key id naming the signing gateway/account (resolved at the edge). */
  readonly keyId: string;
  /** Stable envelope id; defaults to `${channel}:${accountId}:${messageId}`. */
  readonly envelopeId?: string;
  /** ISO instant the signature is stamped with (defaults to now). */
  readonly signedAt?: string;
  /** ISO instant the envelope expires (optional; enforced at the edge). */
  readonly expiresAt?: string;
  /** Extra audit metadata carried on the envelope (never part of signed bytes). */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Seal a structural connector message into a canonical, HMAC-signed envelope.
 *
 * The signed bytes are `canonicalJson(payload)` — byte-identical to every other
 * interop envelope — so the existing edge verifies it with no special-casing.
 * This is the connector gateway's vouch: it has already normalized + gated the
 * traffic, and now signs it so the edge can re-prove that vouch independently.
 */
export function sealConnectorIngress(
  input: SealConnectorIngressInput,
): SignedEnvelope<ConnectorIngressPayload> {
  const payload = input.message;
  const signature = createSignedEnvelopeSignature({
    payload,
    secret: input.secret,
    keyId: input.keyId,
    signedAt: input.signedAt,
    expiresAt: input.expiresAt,
  });
  return createSignedEnvelope<ConnectorIngressPayload>({
    id:
      input.envelopeId ??
      `${payload.channel}:${payload.accountId}:${payload.messageId}`,
    payload_type: CONNECTOR_INGRESS_PAYLOAD_TYPE,
    payload,
    signature,
    metadata: input.metadata,
  });
}

/**
 * The MCP tool-call a connector message is requesting admission for, paired with
 * the actor whose policy is checked. Identical in spirit to {@link McpCallClaim}
 * but named for the connector seam so a caller wires "this Slack message wants to
 * run repo.read as agent X under task Y" explicitly.
 */
export interface ConnectorIngressClaim {
  /** Which registered MCP server the connector message targets. */
  readonly server: McpServerRegistration;
  /** The tool the connector message wants to invoke in the workspace loop. */
  readonly toolName: string;
  /** The (already-authenticated) actor profile whose policy is checked. */
  readonly actor: AgentProfile;
  /** The task the call runs under, if any. */
  readonly task?: TaskSpec;
  /** Arbitrary tool args carried into the policy decision metadata. */
  readonly args?: Record<string, unknown>;
}

/**
 * Admit (or reject) one sealed connector-ingress envelope for the workspace loop.
 *
 * Thin, intentional wrapper over {@link admitSignedMcpCall}: the connector seam
 * speaks `ConnectorIngressClaim`, but admission is the SAME hostile-by-default
 * gate every A2A envelope passes — signature first, MCP permission second. An
 * admitted result's `payload` is the verified {@link ConnectorIngressPayload}
 * ready to drive the workspace loop; a rejection names the failing stage/code.
 *
 * Never throws on untrusted input.
 */
export function admitConnectorIngress(
  value: unknown,
  claim: ConnectorIngressClaim,
  options: SignedIngressGateOptions = {},
): SignedIngressGateResult<ConnectorIngressPayload> {
  const mcpClaim: McpCallClaim = {
    server: claim.server,
    toolName: claim.toolName,
    actor: claim.actor,
    ...(claim.task ? { task: claim.task } : {}),
    ...(claim.args ? { args: claim.args } : {}),
  };
  return admitSignedMcpCall<ConnectorIngressPayload>(value, mcpClaim, options);
}
