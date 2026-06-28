import type {
  AgentCard,
  AgentCardSkill,
  AgentCardSecurityScheme,
} from "./agent-card-types";

/**
 * Agent-card builder — serves the A2A discovery document at
 * `/.well-known/agent.json`.
 *
 * An agent card is how an EXTERNAL party discovers what this Recoder agent can do
 * and how to authenticate to it. interop owns the construction: it takes trusted
 * control-plane facts (id, name, capabilities, the security schemes interop
 * actually enforces) and produces a canonical, deterministic `AgentCard`.
 *
 * Two invariants this builder enforces:
 *   1. It NEVER advertises a security scheme interop doesn't enforce. Because the
 *      signed-ingress gate is mandatory for privileged ops, the card always
 *      advertises a signature/mutual-tls scheme — discovery must not imply an
 *      open, unauthenticated surface.
 *   2. Output is stable: same input → equal card (skills sorted by id), so the
 *      `/.well-known/agent.json` body is cacheable and diffable.
 */

export interface BuildAgentCardInput {
  /** Stable agent id (the card's identity). */
  readonly id: string;
  /** Human-facing name. */
  readonly name: string;
  /** The Recoder platform surface this agent runs on. */
  readonly platform: AgentCard["platform"];
  /** Public base URL where this agent is reachable (no trailing slash). */
  readonly url?: string;
  /** Version string. */
  readonly version?: string;
  /** Short description. */
  readonly description?: string;
  /** Capability tags (e.g. 'implementation', 'review'). De-duplicated + sorted. */
  readonly capabilities: readonly string[];
  /** Skills this agent advertises. Sorted by id for deterministic output. */
  readonly skills: readonly AgentCardSkill[];
  /** Extra security schemes beyond the mandatory signature scheme. */
  readonly extraSecuritySchemes?: Readonly<Record<string, AgentCardSecurityScheme>>;
  /** Arbitrary metadata. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * The well-known path the A2A spec uses for agent discovery. The card builder's
 * output is served verbatim at this path.
 */
export const AGENT_CARD_WELL_KNOWN_PATH = "/.well-known/agent.json";

/**
 * The mandatory security scheme interop advertises on EVERY card: privileged A2A
 * operations require a signed envelope (HMAC-SHA256 or ed25519), enforced by the
 * signed-ingress gate. Advertising it makes the trust boundary discoverable.
 */
export const SIGNED_ENVELOPE_SECURITY_SCHEME: AgentCardSecurityScheme = {
  type: "custom",
  description:
    "Privileged operations require a Recoder signed envelope (HMAC-SHA256 or ed25519), verified at ingress.",
};

/**
 * Build a deterministic `AgentCard`. Capabilities are de-duplicated and sorted;
 * skills are sorted by id; the mandatory signed-envelope scheme is always
 * present and cannot be overridden away by `extraSecuritySchemes`.
 */
export function buildAgentCard(input: BuildAgentCardInput): AgentCard {
  const capabilities = [...new Set(input.capabilities)].sort();
  const skills = [...input.skills].sort((a, b) => a.id.localeCompare(b.id));

  const securitySchemes: Record<string, AgentCardSecurityScheme> = {
    ...input.extraSecuritySchemes,
    // The mandatory scheme is applied LAST so it can never be shadowed.
    signed_envelope: SIGNED_ENVELOPE_SECURITY_SCHEME,
  };

  return {
    id: input.id,
    name: input.name,
    platform: input.platform,
    description: input.description,
    url: input.url,
    version: input.version,
    capabilities,
    skills,
    securitySchemes,
    metadata: input.metadata,
  };
}

/**
 * Serialize a card for the `/.well-known/agent.json` response body. Stable key
 * order via the deterministic builder; pretty-printed for human inspection.
 */
export function serializeAgentCard(card: AgentCard): string {
  return JSON.stringify(card, null, 2);
}
