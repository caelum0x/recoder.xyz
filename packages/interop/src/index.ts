/**
 * @recoder/interop — Recoder's hostile-by-default control-plane edge.
 *
 * Fuses the A2A wire-interoperability layer (`@recoder/a2a-sdk`) with the MCP
 * permission contracts (`@recoder/agent-mcp`) so every inbound A2A envelope is
 * untrusted until its signature, identity, and policy are proven AT THE EDGE.
 *
 * First module: the signed-envelope ingress gate — verify an HMAC- or ed25519-
 * signed envelope, THEN admit it against the actor's MCP tool policy. See
 * {@link admitSignedMcpCall}.
 */

// Signed-envelope ingress gate (signature -> MCP permission admission)
export {
  admitSignedMcpCall,
  type McpCallClaim,
  type SignedIngressGateOptions,
  type SignedIngressGateResult,
  type GateRejectionStage,
  type GateRejectionCode,
} from "./signed-ingress-gate";

// Real ed25519 verification (the asymmetric path the a2a-sdk leaves open)
export {
  verifyEd25519Signature,
  toEd25519PublicKey,
  type Ed25519PublicKey,
} from "./ed25519";

// MCP host facade + registry + catalog gate + policy + external supervision
export * from "./mcp";

// A2A wire — agent-card builder, envelope builders, signing primitives
export * from "./a2a";
