import {
  ApprovalPolicyModeEnum,
  ApprovalRequirementAtEnum,
  AgentRuntimeKindEnum,
  AgentVendorSurfaceEnum,
  MemoryScopeEnum,
  PermissionEffectEnum,
  RuntimeHealthStatusEnum,
  TaskIntentEnum,
  ToolCapabilityModeEnum,
  createAgentProfile,
  type AgentProfile,
  type AgentVendorSurface,
} from '@recoder/a2a-sdk';
import { compileInstructionBundle, type InstructionCompileInput } from '../packages/agent-instructions/src/compiler';

function createSampleAgent(surface: AgentVendorSurface): AgentProfile {
  return createAgentProfile({
    agent_id: `sample-${surface}`,
    display_name: `Sample ${surface}`,
    vendor_surface: surface,
    connector_id: `${surface}-connector`,
    runtime_kind: AgentRuntimeKindEnum.Local,
    capabilities: [
      {
        capability_id: 'implementation',
        label: 'Implementation',
        kind: 'implementation',
      },
      {
        capability_id: 'verification',
        label: 'Verification',
        kind: 'verification',
      },
    ],
    tools: [
      {
        tool_name: 'recoder.git_nexus.get_context_pack',
        modes: [ToolCapabilityModeEnum.Read],
      },
      {
        tool_name: 'recoder.artifacts.create',
        modes: [ToolCapabilityModeEnum.Write],
      },
    ],
    supported_task_intents: [TaskIntentEnum.PlatformHardening],
    permissions: {
      default_file_effect: PermissionEffectEnum.Allow,
      path_rules: [
        {
          glob: '.env*',
          effect: PermissionEffectEnum.Deny,
          reason: 'Secret-bearing env files are forbidden.',
        },
      ],
      tool_rules: [],
      allow_network: false,
      allow_shell: true,
      allow_git_write: false,
      allow_pr_creation: false,
      allow_secrets_access: false,
      max_parallel_subagents: 1,
      write_lock_required: true,
    },
    approval_policy: {
      mode: ApprovalPolicyModeEnum.Policy,
      required_rules: [
        {
          id: 'before-sensitive-write',
          label: 'Human approval before auth, billing, security, or production changes',
          when: ApprovalRequirementAtEnum.BeforeSensitiveAction,
          required: true,
        },
      ],
      allow_auto_approval_for_low_risk: false,
    },
    memory_scope: MemoryScopeEnum.Repo,
    cwd_policy: {
      mode: 'repo_root',
      allowed_roots: ['.'],
      preferred_root: '.',
    },
    health: {
      status: RuntimeHealthStatusEnum.Healthy,
      checked_at: new Date().toISOString(),
    },
  });
}

function createInput(agent: AgentProfile): InstructionCompileInput {
  return {
    task: {
      title: 'Recoder Agent OS sample compile',
      intent: TaskIntentEnum.PlatformHardening,
      goal: 'Compile a runtime-specific instruction bundle from TaskSpec, Beads, Git Nexus, PAL, policy, tools, memory, and verification inputs.',
      repo: 'caelum0x/recoder.xyz',
      space_id: 'sp_sample',
      branch_policy: 'create_worktree_branch',
      target_paths: ['packages/agent-instructions/**', 'oss/manifests/**'],
      forbidden_paths: ['.env*', 'secrets/**'],
      acceptance: [
        'Claude and Codex bundles render from the same task spec.',
        'Bundles include provenance and verification commands.',
      ],
      verify: ['pnpm oss:health', 'pnpm agent:instructions:check'],
      approval_required: ['before touching auth, billing, security, or production files'],
      artifact_required: ['summary', 'changed_files', 'verification_output'],
    },
    agent,
    repoContext: {
      repo_root: process.cwd(),
      repo_name: 'recoder.xyz',
      current_branch: 'main',
      default_branch: 'main',
    },
    spacePolicy: {
      policy_id: 'space-policy-sample',
      name: 'Sample Space policy',
      forbidden_paths: ['.env*', 'secrets/**'],
      forbidden_actions: ['Do not push or open PRs without approval.'],
    },
    memory: [
      {
        memory_id: 'mem_build_command',
        scope: 'repo',
        title: 'Agent OS structural check',
        body: 'Use pnpm oss:health to validate registry path coverage without running tests.',
        evidence_task_id: 'task_sample',
        evidence_artifact_id: 'artifact_sample',
      },
    ],
    pathRules: [
      {
        glob: 'packages/agent-instructions/**',
        instruction: 'Keep compiler changes deterministic and provenance-preserving.',
      },
    ],
    recentFailures: [],
    verification: {
      commands: ['pnpm oss:health'],
      browser_checks: [],
    },
    beads: {
      issueId: 'recoder-sample',
      title: 'Register all OSS/internal components',
      status: 'in_progress',
      dependencies: [],
      artifactRefs: ['artifact_sample'],
    },
    gitNexus: {
      taskId: 'task_sample',
      impactedPackages: ['@recoder/agent-instructions', '@recoder/oss-registry'],
      relatedTests: ['tests/contracts/instruction-bundles/compiler.test.ts'],
      riskSummary: 'Compiler provenance and registry shape changes are platform-level but non-runtime.',
    },
    pal: {
      taskId: 'task_sample',
      primaryRuntime: agent.vendor_surface,
      reviewerRuntime: agent.vendor_surface === AgentVendorSurfaceEnum.Codex ? 'claude_code' : 'codex',
      skills: ['recoder-platform'],
      mcpTools: ['recoder.git_nexus.get_context_pack', 'recoder.artifacts.create'],
      risk: 'medium',
    },
    policy: {
      policyId: 'policy_sample',
      decisions: [
        {
          action: 'file.write',
          effect: 'allow',
          reason: 'Target paths are Agent OS contract files.',
        },
      ],
    },
    compilerVersion: 'sample-0.1.0',
  };
}

const bundles = [
  compileInstructionBundle(createInput(createSampleAgent(AgentVendorSurfaceEnum.ClaudeCode))),
  compileInstructionBundle(createInput(createSampleAgent(AgentVendorSurfaceEnum.Codex))),
];

console.log(JSON.stringify({
  ok: bundles.every((bundle) => bundle.agent_specific_prompt.length > 0 && bundle.provenance.source_files.length > 0),
  bundles: bundles.map((bundle) => ({
    goal: bundle.shared_goal,
    promptLength: bundle.agent_specific_prompt.length,
    sourceRefs: bundle.system_context_refs.map((ref) => ref.ref_id),
    verificationCommands: bundle.verification_commands,
    sourceFileCount: bundle.provenance.source_files.length,
    compilerVersion: bundle.provenance.compiler_version,
  })),
}, null, 2));
