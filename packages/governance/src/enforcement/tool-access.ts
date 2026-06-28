import { globMatch } from '@recoder/agent-policy';
import type { ToolAccessResult, ToolPolicy, ToolPolicyRule } from '../domain/tool-access';

/**
 * resolveToolAccess — pure-TS mirror of the openfang `tool_policy.rs`
 * `resolve_tool_access`: deny-wins glob resolution where agent rules take
 * precedence over global rules.
 *
 * Resolution order (first match in each pass wins, deny passes run first):
 *   1. agent deny rules
 *   2. global deny rules
 *   3. agent allow rules
 *   4. global allow rules
 *   5. default effect
 *
 * Deny always beats allow regardless of declaration order, so a permissive
 * allow can never override an explicit deny.
 */
export function resolveToolAccess(tool: string, policy: ToolPolicy): ToolAccessResult {
  const agentDeny = firstMatch(tool, policy.agentRules, 'deny');
  if (agentDeny) {
    return result(tool, 'deny', 'agent-deny', agentDeny.reason ?? `Tool '${tool}' denied by agent policy.`);
  }
  const globalDeny = firstMatch(tool, policy.globalRules, 'deny');
  if (globalDeny) {
    return result(tool, 'deny', 'global-deny', globalDeny.reason ?? `Tool '${tool}' denied by global policy.`);
  }
  const agentAllow = firstMatch(tool, policy.agentRules, 'allow');
  if (agentAllow) {
    return result(tool, 'allow', 'agent-allow', agentAllow.reason ?? `Tool '${tool}' allowed by agent policy.`);
  }
  const globalAllow = firstMatch(tool, policy.globalRules, 'allow');
  if (globalAllow) {
    return result(tool, 'allow', 'global-allow', globalAllow.reason ?? `Tool '${tool}' allowed by global policy.`);
  }
  return result(
    tool,
    policy.defaultEffect,
    'default',
    `Tool '${tool}' resolved to default effect '${policy.defaultEffect}'.`,
  );
}

function firstMatch(
  tool: string,
  rules: readonly ToolPolicyRule[],
  effect: 'allow' | 'deny',
): ToolPolicyRule | undefined {
  return rules.find((rule) => rule.effect === effect && globMatch(rule.glob, tool));
}

function result(
  tool: string,
  effect: 'allow' | 'deny',
  decidedBy: ToolAccessResult['decidedBy'],
  reason: string,
): ToolAccessResult {
  return { tool, effect, decidedBy, reason };
}
