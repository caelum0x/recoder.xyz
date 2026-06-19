import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  AgentCapabilityKindEnum,
  AgentRuntimeKindEnum,
  AgentVendorSurfaceEnum,
  ApprovalPolicyModeEnum,
  CwdPolicyModeEnum,
  MemoryScopeEnum,
  PermissionEffectEnum,
  RuntimeHealthStatusEnum,
  TaskIntentEnum,
  createAgentProfile,
} from '@recoder/a2a-sdk';

import { compileInstructionBundle } from './compiler';
import { loadPALInstructionSource } from './loaders/pal-loader';

function makeRepoFixture(): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'agent-instructions-'));
  mkdirSync(path.join(repoRoot, '.codex'));
  writeFileSync(path.join(repoRoot, 'AGENTS.md'), '# Root AGENTS\nUse the control plane.\n');
  writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '# Root CLAUDE\n@AGENTS.md\n');
  writeFileSync(path.join(repoRoot, '.codex', 'AGENTS.md'), '# Codex Override\nRead ../AGENTS.md\n');
  return repoRoot;
}

function makeAgent(vendorSurface: 'claude_code' | 'codex' | 'recoder_code') {
  return createAgentProfile({
    agent_id: `agent-${vendorSurface}`,
    display_name: vendorSurface,
    vendor_surface: vendorSurface,
    connector_id: `${vendorSurface}:local`,
    runtime_kind: AgentRuntimeKindEnum.Local,
    capabilities: [
      {
        capability_id: 'implement',
        label: 'Implementation',
        kind: AgentCapabilityKindEnum.Implementation,
      },
    ],
    tools: [{ tool_name: 'exec_command', modes: ['execute'] }],
    supported_task_intents: [TaskIntentEnum.PlatformHardening],
    permissions: {
      default_file_effect: PermissionEffectEnum.Deny,
      path_rules: [{ glob: 'app/**', effect: PermissionEffectEnum.Allow }],
      tool_rules: [{ tool_name: 'exec_command', effect: PermissionEffectEnum.Allow }],
      allow_network: true,
      allow_shell: true,
      allow_git_write: false,
      allow_pr_creation: false,
      allow_secrets_access: false,
      max_parallel_subagents: 2,
      write_lock_required: true,
    },
    approval_policy: {
      mode: ApprovalPolicyModeEnum.Policy,
      allow_auto_approval_for_low_risk: false,
      required_rules: [],
    },
    memory_scope: MemoryScopeEnum.Repo,
    cwd_policy: {
      mode: CwdPolicyModeEnum.RepoRoot,
      allowed_roots: ['/workspace/repo'],
    },
    health: {
      status: RuntimeHealthStatusEnum.Healthy,
      checked_at: '2026-06-06T00:00:00.000Z',
    },
  });
}

describe('compileInstructionBundle', () => {
  it('renders PAL MCP tool grants into instruction provenance', () => {
    const source = loadPALInstructionSource({
      taskId: 'task-pal',
      primaryRuntime: 'codex',
      reviewerRuntime: 'claude_code',
      skills: ['implementation'],
      mcpTools: ['recoder.shell.exec'],
      mcpToolGrants: [
        {
          serverId: 'recoder',
          toolName: 'shell.exec',
          mode: 'execute',
          reason: 'run verification command',
        },
      ],
      risk: 'medium',
    });

    expect(source.content).toContain('MCP tool grants:');
    expect(source.content).toContain('- recoder/shell.exec (execute): run verification command');
    expect(source.ref.path).toBe('pal/task-pal');
  });

  it('compiles a Claude bundle with provenance and loaded instruction refs', () => {
    const repoRoot = makeRepoFixture();
    const bundle = compileInstructionBundle({
      task: {
        title: 'Canonical spine follow-up',
        intent: TaskIntentEnum.PlatformHardening,
        goal: 'Compile agent instructions from repo policy',
        target_paths: ['packages/**'],
        forbidden_paths: ['.env*'],
        acceptance: ['bundle is compiled', 'provenance is attached'],
        verify: ['pnpm check-types'],
      },
      agent: makeAgent(AgentVendorSurfaceEnum.ClaudeCode),
      repoContext: {
        repo_root: repoRoot,
        repo_name: 'recoder.xyz',
        current_branch: 'main',
      },
      spacePolicy: {
        forbidden_actions: ['Do not touch billing flows'],
      },
      memory: [
        {
          memory_id: 'mem-1',
          scope: 'repo',
          title: 'Use pnpm check-types',
          body: 'Typecheck before delivery.',
        },
      ],
      pathRules: [
        {
          glob: 'packages/**',
          instruction: 'Prefer small, typed changes.',
        },
      ],
      recentFailures: [
        {
          pattern_id: 'failure-1',
          summary: 'Missing verification',
          guidance: 'Always include the package check command.',
        },
      ],
      verification: {
        commands: ['pnpm -C packages/a2a-sdk test'],
        browser_checks: ['/workflows'],
      },
    });

    expect(bundle.system_context_refs.map((ref) => ref.path)).toContain('AGENTS.md');
    expect(bundle.system_context_refs.map((ref) => ref.path)).toContain('CLAUDE.md');
    expect(bundle.agent_specific_prompt).toContain('Follow CLAUDE.md');
    expect(bundle.verification_commands).toContain('browser_verify: /workflows');
    expect(bundle.provenance.source_files.length).toBe(2);
  });

  it('compiles a Codex bundle with the codex override and derived forbidden actions', () => {
    const repoRoot = makeRepoFixture();
    const bundle = compileInstructionBundle({
      task: {
        title: 'Codex runtime bundle',
        intent: TaskIntentEnum.Bugfix,
        goal: 'Render the Codex-specific instruction bundle',
        forbidden_paths: ['secrets/**'],
        approval_required: ['before pushing PR'],
      },
      agent: makeAgent(AgentVendorSurfaceEnum.Codex),
      repoContext: {
        repo_root: repoRoot,
      },
      spacePolicy: {
        forbidden_paths: ['billing/**'],
      },
      memory: [],
      pathRules: [],
      recentFailures: [],
      verification: {
        commands: ['pnpm test'],
      },
    });

    expect(bundle.system_context_refs.map((ref) => ref.path)).toContain('.codex/AGENTS.md');
    expect(bundle.agent_specific_prompt).toContain('Codex override');
    expect(bundle.forbidden_actions).toContain('Do not modify secrets/**');
    expect(bundle.forbidden_actions).toContain('Space policy forbids billing/**');
    expect(bundle.approval_gates[0]?.title).toBe('before pushing PR');
  });
});
