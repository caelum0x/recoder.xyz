import fs from 'node:fs';
import path from 'node:path';

import {
  AgentCapabilityKindEnum,
  AgentRuntimeKindEnum,
  ApprovalPolicyModeEnum,
  CwdPolicyModeEnum,
  MemoryScopeEnum,
  PermissionEffectEnum,
  RuntimeHealthStatusEnum,
  TaskIntentEnum,
  isTaskIntent,
  createAgentProfile,
  type AgentProfile,
  type InstructionBundle,
} from '@recoder/a2a-sdk';
import type { TaskArtifact, TaskEnvelope } from '@recoder/shared/a2a';

import {
  compileInstructionBundle,
  type FailurePattern,
  type InstructionCompileInput,
  type MemorySnapshot,
  type PathInstructionRule,
  type RecoderTaskSpec,
  type RepoContextManifest,
  type SpacePolicy,
  type VerificationPlan,
} from '@recoder/agent-instructions';

const COMPILER_ACTOR = 'agent-os-compiler';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }
  return [];
}

function extractPrompt(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const prompt = extractPrompt(item);
      if (prompt) return prompt;
    }
    return '';
  }
  if (!isRecord(payload)) return '';
  if (payload.kind === 'text' && typeof payload.text === 'string') {
    return payload.text;
  }
  return readString(payload.task) ?? readString(payload.prompt) ?? readString(payload.content) ?? '';
}

function findRepoRoot(startDir = process.cwd()): string | null {
  let current = path.resolve(startDir);

  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(current, 'AGENTS.md'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function mapPlatformToVendorSurface(platform: string): AgentProfile['vendor_surface'] {
  if (platform === 'claude_code') return 'claude_code';
  if (platform === 'codex') return 'codex';
  if (platform === 'qwen_code') return 'qwen_code';
  if (platform === 'gemini_cli') return 'gemini_cli';
  return 'recoder_code';
}

function buildTaskSpec(task: TaskEnvelope): RecoderTaskSpec {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  const prompt = extractPrompt(task.payload);
  const rawIntent = readString((isRecord(task.payload) ? task.payload.intent : undefined) ?? metadata.intent);
  const intent = rawIntent && isTaskIntent(rawIntent)
    ? rawIntent as RecoderTaskSpec['intent']
    : TaskIntentEnum.Custom;
  const title = readString(metadata.title) ?? prompt.split('\n')[0]?.trim() ?? `Task ${task.id}`;
  const goal = readString(metadata.goal) ?? (prompt || title);

  return {
    title,
    intent,
    goal,
    repo: readString(metadata.repo),
    space_id: task.workspace_id,
    branch_policy: readString(metadata.branch_policy),
    target_paths: readStringArray(metadata.target_paths ?? metadata.targetPaths),
    forbidden_paths: readStringArray(metadata.forbidden_paths ?? metadata.forbiddenPaths),
    acceptance: readStringArray(metadata.acceptance ?? metadata.acceptance_criteria),
    verify: readStringArray(metadata.verify ?? metadata.verification_commands),
    approval_required: readStringArray(metadata.approval_required ?? metadata.approvalRequired),
    artifact_required: readStringArray(metadata.artifact_required ?? metadata.artifactRequired),
  };
}

function buildRepoContext(repoRoot: string): RepoContextManifest {
  return {
    repo_root: repoRoot,
    repo_name: path.basename(repoRoot),
    current_branch: process.env.GIT_BRANCH || undefined,
  };
}

function buildSpacePolicy(task: TaskEnvelope): SpacePolicy {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  const policy = isRecord(metadata.spacePolicy) ? metadata.spacePolicy : {};

  return {
    policy_id: readString(policy.policy_id),
    name: readString(policy.name),
    forbidden_paths: readStringArray(policy.forbidden_paths),
    forbidden_actions: readStringArray(policy.forbidden_actions),
  };
}

function buildMemory(task: TaskEnvelope): MemorySnapshot[] {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  const memory = Array.isArray(metadata.memoryContext) ? metadata.memoryContext : [];
  const snapshots: MemorySnapshot[] = [];

  memory.forEach((item, index) => {
    if (!isRecord(item)) return;
    const title = readString(item.title) ?? readString(item.content);
    const body = readString(item.body) ?? readString(item.content);
    if (!title || !body) return;
    snapshots.push({
      memory_id: readString(item.memory_id) ?? `memory-${index + 1}`,
      scope: 'repo',
      title,
      body,
      evidence_task_id: readString(item.evidence_task_id),
      evidence_artifact_id: readString(item.evidence_artifact_id),
    });
  });

  return snapshots;
}

function buildPathRules(task: TaskEnvelope): PathInstructionRule[] {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  const rules = Array.isArray(metadata.pathRules) ? metadata.pathRules : [];

  return rules
    .map((item) => {
      if (!isRecord(item)) return null;
      const glob = readString(item.glob);
      const instruction = readString(item.instruction);
      if (!glob || !instruction) return null;
      return {
        glob,
        instruction,
      };
    })
    .filter((item): item is PathInstructionRule => item !== null);
}

function buildFailurePatterns(task: TaskEnvelope): FailurePattern[] {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  const failures = Array.isArray(metadata.recentFailures) ? metadata.recentFailures : [];

  return failures
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const summary = readString(item.summary);
      const guidance = readString(item.guidance);
      if (!summary || !guidance) return null;
      return {
        pattern_id: readString(item.pattern_id) ?? `failure-${index + 1}`,
        summary,
        guidance,
      };
    })
    .filter((item): item is FailurePattern => item !== null);
}

function buildVerificationPlan(task: TaskEnvelope): VerificationPlan {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  return {
    commands: readStringArray(metadata.verify ?? metadata.verification_commands),
    browser_checks: readStringArray(metadata.browser_checks),
  };
}

function buildAgentProfile(task: TaskEnvelope): AgentProfile {
  return createAgentProfile({
    agent_id: task.assignee.agent_id,
    display_name: task.assignee.name || task.assignee.agent_id,
    vendor_surface: mapPlatformToVendorSurface(task.assignee.platform),
    connector_id: task.connector.connector_id,
    runtime_kind: AgentRuntimeKindEnum.Local,
    capabilities: [
      {
        capability_id: 'implementation',
        label: 'Implementation',
        kind: AgentCapabilityKindEnum.Implementation,
      },
      {
        capability_id: 'verification',
        label: 'Verification',
        kind: AgentCapabilityKindEnum.Verification,
      },
    ],
    tools: [
      {
        tool_name: task.connector.connector_id,
        modes: ['execute'],
      },
    ],
    supported_task_intents: [buildTaskSpec(task).intent],
    permissions: {
      default_file_effect: PermissionEffectEnum.Deny,
      path_rules: [],
      tool_rules: [
        {
          tool_name: task.connector.connector_id,
          effect: PermissionEffectEnum.Allow,
        },
      ],
      allow_network: true,
      allow_shell: true,
      allow_git_write: false,
      allow_pr_creation: false,
      allow_secrets_access: false,
      max_parallel_subagents: 1,
      write_lock_required: true,
    },
    approval_policy: {
      mode: ApprovalPolicyModeEnum.Policy,
      required_rules: [],
      allow_auto_approval_for_low_risk: false,
    },
    memory_scope: MemoryScopeEnum.Repo,
    cwd_policy: {
      mode: CwdPolicyModeEnum.RepoRoot,
      allowed_roots: [],
    },
    health: {
      status: RuntimeHealthStatusEnum.Healthy,
      checked_at: new Date().toISOString(),
    },
  });
}

export function compileInstructionBundleForTask(task: TaskEnvelope): InstructionBundle | null {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    return null;
  }

  const compileInput: InstructionCompileInput = {
    task: buildTaskSpec(task),
    agent: buildAgentProfile(task),
    repoContext: buildRepoContext(repoRoot),
    spacePolicy: buildSpacePolicy(task),
    memory: buildMemory(task),
    pathRules: buildPathRules(task),
    recentFailures: buildFailurePatterns(task),
    verification: buildVerificationPlan(task),
  };

  return compileInstructionBundle(compileInput);
}

export function buildInstructionBundleArtifact(
  taskId: string,
  bundle: InstructionBundle,
): TaskArtifact {
  return {
    key: `instruction-bundle:${taskId}`,
    artifact_type: 'custom',
    mime_type: 'application/json',
    path: `.recoder/artifacts/instruction-bundle-${taskId}.json`,
    content: JSON.stringify(bundle, null, 2),
    metadata: {
      type: 'instruction_bundle',
      compilerVersion: bundle.provenance.compiler_version,
      compiledAt: bundle.provenance.compiled_at,
      sourceFileCount: bundle.provenance.source_files.length,
    },
  };
}

export function buildInstructionBundleMetadata(bundle: InstructionBundle): Record<string, unknown> {
  return {
    sharedGoal: bundle.shared_goal,
    verificationCommands: bundle.verification_commands,
    forbiddenActions: bundle.forbidden_actions,
    approvalGateIds: bundle.approval_gates.map((gate) => gate.approval_id),
    memoryRefs: bundle.memory_used.map((memory) => ({
      memory_id: memory.memory_id,
      scope: memory.scope,
      title: memory.title,
    })),
    provenance: bundle.provenance,
  };
}

export const INSTRUCTION_BUNDLE_TRIGGER = COMPILER_ACTOR;
