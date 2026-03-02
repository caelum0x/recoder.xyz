/**
 * @module policy/policy-engine
 *
 * Core policy evaluation engine for the A2A control plane.
 *
 * Responsibilities:
 * 1. Maintain the active policy ruleset (which actions require approval).
 * 2. Evaluate policy check requests against the ruleset.
 * 3. Look up existing approvals to determine if an action is pre-approved.
 * 4. Emit audit events for every policy decision.
 *
 * The engine is stateless with respect to rules -- rules are loaded from
 * the default configuration and can be overridden at runtime via
 * `updatePolicyRules()`.
 */

import { v4 as uuid } from 'uuid';
import { createLogger } from '../logger.js';
import { findActiveApproval } from './approval-store.js';
import {
  PrivilegedActionTypeEnum,
  PolicyDecisionOutcomeEnum,
  type PolicyRule,
  type PolicyRuleset,
  type PolicyCheckRequest,
  type PolicyDecision,
  type PrivilegedActionType,
  type PolicyRuleDisposition,
} from './types.js';

const logger = createLogger('policy:engine');

// ---------------------------------------------------------------------------
// Default Policy Rules
// ---------------------------------------------------------------------------

/**
 * Default policy rules for all privileged action types.
 *
 * In the default configuration:
 * - File system writes and code execution require explicit approval ("prompt")
 * - External API calls and deployments require explicit approval ("prompt")
 * - Database mutations require explicit approval ("prompt")
 * - Secret access is always denied by default ("deny")
 * - Network egress, config changes, user data access, admin actions
 *   all require explicit approval ("prompt")
 *
 * These defaults can be overridden per-workspace or per-agent via
 * `updatePolicyRules()`.
 */
const DEFAULT_POLICY_RULES: PolicyRuleset = {
  [PrivilegedActionTypeEnum.FileSystemWrite]: {
    action: PrivilegedActionTypeEnum.FileSystemWrite,
    disposition: 'prompt',
    reason: 'File system modifications require approval to prevent data loss.',
    bypass_roles: ['admin', 'system'],
    approval_ttl_ms: 30 * 60 * 1000, // 30 minutes
  },
  [PrivilegedActionTypeEnum.ExternalApiCall]: {
    action: PrivilegedActionTypeEnum.ExternalApiCall,
    disposition: 'prompt',
    reason: 'External API calls may expose data or incur costs.',
    bypass_roles: ['admin', 'system'],
    approval_ttl_ms: 15 * 60 * 1000, // 15 minutes
  },
  [PrivilegedActionTypeEnum.Deployment]: {
    action: PrivilegedActionTypeEnum.Deployment,
    disposition: 'prompt',
    reason: 'Deployments affect production systems and require review.',
    bypass_roles: ['admin'],
    approval_ttl_ms: 10 * 60 * 1000, // 10 minutes
  },
  [PrivilegedActionTypeEnum.DatabaseMutation]: {
    action: PrivilegedActionTypeEnum.DatabaseMutation,
    disposition: 'prompt',
    reason: 'Database mutations can cause data loss or corruption.',
    bypass_roles: ['admin', 'system'],
    approval_ttl_ms: 15 * 60 * 1000, // 15 minutes
  },
  [PrivilegedActionTypeEnum.CodeExecution]: {
    action: PrivilegedActionTypeEnum.CodeExecution,
    disposition: 'prompt',
    reason: 'Arbitrary code execution poses security risks.',
    bypass_roles: ['admin'],
    approval_ttl_ms: 30 * 60 * 1000, // 30 minutes
  },
  [PrivilegedActionTypeEnum.SecretAccess]: {
    action: PrivilegedActionTypeEnum.SecretAccess,
    disposition: 'deny',
    reason: 'Secret access is denied by default for security.',
    bypass_roles: ['admin'],
  },
  [PrivilegedActionTypeEnum.NetworkEgress]: {
    action: PrivilegedActionTypeEnum.NetworkEgress,
    disposition: 'prompt',
    reason: 'Outbound network connections may expose internal data.',
    bypass_roles: ['admin', 'system'],
    approval_ttl_ms: 30 * 60 * 1000, // 30 minutes
  },
  [PrivilegedActionTypeEnum.ConfigChange]: {
    action: PrivilegedActionTypeEnum.ConfigChange,
    disposition: 'prompt',
    reason: 'Configuration changes can affect system stability.',
    bypass_roles: ['admin'],
    approval_ttl_ms: 10 * 60 * 1000, // 10 minutes
  },
  [PrivilegedActionTypeEnum.UserDataAccess]: {
    action: PrivilegedActionTypeEnum.UserDataAccess,
    disposition: 'prompt',
    reason: 'User data access must be audited and authorized.',
    bypass_roles: ['admin'],
    approval_ttl_ms: 15 * 60 * 1000, // 15 minutes
  },
  [PrivilegedActionTypeEnum.AdminAction]: {
    action: PrivilegedActionTypeEnum.AdminAction,
    disposition: 'prompt',
    reason: 'Administrative actions require elevated authorization.',
    bypass_roles: ['admin'],
    approval_ttl_ms: 10 * 60 * 1000, // 10 minutes
  },
};

// ---------------------------------------------------------------------------
// Engine State
// ---------------------------------------------------------------------------

/** The active policy ruleset (mutable for runtime overrides). */
let activeRules: PolicyRuleset = { ...DEFAULT_POLICY_RULES };

// ---------------------------------------------------------------------------
// Rule Management
// ---------------------------------------------------------------------------

/**
 * Get the current active policy rules.
 */
export function getPolicyRules(): Readonly<PolicyRuleset> {
  return activeRules;
}

/**
 * Get the policy rule for a specific action type.
 *
 * @param action - The privileged action type.
 * @returns The policy rule, or undefined if no rule exists.
 */
export function getPolicyRule(action: PrivilegedActionType): PolicyRule | undefined {
  return activeRules[action];
}

/**
 * Update one or more policy rules at runtime.
 *
 * @param updates - Partial ruleset to merge into the active rules.
 */
export function updatePolicyRules(updates: Partial<PolicyRuleset>): void {
  activeRules = { ...activeRules, ...updates };
  logger.info(
    { updatedActions: Object.keys(updates) },
    'policy rules updated',
  );
}

/**
 * Reset policy rules to the defaults.
 */
export function resetPolicyRules(): void {
  activeRules = { ...DEFAULT_POLICY_RULES };
  logger.info('policy rules reset to defaults');
}

/**
 * Check whether a given action type is considered privileged
 * (i.e., its disposition is not 'auto').
 *
 * @param action - The action type to check.
 * @returns true if the action requires approval or is denied.
 */
export function isPrivilegedAction(action: string): boolean {
  const rule = activeRules[action as PrivilegedActionType];
  if (!rule) return false; // Unknown actions are not considered privileged
  return rule.disposition !== 'auto';
}

/**
 * Check whether a given string is a valid privileged action type.
 */
export function isValidActionType(action: string): action is PrivilegedActionType {
  return action in activeRules;
}

// ---------------------------------------------------------------------------
// Policy Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a policy check request against the active rules.
 *
 * Decision logic:
 * 1. If the action has no rule -> allowed (not a privileged action).
 * 2. If the rule disposition is 'auto' -> allowed.
 * 3. If the rule disposition is 'deny' and actor has no bypass role -> denied.
 * 4. If the rule disposition is 'prompt':
 *    a. Check if actor has a bypass role -> allowed.
 *    b. Check if a valid active approval exists -> allowed.
 *    c. Otherwise -> requires_approval (returns denied to the middleware).
 *
 * @param request - The policy check request.
 * @returns The policy decision.
 */
export function evaluatePolicy(request: PolicyCheckRequest): PolicyDecision {
  const startMs = Date.now();

  const rule = activeRules[request.action];

  // No rule for this action -> not a privileged action, allow
  if (!rule) {
    return buildDecision({
      outcome: PolicyDecisionOutcomeEnum.Allowed,
      action: request.action,
      resource: request.resource,
      rule: 'auto',
      reason: 'No policy rule defined for this action type; allowed by default.',
      actor_id: request.actor_id,
      task_id: request.task_id,
      trace_id: request.trace_id,
      startMs,
    });
  }

  // Auto-approved actions
  if (rule.disposition === 'auto') {
    return buildDecision({
      outcome: PolicyDecisionOutcomeEnum.Allowed,
      action: request.action,
      resource: request.resource,
      rule: 'auto',
      reason: rule.reason,
      actor_id: request.actor_id,
      task_id: request.task_id,
      trace_id: request.trace_id,
      startMs,
    });
  }

  // Check bypass roles
  if (rule.bypass_roles && request.actor_roles) {
    const hasBypass = request.actor_roles.some(role =>
      rule.bypass_roles!.includes(role),
    );
    if (hasBypass) {
      return buildDecision({
        outcome: PolicyDecisionOutcomeEnum.Allowed,
        action: request.action,
        resource: request.resource,
        rule: rule.disposition,
        reason: `Allowed via role bypass (actor has bypass role for ${rule.disposition} rule).`,
        actor_id: request.actor_id,
        task_id: request.task_id,
        trace_id: request.trace_id,
        startMs,
      });
    }
  }

  // Denied actions (no bypass)
  if (rule.disposition === 'deny') {
    return buildDecision({
      outcome: PolicyDecisionOutcomeEnum.Denied,
      action: request.action,
      resource: request.resource,
      rule: 'deny',
      reason: rule.reason,
      actor_id: request.actor_id,
      task_id: request.task_id,
      trace_id: request.trace_id,
      startMs,
    });
  }

  // Prompt disposition -- check for existing approval
  if (request.task_id) {
    const approval = findActiveApproval(
      request.task_id,
      request.action,
      request.resource,
    );

    if (approval) {
      return buildDecision({
        outcome: PolicyDecisionOutcomeEnum.Allowed,
        action: request.action,
        resource: request.resource,
        rule: 'prompt',
        reason: `Pre-approved via approval ${approval.id}.`,
        actor_id: request.actor_id,
        task_id: request.task_id,
        approval_id: approval.id,
        trace_id: request.trace_id,
        startMs,
      });
    }
  }

  // No approval found -> requires approval (blocked)
  return buildDecision({
    outcome: PolicyDecisionOutcomeEnum.Denied,
    action: request.action,
    resource: request.resource,
    rule: 'prompt',
    reason: `Action requires approval. ${rule.reason}`,
    actor_id: request.actor_id,
    task_id: request.task_id,
    trace_id: request.trace_id,
    startMs,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDecision(input: {
  outcome: PolicyDecision['outcome'];
  action: PrivilegedActionType;
  resource: string;
  rule: PolicyRuleDisposition;
  reason: string;
  actor_id: string;
  task_id?: string;
  approval_id?: string;
  trace_id: string;
  startMs: number;
}): PolicyDecision {
  const now = Date.now();
  const decision: PolicyDecision = {
    outcome: input.outcome,
    action: input.action,
    resource: input.resource,
    rule: input.rule,
    reason: input.reason,
    actor_id: input.actor_id,
    task_id: input.task_id,
    approval_id: input.approval_id,
    timestamp: new Date(now).toISOString(),
    trace_id: input.trace_id,
    duration_ms: now - input.startMs,
  };

  logger.info(
    {
      outcome: decision.outcome,
      action: decision.action,
      resource: decision.resource,
      rule: decision.rule,
      actor: decision.actor_id,
      taskId: decision.task_id,
      approvalId: decision.approval_id,
      durationMs: decision.duration_ms,
    },
    `policy decision: ${decision.outcome}`,
  );

  return decision;
}
