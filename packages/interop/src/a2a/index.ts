/** A2A wire — agent-card, envelope builders, signing — public barrel. */

// Agent card (serves /.well-known/agent.json)
export {
  buildAgentCard,
  serializeAgentCard,
  AGENT_CARD_WELL_KNOWN_PATH,
  SIGNED_ENVELOPE_SECURITY_SCHEME,
  type BuildAgentCardInput,
} from "./agent-card/builder";
export type {
  AgentCard,
  AgentCardSkill,
  AgentCardSecurityScheme,
  RecoderAgentPlatform,
} from "./agent-card/agent-card-types";

// Envelope builders + lifecycle (composed from a2a-sdk)
export {
  buildCodexEnvelope,
  buildClaudeEnvelope,
  startEnvelope,
  completeEnvelope,
  failEnvelope,
  cancelEnvelope,
  a2aErrorToTaskErrorInfo,
  createTaskEnvelope,
  transitionTaskEnvelope,
  isValidTransition,
  type ConnectorEnvelopeInput,
  type CodexEnvelopeOptions,
  type ClaudeEnvelopeOptions,
  type TaskEnvelope,
  type TaskState,
  type TaskResult,
  type TaskErrorInfo,
} from "./envelope/builders";

// Signing primitives (verify inbound, sign outbound)
export {
  canonicalJson,
  createHmacSha256Signature,
  verifyHmacSha256Signature,
  createSignedEnvelope,
  createSignedEnvelopeSignature,
  isSignedEnvelope,
  validateSignedEnvelopeIngress,
  verifyEd25519Signature,
  toEd25519PublicKey,
  type SignedEnvelope,
  type Ed25519PublicKey,
} from "./sign/sign";
