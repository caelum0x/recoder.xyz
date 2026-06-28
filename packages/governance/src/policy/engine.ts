import type { PolicyDecision } from '@recoder/agent-os';
import {
  evaluateFileAccess,
  evaluateNetworkAccess,
  evaluateToolUse,
  evaluateApprovalRequired,
  evaluateSecretAccess,
  evaluateCommandRisk,
  evaluateMcpToolRisk,
  decision,
  type PolicyInput,
  type PolicyAction,
} from '@recoder/agent-policy';
import { evaluateWorkLock } from './rules/work-lock';
import { makeForbiddenPathRule, type ForbiddenPathOptions } from './rules/forbidden-path';

export type { PolicyInput, PolicyAction } from '@recoder/agent-policy';

/**
 * The fused governance policy chain.
 *
 * This COMPOSES @recoder/agent-policy: it calls the exact same upstream rule
 * functions (`evaluateSecretAccess`, `evaluateApprovalRequired`, …) and the same
 * `decision()` factory, then injects the two governance-only rules at the
 * deny-biased positions the blueprint specifies:
 *
 *   secret-access            (upstream — hard deny on memory.write / secret paths)
 *   forbidden-path  (NEW)    (hard deny auth/billing/security writes)
 *   work-lock       (NEW)    (hard deny writes outside the held lock envelope)
 *   approval-required        (upstream — push/PR -> needs_approval)
 *   command-risk             (upstream — dangerous shell -> needs_approval)
 *   mcp-tool-risk            (upstream — risky MCP tool -> needs_approval)
 *   network-access           (upstream — egress deny)
 *   tool-use                 (upstream — tool allow/deny)
 *   file-access              (upstream — path rules + writeLockRequired)
 *   default allow
 *
 * `??` short-circuits at the first rule that returns a decision, so the most
 * restrictive rule that fires first wins. The two new deny rules sit ABOVE the
 * upstream approval rules precisely so a hard deny cannot be downgraded to
 * needs_approval.
 */

export type GovernanceEvaluateOptions = {
  readonly forbiddenPath?: ForbiddenPathOptions;
};

export function makeEvaluatePolicy(options?: GovernanceEvaluateOptions) {
  const evaluateForbiddenPath = makeForbiddenPathRule(options?.forbiddenPath);

  return function evaluateGovernancePolicy(input: PolicyInput): PolicyDecision {
    return (
      evaluateSecretAccess(input) ??
      evaluateForbiddenPath(input) ??
      evaluateWorkLock(input) ??
      evaluateApprovalRequired(input) ??
      evaluateCommandRisk(input) ??
      evaluateMcpToolRisk(input) ??
      evaluateNetworkAccess(input) ??
      evaluateToolUse(input) ??
      evaluateFileAccess(input) ??
      decision(input, 'allow', 'Allowed by Recoder governance policy chain.')
    );
  };
}

/** Default-config fused chain. */
export const evaluateGovernancePolicy = makeEvaluatePolicy();
