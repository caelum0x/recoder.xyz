/**
 * The Recoder A2A agent-card types — owned, merged from
 * `@recoder/a2a-sdk/schemas/agent-card.ts`.
 *
 * Per the interop charter ("all code here is owned and merged — never a thin
 * wrapper"), the agent-card SHAPE lives here as a first-party contract rather
 * than being re-imported across a package subpath that `moduleResolution: node`
 * cannot reach. This is the simple Recoder discovery card (platform + skills +
 * security schemes), distinct from the verbose canonical-A2A `AgentCard`.
 */

/** A Recoder platform an agent runs on (mirrors a2a-sdk `RecoderAgentPlatform`). */
export type RecoderAgentPlatform =
  | "recoder"
  | "recoder_pm"
  | "recoder_agency"
  | "recoder_web"
  | "codex"
  | "claude_code"
  | "browser"
  | "custom";

/** One advertised skill on an agent card. */
export interface AgentCardSkill {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

/** A security scheme an agent card advertises. */
export interface AgentCardSecurityScheme {
  readonly type: "bearer" | "api_key" | "oauth2" | "mutual_tls" | "custom";
  readonly description?: string;
}

/** The Recoder A2A discovery card served at `/.well-known/agent.json`. */
export interface AgentCard {
  readonly id: string;
  readonly name: string;
  readonly platform: RecoderAgentPlatform;
  readonly description?: string;
  readonly url?: string;
  readonly version?: string;
  readonly capabilities: readonly string[];
  readonly skills: readonly AgentCardSkill[];
  readonly securitySchemes?: Record<string, AgentCardSecurityScheme>;
  readonly metadata?: Record<string, unknown>;
}
