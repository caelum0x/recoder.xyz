/**
 * ToolAccessResult + ToolPolicy DTOs — TS mirror of the openfang
 * `tool_policy.rs` deny-wins glob resolution. These are control-plane DTOs; the
 * authoritative resolution lives in the Rust daemon, but the fallback enforcer
 * can resolve them locally with the same deny-wins semantics.
 */

export type ToolAccessEffect = 'allow' | 'deny';

/** A single allow/deny rule over a tool-name glob. */
export type ToolPolicyRule = {
  readonly glob: string;
  readonly effect: ToolAccessEffect;
  readonly reason?: string;
};

/**
 * A tool-access policy: an ordered set of agent-scoped rules layered over the
 * global rules, plus a default effect. Deny always wins over allow regardless
 * of order; agent rules take precedence over global rules.
 */
export type ToolPolicy = {
  readonly defaultEffect: ToolAccessEffect;
  readonly globalRules: readonly ToolPolicyRule[];
  readonly agentRules: readonly ToolPolicyRule[];
};

/** The outcome of resolving a tool name against a ToolPolicy. */
export type ToolAccessResult = {
  readonly tool: string;
  readonly effect: ToolAccessEffect;
  readonly reason: string;
  /** Which layer decided this (used for audit transparency). */
  readonly decidedBy: 'agent-deny' | 'global-deny' | 'agent-allow' | 'global-allow' | 'default';
};

export function toolAllowed(result: ToolAccessResult): boolean {
  return result.effect === 'allow';
}

export function toolDenied(result: ToolAccessResult): boolean {
  return result.effect === 'deny';
}
