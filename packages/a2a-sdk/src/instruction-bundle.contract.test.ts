import { describe, expect, it } from 'vitest';

import {
  InstructionSourceKindEnum,
  MemoryReferenceScopeEnum,
  createInstructionBundle,
} from './instruction-bundle';
import {
  ApprovalGateStatusEnum,
  ApprovalRequirementAtEnum,
} from './policy';
import { validateInstructionBundle } from './validation';

describe('InstructionBundle contract', () => {
  it('accepts a valid compiled instruction bundle', () => {
    const bundle = createInstructionBundle({
      shared_goal: 'Fix signup crash and verify the preview',
      agent_specific_prompt: 'Use the repo task spec and verify signup in preview.',
      system_context_refs: [
        {
          ref_id: 'root-agents',
          kind: InstructionSourceKindEnum.AgentsMd,
          path: 'AGENTS.md',
          sha: 'abc123',
        },
      ],
      acceptance_criteria: [
        'signup no longer crashes',
        'preview URL responds',
      ],
      verification_commands: [
        'pnpm check-types',
        'pnpm test',
        'pnpm -F recoder-web build',
      ],
      forbidden_actions: [
        'touch .env files',
        'write to secrets/**',
      ],
      approval_gates: [
        {
          approval_id: 'approval-1',
          title: 'Push approval',
          status: ApprovalGateStatusEnum.Pending,
          required_at: ApprovalRequirementAtEnum.BeforePush,
          reason: 'Pushes require human approval',
          path_globs: ['app/**'],
        },
      ],
      memory_used: [
        {
          memory_id: 'mem-build-command',
          scope: MemoryReferenceScopeEnum.Repo,
          title: 'recoder-web build command',
          evidence_task_id: 'task-1',
          evidence_artifact_id: 'artifact-1',
        },
      ],
      provenance: {
        compiler_version: '0.1.0',
        source_files: [
          { path: 'AGENTS.md', sha: 'abc123' },
          { path: 'CLAUDE.md', sha: 'def456' },
        ],
      },
    });

    const result = validateInstructionBundle(bundle);
    expect(result.valid).toBe(true);
  });

  it('rejects bundles with missing provenance and malformed approvals', () => {
    const invalid = {
      shared_goal: '',
      agent_specific_prompt: '',
      system_context_refs: [{ ref_id: '', kind: 'invalid-kind' }],
      acceptance_criteria: [''],
      verification_commands: [''],
      forbidden_actions: [''],
      approval_gates: [
        {
          approval_id: '',
          title: '',
          status: 'waiting',
          required_at: 'sometime',
          reason: '',
        },
      ],
      memory_used: [
        {
          memory_id: '',
          scope: 'invalid',
          title: '',
        },
      ],
      provenance: {
        compiler_version: '',
        compiled_at: 'not-a-date',
        source_files: [{ path: '', sha: '' }],
      },
    };

    const result = validateInstructionBundle(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'shared_goal')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'approval_gates[0].status')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'memory_used[0].scope')).toBe(true);
    expect(
      result.issues.some((issue) => issue.path === 'provenance.source_files[0].path'),
    ).toBe(true);
  });
});
