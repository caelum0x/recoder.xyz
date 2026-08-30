/**
 * Workspace policy profile parsing and projection. This is the shared authority
 * for every workspace-owned `tool.call`: signed skill actions and swarm unblock
 * resolve their exact tool name through the same allow/approval/deny rule set.
 */
import type {
  AgentPermissionPolicy,
  Workspace,
  WorkspacePolicyProfile,
  WorkspaceToolPolicyEffect,
  WorkspaceToolPolicyRule,
} from '@recoder/agent-os';
import { createError, ErrorCode } from '../../../shared/errors.js';

const MAX_RULES = 64;
const MAX_REASON = 500;
const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const EFFECTS = new Set<WorkspaceToolPolicyEffect>(['allow', 'needs_approval', 'deny']);

export interface WorkspacePolicyView {
  readonly persisted: boolean;
  /** False means a stored legacy/corrupt profile was ignored in favor of defaults. */
  readonly valid: boolean;
  readonly profile: WorkspacePolicyProfile;
}

export interface WorkspacePolicyUpdate {
  readonly expectedRevision: number;
  readonly defaultToolEffect: WorkspaceToolPolicyEffect;
  readonly toolRules: readonly WorkspaceToolPolicyRule[];
  readonly swarm: {
    readonly autoAnswer: boolean;
    readonly minConfidence: number;
  };
}

export function defaultWorkspacePolicyProfile(): WorkspacePolicyProfile {
  return {
    version: 1,
    revision: 0,
    defaultToolEffect: 'allow',
    toolRules: [],
    swarm: { autoAnswer: false, minConfidence: 0.8 },
  };
}

function effect(value: unknown): value is WorkspaceToolPolicyEffect {
  return typeof value === 'string' && EFFECTS.has(value as WorkspaceToolPolicyEffect);
}

function storedProfile(value: unknown): WorkspacePolicyProfile | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<WorkspacePolicyProfile>;
  if (row.version !== 1 || !Number.isInteger(row.revision) || Number(row.revision) < 1 ||
      !effect(row.defaultToolEffect) || !Array.isArray(row.toolRules) || row.toolRules.length > MAX_RULES ||
      !row.swarm || typeof row.swarm !== 'object' || typeof row.swarm.autoAnswer !== 'boolean' ||
      typeof row.swarm.minConfidence !== 'number' || !Number.isFinite(row.swarm.minConfidence) ||
      row.swarm.minConfidence <= 0 || row.swarm.minConfidence > 1) return null;
  const names = new Set<string>();
  for (const rule of row.toolRules) {
    if (!rule || typeof rule !== 'object' || typeof rule.toolName !== 'string' ||
        !TOOL_NAME.test(rule.toolName) || !effect(rule.effect) ||
        (rule.reason != null && (typeof rule.reason !== 'string' || rule.reason.length > MAX_REASON)) ||
        names.has(rule.toolName)) return null;
    names.add(rule.toolName);
  }
  if (row.updatedAt != null && typeof row.updatedAt !== 'string') return null;
  if (row.updatedBy != null && typeof row.updatedBy !== 'string') return null;
  return row as WorkspacePolicyProfile;
}

export function workspacePolicyView(workspace: Workspace): WorkspacePolicyView {
  if (workspace.policyProfile == null) {
    return { persisted: false, valid: true, profile: defaultWorkspacePolicyProfile() };
  }
  const profile = storedProfile(workspace.policyProfile);
  return profile
    ? { persisted: true, valid: true, profile }
    : { persisted: true, valid: false, profile: defaultWorkspacePolicyProfile() };
}

export function effectiveWorkspacePolicy(value: unknown): WorkspacePolicyProfile {
  return storedProfile(value) ?? defaultWorkspacePolicyProfile();
}

export function parseWorkspacePolicyUpdate(value: unknown): WorkspacePolicyUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'workspace policy must be an object');
  }
  const row = value as Record<string, unknown>;
  const expectedRevision = row.expectedRevision;
  const defaultToolEffect = row.defaultToolEffect;
  const rawRules = row.toolRules;
  const rawSwarm = row.swarm;
  if (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'expectedRevision must be a non-negative integer');
  }
  if (!effect(defaultToolEffect)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'defaultToolEffect must be allow, needs_approval, or deny');
  }
  if (!Array.isArray(rawRules) || rawRules.length > MAX_RULES) {
    throw createError(ErrorCode.VALIDATION_ERROR, `toolRules must contain at most ${MAX_RULES} rules`);
  }
  const toolRules: WorkspaceToolPolicyRule[] = [];
  const names = new Set<string>();
  for (const candidate of rawRules) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'each tool rule must be an object');
    }
    const rule = candidate as Record<string, unknown>;
    const toolName = typeof rule.toolName === 'string' ? rule.toolName.trim() : '';
    const reason = typeof rule.reason === 'string' ? rule.reason.trim() : '';
    if (!TOOL_NAME.test(toolName)) {
      throw createError(ErrorCode.VALIDATION_ERROR, `invalid governed tool name: ${toolName || '<empty>'}`);
    }
    if (!effect(rule.effect)) {
      throw createError(ErrorCode.VALIDATION_ERROR, `invalid effect for ${toolName}`);
    }
    if (reason.length > MAX_REASON) {
      throw createError(ErrorCode.VALIDATION_ERROR, `reason for ${toolName} exceeds ${MAX_REASON} characters`);
    }
    if (names.has(toolName)) {
      throw createError(ErrorCode.VALIDATION_ERROR, `duplicate tool rule: ${toolName}`);
    }
    names.add(toolName);
    toolRules.push({ toolName, effect: rule.effect, ...(reason ? { reason } : {}) });
  }
  if (!rawSwarm || typeof rawSwarm !== 'object' || Array.isArray(rawSwarm)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'swarm policy must be an object');
  }
  const swarm = rawSwarm as Record<string, unknown>;
  if (typeof swarm.autoAnswer !== 'boolean') {
    throw createError(ErrorCode.VALIDATION_ERROR, 'swarm.autoAnswer must be boolean');
  }
  if (typeof swarm.minConfidence !== 'number' || !Number.isFinite(swarm.minConfidence) ||
      swarm.minConfidence <= 0 || swarm.minConfidence > 1) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'swarm.minConfidence must be greater than 0 and at most 1');
  }
  return {
    expectedRevision: Number(expectedRevision),
    defaultToolEffect,
    toolRules: toolRules.sort((a, b) => a.toolName.localeCompare(b.toolName)),
    swarm: { autoAnswer: swarm.autoAnswer, minConfidence: swarm.minConfidence },
  };
}

/** Convert the effective workspace rule for one exact tool into agent-policy input. */
export function policyToolRules(
  profile: WorkspacePolicyProfile,
  toolName: string,
): AgentPermissionPolicy['toolRules'] {
  const override = profile.toolRules.find(rule => rule.toolName === toolName);
  const selected = override?.effect ?? profile.defaultToolEffect;
  return [{
    toolName,
    effect: selected === 'deny' ? 'deny' : 'allow',
    ...(selected === 'needs_approval' ? { requiresApproval: true } : {}),
    ...(override?.reason ? { reason: override.reason } : {}),
  }];
}
