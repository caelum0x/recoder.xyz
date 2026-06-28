/**
 * Agent OS presentation + request-shaping helpers — pure functions the Policy
 * and Memory-Candidate panels use to (a) build a real, valid request body from
 * operator form input and (b) derive truthful badge tones / labels from the real
 * backend responses. None of these fabricate data: the policy body carries a
 * minimal-but-real permission policy (the engine reads it to make a real
 * decision), and every derivation is a pure mapping over a value the backend
 * actually returned.
 *
 * Source of truth for the contracts:
 *  - packages/agent-os/src/domain/policy-decision.ts (PolicyDecisionEffect)
 *  - packages/agent-os/src/domain/agent-profile.ts (AgentPermissionPolicy)
 *  - docker-backend/src/agent-os/routes/policy-evaluate.routes.ts (required actor shape)
 *  - packages/agent-os/src/domain/memory-item.ts (MemoryCandidateStatus, scopes)
 */
import type {
  MemoryCandidate,
  MemoryCandidateStatus,
  MemoryScope,
  PolicyAction,
  PolicyDecisionEffect,
  PolicyEvaluateBody,
  PolicyTarget,
} from '../types';

/** The policy actions the backend engine accepts, in a stable display order. */
export const POLICY_ACTIONS: readonly PolicyAction[] = [
  'file.read',
  'file.write',
  'command.run',
  'tool.call',
  'memory.write',
  'artifact.publish',
  'deploy.preview',
  'branch.push',
  'pr.create',
];

/** The memory scopes the lifecycle surface accepts, in a stable display order. */
export const MEMORY_SCOPES: readonly MemoryScope[] = [
  'user',
  'org',
  'space',
  'repo',
  'path',
  'agent',
  'task-type',
];

/**
 * Build the `permissions` object the policy route requires (it validates that
 * `actor.permissions` is a record before the engine reads it). This is a real,
 * neutral default permission policy — `defaultFileEffect: 'allow'` with no special
 * grants — so the engine's own rules (secret access, approval-required, command
 * risk, etc.) decide the outcome rather than a hand-tilted permission set. It is
 * NOT a faked decision: the engine still evaluates the action/target against it.
 */
function defaultActorPermissions(): Record<string, unknown> {
  return {
    defaultFileEffect: 'allow',
    pathRules: [],
    toolRules: [],
    allowNetwork: false,
    allowShell: false,
    allowGitWrite: false,
    allowPrCreation: false,
    allowSecretsAccess: false,
    maxParallelSubagents: 1,
    writeLockRequired: false,
  };
}

export interface PolicyFormInput {
  actor: string;
  action: PolicyAction;
  /** Free-form target value whose meaning depends on the action. */
  target?: string;
}

/**
 * Shape a PolicyEvaluateBody from operator form input. The single `target` field
 * is routed to the right slot for the chosen action (path for file.*, command for
 * command.run, toolName for tool.call, environment otherwise), matching what the
 * engine rules read. Returns the exact body the backend route validates.
 */
export function buildPolicyEvaluateBody(input: PolicyFormInput): PolicyEvaluateBody {
  const agentId = input.actor.trim();
  const value = (input.target ?? '').trim();
  const target: PolicyTarget = {};
  if (value) {
    if (input.action === 'file.read' || input.action === 'file.write') {
      target.path = value;
    } else if (input.action === 'command.run') {
      target.command = value;
    } else if (input.action === 'tool.call') {
      target.toolName = value;
    } else {
      target.environment = value;
    }
  }
  return {
    actor: { agentId, permissions: defaultActorPermissions() },
    action: input.action,
    target,
  };
}

/** A policy form is submittable only with a non-empty actor id. */
export function isPolicyFormValid(input: PolicyFormInput): boolean {
  return input.actor.trim().length > 0;
}

/** Map a decision effect to a badge tone class (matches styles.css tone-*). */
export function effectTone(effect: PolicyDecisionEffect): string {
  switch (effect) {
    case 'allow':
      return 'good';
    case 'needs_approval':
      return 'warn';
    case 'deny':
      return 'bad';
    default:
      return 'neutral';
  }
}

/** Human label for a decision effect (the raw effect with underscores spaced). */
export function effectLabel(effect: PolicyDecisionEffect): string {
  return effect.replace(/_/g, ' ');
}

/** Map a candidate status to a badge tone class (matches styles.css tone-*). */
export function candidateStatusTone(status: MemoryCandidateStatus): string {
  switch (status) {
    case 'accepted':
      return 'good';
    case 'rejected':
      return 'bad';
    case 'reviewed':
      return 'progress';
    case 'candidate_created':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Human label for a candidate status. */
export function candidateStatusLabel(status: MemoryCandidateStatus): string {
  return status.replace(/_/g, ' ');
}

/**
 * A candidate is reviewable (accept/reject actions are legal) only while it is
 * still pending — i.e. it has not already been accepted or rejected. The backend
 * review workflow rejects a re-review, so the UI must not offer one.
 */
export function isCandidatePending(status: MemoryCandidateStatus): boolean {
  return status === 'candidate_created' || status === 'reviewed';
}

/** True when this candidate has evidence (taskId + artifactId) — always required. */
export function hasEvidence(candidate: Pick<MemoryCandidate, 'evidence'>): boolean {
  return Boolean(candidate.evidence?.taskId && candidate.evidence?.artifactId);
}
