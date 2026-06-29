/**
 * Connector ingress signed gate — the hostile-by-default edge between a verified
 * channel delivery and the Conductor workspace loop.
 *
 * Doctrine (interop charter): an inbound connector message (Slack/Telegram/…) is
 * UNTRUSTED channel traffic. The connectors gateway already normalizes and gates
 * it at the channel boundary (channel HMAC over the raw body in webhook-ingress,
 * allowlist + mention + command in the gateway), but a gated message is still
 * UNSIGNED — it has no place in interop's edge until the gateway VOUCHES for it by
 * sealing it into a canonical {@link SignedEnvelope}, and the workspace-loop edge
 * re-proves that vouch independently.
 *
 * This module is that bridge, wired onto the SINGLE entry into the workspace loop
 * (`ConnectorsGateway.handleInbound`). It composes the OWNED `@recoder/interop`
 * connector-ingress primitives — never a second control path:
 *
 *   1. SEAL: {@link sealConnectorIngress} wraps the normalized message into an
 *      HMAC-signed envelope using the gateway's own ingress secret + key id. This
 *      is the gateway vouching for the traffic it observed and gated.
 *   2. ADMIT: {@link admitConnectorIngress} runs that envelope back through the
 *      same hostile-by-default gate every A2A envelope passes — signature first
 *      (the gateway's own vouch re-proven), MCP permission second. Only an
 *      admitted result carries a verified payload into the workspace loop.
 *
 * Degrade-safe + additive: the gate is ENABLED only when an ingress secret is
 * configured (`CONNECTORS_INGRESS_SECRET`). With no secret it is inert and every
 * already-gated message passes through unchanged — preserving the channel-edge
 * trust boundary that is always in force. When enabled, a message that fails
 * admission is DROPPED before it reaches the workspace loop, truthfully (the
 * caller logs the failing stage/code). Never throws on untrusted input.
 */
import {
  admitConnectorIngress,
  sealConnectorIngress,
  type ConnectorIngressClaim,
  type ConnectorIngressPayload,
} from '@recoder/interop';
import type { McpServerRegistration } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import type { NormalizedInboundMessage } from '@recoder/connectors';

/** Env var carrying the shared HMAC secret the gateway seals + verifies with. */
const INGRESS_SECRET_ENV = 'CONNECTORS_INGRESS_SECRET';

/** Stable key id naming the connectors gateway as the sealing/vouching party. */
const INGRESS_KEY_ID = 'connectors-gateway';

/** Synthetic ingress actor id (no deny rules → the signature stage is the trust). */
const INGRESS_ACTOR_ID = 'connector-ingress-edge';

/**
 * Resolve the gateway's ingress secret from the environment. Returns null when
 * unset (the gate then degrades to an inert pass-through). Never throws.
 */
export function resolveIngressSecret(): string | null {
  const raw = (process.env[INGRESS_SECRET_ENV] ?? '').trim();
  return raw.length > 0 ? raw : null;
}

/** Whether the signed connector-ingress gate is enabled (secret configured). */
export function isConnectorIngressGateEnabled(): boolean {
  return resolveIngressSecret() !== null;
}

/**
 * Build a minimal, locally-owned ingress actor. It carries no `toolRules`, so the
 * gate's MCP permission stage allows the synthetic ingress tool — the trust
 * decision is made entirely by the signature stage (the gateway's own vouch).
 */
function buildIngressActor(): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: INGRESS_ACTOR_ID,
    displayName: 'Connector Ingress Edge',
    vendorSurface: 'custom',
    connectorId: 'connector-ingress',
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
 * Build the synthetic, always-enabled MCP server + claim the connector message is
 * admitted under. Its only registered tool is the connector-ingress payload type,
 * so the gate's permission stage cleanly admits a signature-verified message
 * without coupling connector ingress to a real MCP server — while still running
 * the genuine `admitConnectorIngress` (→ `admitSignedMcpCall`) gate.
 */
function buildIngressClaim(toolName: string): ConnectorIngressClaim {
  const server: McpServerRegistration = {
    serverId: 'connector-ingress',
    kind: 'custom',
    displayName: 'Connector Ingress',
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

/** Outcome of running a normalized message through the signed ingress gate. */
export type ConnectorIngressGateOutcome =
  | {
      /** The gate is inert (no secret): the message passes through unchanged. */
      readonly kind: 'disabled';
    }
  | {
      /** The gateway sealed + the edge admitted the message. */
      readonly kind: 'admitted';
      readonly payload: ConnectorIngressPayload;
    }
  | {
      /** The sealed message failed re-admission; drop it before the loop. */
      readonly kind: 'rejected';
      readonly stage: 'signature' | 'permission';
      readonly code: string;
      readonly reason: string;
    };

/**
 * Run one already-channel-gated normalized message through the OWNED signed
 * connector-ingress gate before it reaches the workspace loop.
 *
 * When the gate is disabled (no `CONNECTORS_INGRESS_SECRET`), returns `disabled`
 * and the caller proceeds exactly as before — additive + degrade-safe. When
 * enabled, the gateway seals the message with its own secret and immediately
 * re-admits it through the hostile-by-default edge; an `admitted` result carries
 * the verified payload, a `rejected` result names the failing stage/code so the
 * caller can drop the message truthfully. Never throws on untrusted input.
 *
 * The `now` injection is for deterministic tests; production uses the wall clock.
 */
export function admitConnectorMessage(
  message: NormalizedInboundMessage,
  options: { readonly secret?: string | null; readonly now?: Date } = {},
): ConnectorIngressGateOutcome {
  const secret = options.secret === undefined ? resolveIngressSecret() : options.secret;
  if (!secret) {
    return { kind: 'disabled' };
  }

  // SEAL: the gateway vouches for the traffic it normalized + gated.
  const envelope = sealConnectorIngress({
    message,
    secret,
    keyId: INGRESS_KEY_ID,
    ...(options.now ? { signedAt: options.now.toISOString() } : {}),
  });

  // ADMIT: re-prove that vouch at the hostile-by-default edge.
  const claim = buildIngressClaim(envelope.payload_type);
  const result = admitConnectorIngress(envelope, claim, {
    hmacSecret: secret,
    ...(options.now ? { now: options.now } : {}),
  });

  if (!result.admitted) {
    return {
      kind: 'rejected',
      stage: result.stage,
      code: result.code,
      reason: result.reason,
    };
  }
  return { kind: 'admitted', payload: result.payload };
}
