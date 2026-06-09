import { describe, expect, it } from 'vitest';

import {
  AgentCapabilityKindEnum,
  AgentRuntimeKindEnum,
  AgentVendorSurfaceEnum,
  type AgentProfile,
  createAgentProfile,
} from './agent-profile';
import { TaskIntentEnum } from './task-intent';
import {
  ApprovalPolicyModeEnum,
  ApprovalRequirementAtEnum,
  CwdPolicyModeEnum,
  PermissionEffectEnum,
  RuntimeHealthStatusEnum,
} from './policy';
import { validateAgentProfile } from './validation';

function buildAgentProfile(): AgentProfile {
  return createAgentProfile({
    agent_id: 'agent-codex-1',
    display_name: 'Codex Worker',
    vendor_surface: AgentVendorSurfaceEnum.Codex,
    connector_id: 'codex:local',
    runtime_kind: AgentRuntimeKindEnum.Local,
    capabilities: [
      {
        capability_id: 'cap-implement',
        label: 'Implementation',
        kind: AgentCapabilityKindEnum.Implementation,
      },
      {
        capability_id: 'cap-verify',
        label: 'Verification',
        kind: AgentCapabilityKindEnum.Verification,
      },
    ],
    tools: [
      {
        tool_name: 'exec_command',
        display_name: 'Terminal',
        modes: ['execute', 'read'],
      },
    ],
    supported_task_intents: [
      TaskIntentEnum.Bugfix,
      TaskIntentEnum.PlatformHardening,
    ],
    permissions: {
      default_file_effect: PermissionEffectEnum.Deny,
      path_rules: [
        { glob: 'app/**', effect: PermissionEffectEnum.Allow },
        { glob: '.env*', effect: PermissionEffectEnum.Deny, requires_approval: true },
      ],
      tool_rules: [
        { tool_name: 'exec_command', effect: PermissionEffectEnum.Allow, modes: ['execute'] },
      ],
      allow_network: true,
      allow_shell: true,
      allow_git_write: false,
      allow_pr_creation: false,
      allow_secrets_access: false,
      max_parallel_subagents: 4,
      write_lock_required: true,
    },
    approval_policy: {
      mode: ApprovalPolicyModeEnum.Policy,
      allow_auto_approval_for_low_risk: false,
      required_rules: [
        {
          id: 'approve-push',
          label: 'Approve before push',
          when: ApprovalRequirementAtEnum.BeforePush,
          required: true,
        },
      ],
    },
    memory_scope: 'repo',
    cwd_policy: {
      mode: CwdPolicyModeEnum.RepoRoot,
      allowed_roots: ['/workspace/repo'],
      preferred_root: '/workspace/repo',
    },
    health: {
      status: RuntimeHealthStatusEnum.Healthy,
      checked_at: '2026-06-06T00:00:00.000Z',
      latency_ms: 120,
    },
    last_seen_at: '2026-06-06T00:00:00.000Z',
  });
}

describe('AgentProfile contract', () => {
  it('accepts a valid canonical agent profile', () => {
    const profile = buildAgentProfile();
    const result = validateAgentProfile(profile);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid vendor surfaces, intents, and policy limits', () => {
    const invalid = {
      ...buildAgentProfile(),
      vendor_surface: 'invalid-surface',
      supported_task_intents: ['bugfix', 'does_not_exist'],
      permissions: {
        ...buildAgentProfile().permissions,
        max_parallel_subagents: -1,
      },
    };

    const result = validateAgentProfile(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'vendor_surface')).toBe(true);
    expect(
      result.issues.some((issue) => issue.path === 'supported_task_intents[1]'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.path === 'permissions.max_parallel_subagents'),
    ).toBe(true);
  });
});
