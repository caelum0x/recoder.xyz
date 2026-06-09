import type {
  AgentProfile as AgentOsAgentProfile,
  InstructionBundle as AgentOsInstructionBundle,
  InstructionSourceRef as AgentOsInstructionSourceRef,
  MemoryScope as AgentOsMemoryScope,
  TaskSpec as AgentOsTaskSpec,
} from '@recoder/agent-os';
import type {
  AgentProfile as A2AAgentProfile,
  InstructionBundle as A2AInstructionBundle,
  InstructionSourceKind,
  MemoryReferenceScope,
  TaskIntent,
} from '@recoder/a2a-sdk';

import {
  compileInstructionBundle,
  type FailurePattern,
  type InstructionCompileInput,
  type MemorySnapshot,
  type PathInstructionRule,
  type RepoContextManifest,
  type SpacePolicy,
} from './compiler';
import type {
  BeadsInstructionContext,
  Context7InstructionContext,
  GitNexusInstructionContext,
  PALInstructionContext,
  PolicyInstructionContext,
} from './loaders';
import { sha256Hex, type LoadedInstructionSource } from './provenance';

export type AgentOsInstructionMemory = {
  memoryId: string;
  scope: AgentOsMemoryScope | MemoryReferenceScope;
  title: string;
  body: string;
  evidenceTaskId?: string;
  evidenceArtifactId?: string;
};

export type AgentOsInstructionSpacePolicy = {
  policyId?: string;
  name?: string;
  forbiddenPaths?: string[];
  forbiddenActions?: string[];
};

export type AgentOsContextPackInput = {
  taskId?: string;
  impactReport?: {
    impactedPackages?: string[];
    relatedTests?: Array<{
      pathGlob?: string;
      commands?: string[];
      reason?: string;
    }>;
    changedFileRisks?: Array<{
      path: string;
      risk: string;
      reason: string;
    }>;
  };
};

export type AgentOsPALPlanInput = {
  taskId?: string;
  primaryRuntime: string;
  reviewerRuntime?: string;
  skills?: string[];
  mcpTools?: string[];
  risk?: string;
};

export type CompileAgentOsInstructionBundleInput = {
  task: AgentOsTaskSpec;
  agent: AgentOsAgentProfile;
  repoRoot: string;
  repoName?: string;
  currentBranch?: string;
  defaultBranch?: string;
  bundleId?: string;
  compilerVersion?: string;
  spacePolicy?: AgentOsInstructionSpacePolicy;
  memory?: AgentOsInstructionMemory[];
  pathRules?: PathInstructionRule[];
  recentFailures?: FailurePattern[];
  beads?: BeadsInstructionContext;
  contextPack?: AgentOsContextPackInput;
  gitNexus?: GitNexusInstructionContext;
  palPlan?: AgentOsPALPlanInput;
  pal?: PALInstructionContext;
  context7?: Context7InstructionContext[];
  policy?: PolicyInstructionContext;
  extraSources?: LoadedInstructionSource[];
};

export type CompileAgentOsInstructionBundleResult = {
  runtimeBundle: AgentOsInstructionBundle;
  auditBundle: A2AInstructionBundle;
  compileInput: InstructionCompileInput;
};

export function buildAgentOsInstructionCompileInput(
  input: CompileAgentOsInstructionBundleInput,
): InstructionCompileInput {
  const task = input.task;
  const repoContext: RepoContextManifest = {
    repo_root: input.repoRoot,
    repo_name: input.repoName ?? task.repo,
    current_branch: input.currentBranch,
    default_branch: input.defaultBranch,
  };

  return {
    task: {
      title: task.title,
      intent: task.intent as TaskIntent,
      goal: task.goal,
      repo: task.repo,
      space_id: task.spaceId,
      branch_policy: task.branchPolicy,
      target_paths: task.targetPaths,
      forbidden_paths: task.forbiddenPaths,
      acceptance: task.acceptanceCriteria,
      verify: task.verification.commands,
      approval_required: task.approvalRequired,
      artifact_required: task.artifactRequired,
      handoff: task.handoff
        ? {
          reviewer: task.handoff.reviewer,
          final_owner: task.handoff.finalOwner,
        }
        : undefined,
    },
    agent: mapAgentProfile(task, input.agent),
    repoContext,
    spacePolicy: mapSpacePolicy(input.spacePolicy, task),
    memory: (input.memory ?? []).map(mapMemorySnapshot),
    pathRules: input.pathRules ?? [],
    recentFailures: input.recentFailures ?? [],
    verification: {
      commands: task.verification.commands,
      browser_checks: task.verification.browserChecks ?? [],
    },
    compilerVersion: input.compilerVersion,
    beads: input.beads,
    gitNexus: input.gitNexus ?? mapContextPack(input.contextPack, task.taskId),
    pal: input.pal ?? mapPALPlan(input.palPlan, task.taskId),
    context7: input.context7,
    policy: input.policy,
    extraSources: input.extraSources,
  };
}

export function compileAgentOsInstructionBundle(
  input: CompileAgentOsInstructionBundleInput,
): CompileAgentOsInstructionBundleResult {
  const compileInput = buildAgentOsInstructionCompileInput(input);
  const auditBundle = compileInstructionBundle(compileInput);
  const runtimeBundle = mapToAgentOsInstructionBundle({
    auditBundle,
    task: input.task,
    agent: input.agent,
    bundleId: input.bundleId,
  });

  return {
    runtimeBundle,
    auditBundle,
    compileInput,
  };
}

function mapAgentProfile(task: AgentOsTaskSpec, agent: AgentOsAgentProfile): A2AAgentProfile {
  return {
    agent_id: agent.agentId,
    display_name: agent.displayName,
    vendor_surface: agent.vendorSurface,
    connector_id: agent.connectorId,
    runtime_kind: agent.runtimeKind,
    capabilities: agent.capabilities.map((capability) => ({
      capability_id: capability.capabilityId,
      kind: capability.kind,
      label: capability.label,
      metadata: capability.metadata,
    })),
    tools: agent.tools.map((tool) => ({
      tool_name: tool.toolName,
      modes: tool.modes,
      metadata: tool.metadata,
    })),
    supported_task_intents: agent.supportedTaskIntents.length > 0
      ? agent.supportedTaskIntents as TaskIntent[]
      : [task.intent as TaskIntent],
    permissions: {
      default_file_effect: agent.permissions.defaultFileEffect,
      path_rules: agent.permissions.pathRules.map((rule) => ({
        glob: rule.glob,
        effect: rule.effect,
        reason: rule.reason,
        requires_approval: rule.requiresApproval,
      })),
      tool_rules: agent.permissions.toolRules.map((rule) => ({
        tool_name: rule.toolName,
        effect: rule.effect,
        modes: rule.modes,
        reason: rule.reason,
        requires_approval: rule.requiresApproval,
      })),
      allow_network: agent.permissions.allowNetwork,
      allow_shell: agent.permissions.allowShell,
      allow_git_write: agent.permissions.allowGitWrite,
      allow_pr_creation: agent.permissions.allowPrCreation,
      allow_secrets_access: agent.permissions.allowSecretsAccess,
      max_parallel_subagents: agent.permissions.maxParallelSubagents,
      write_lock_required: agent.permissions.writeLockRequired,
    },
    approval_policy: {
      mode: agent.approvalPolicy.mode,
      required_rules: agent.approvalPolicy.requiredRules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        when: rule.when,
        required: rule.required,
        path_globs: rule.pathGlobs,
        capability_ids: rule.capabilityIds,
        detail: rule.detail,
      })),
      allow_auto_approval_for_low_risk: agent.approvalPolicy.allowAutoApprovalForLowRisk,
      escalation_target: agent.approvalPolicy.escalationTarget,
    },
    memory_scope: mapAgentMemoryScope(agent.memoryScope),
    cwd_policy: {
      mode: agent.cwdPolicy.mode,
      allowed_roots: agent.cwdPolicy.allowedRoots,
      preferred_root: agent.cwdPolicy.preferredRoot,
    },
    health: {
      status: agent.health.status,
      checked_at: agent.health.checkedAt,
      message: agent.health.message,
      details: agent.health.details,
    },
    last_seen_at: agent.lastSeenAt,
  };
}

function mapAgentMemoryScope(scope: AgentOsMemoryScope): A2AAgentProfile['memory_scope'] {
  if (scope === 'none' || scope === 'space' || scope === 'repo' || scope === 'user' || scope === 'org') {
    return scope;
  }
  return 'space';
}

function mapMemoryReferenceScope(scope: AgentOsMemoryScope | MemoryReferenceScope): MemoryReferenceScope {
  if (scope === 'space' || scope === 'repo' || scope === 'user' || scope === 'org') {
    return scope;
  }
  return 'repo';
}

function mapMemorySnapshot(memory: AgentOsInstructionMemory): MemorySnapshot {
  return {
    memory_id: memory.memoryId,
    scope: mapMemoryReferenceScope(memory.scope),
    title: memory.title,
    body: memory.body,
    evidence_task_id: memory.evidenceTaskId,
    evidence_artifact_id: memory.evidenceArtifactId,
  };
}

function mapSpacePolicy(
  policy: AgentOsInstructionSpacePolicy | undefined,
  task: AgentOsTaskSpec,
): SpacePolicy {
  return {
    policy_id: policy?.policyId ?? `${task.spaceId}:default`,
    name: policy?.name ?? 'Workspace policy',
    forbidden_paths: policy?.forbiddenPaths ?? task.forbiddenPaths,
    forbidden_actions: policy?.forbiddenActions ?? [],
  };
}

function mapContextPack(
  contextPack: AgentOsContextPackInput | undefined,
  taskId: string,
): GitNexusInstructionContext | undefined {
  if (!contextPack?.impactReport) {
    return undefined;
  }

  const risks = contextPack.impactReport.changedFileRisks ?? [];
  const relatedTests = contextPack.impactReport.relatedTests ?? [];

  return {
    taskId: contextPack.taskId ?? taskId,
    impactedPackages: contextPack.impactReport.impactedPackages ?? [],
    relatedTests: relatedTests.flatMap((test) => test.commands?.length ? test.commands : [test.pathGlob ?? test.reason ?? 'related test']),
    riskSummary: risks.length > 0
      ? risks.map((risk) => `${risk.risk}:${risk.path} (${risk.reason})`).join('; ')
      : undefined,
  };
}

function mapPALPlan(
  palPlan: AgentOsPALPlanInput | undefined,
  taskId: string,
): PALInstructionContext | undefined {
  if (!palPlan) {
    return undefined;
  }

  return {
    taskId: palPlan.taskId ?? taskId,
    primaryRuntime: palPlan.primaryRuntime,
    reviewerRuntime: palPlan.reviewerRuntime,
    skills: palPlan.skills ?? [],
    mcpTools: palPlan.mcpTools ?? [],
    risk: palPlan.risk ?? 'unknown',
  };
}

function mapToAgentOsInstructionBundle(input: {
  auditBundle: A2AInstructionBundle;
  task: AgentOsTaskSpec;
  agent: AgentOsAgentProfile;
  bundleId?: string;
}): AgentOsInstructionBundle {
  const bundleId = input.bundleId ?? createBundleId(input.task.taskId, input.agent.agentId, input.auditBundle);

  return {
    bundleId,
    taskId: input.task.taskId,
    agentId: input.agent.agentId,
    runtime: input.agent.vendorSurface,
    sharedGoal: input.auditBundle.shared_goal,
    renderedPrompt: input.auditBundle.agent_specific_prompt,
    acceptanceCriteria: input.auditBundle.acceptance_criteria,
    verificationCommands: input.auditBundle.verification_commands,
    forbiddenActions: input.auditBundle.forbidden_actions,
    approvalGateIds: input.auditBundle.approval_gates.map((gate) => gate.approval_id),
    memoryRefIds: input.auditBundle.memory_used.map((memory) => memory.memory_id),
    sourceRefs: input.auditBundle.system_context_refs.map(mapInstructionSourceRef),
    compilerVersion: input.auditBundle.provenance.compiler_version,
    compiledAt: input.auditBundle.provenance.compiled_at,
  };
}

function mapInstructionSourceRef(ref: A2AInstructionBundle['system_context_refs'][number]): AgentOsInstructionSourceRef {
  const path = ref.path ?? ref.ref_id;
  return {
    path,
    sha256: ref.sha ?? sha256Hex(ref.excerpt ?? path),
    kind: mapInstructionSourceKind(ref.kind),
  };
}

function mapInstructionSourceKind(kind: InstructionSourceKind): AgentOsInstructionSourceRef['kind'] {
  if (kind === 'agents_md' || kind === 'claude_md' || kind === 'memory') {
    return kind;
  }
  if (kind === 'codex_override') {
    return 'codex';
  }
  if (kind === 'repo_policy' || kind === 'space_policy') {
    return 'policy';
  }
  return 'custom';
}

function createBundleId(taskId: string, agentId: string, bundle: A2AInstructionBundle): string {
  const fingerprint = sha256Hex([
    taskId,
    agentId,
    bundle.shared_goal,
    bundle.agent_specific_prompt,
    bundle.provenance.compiler_version,
    bundle.provenance.compiled_at,
  ].join('\n')).slice(0, 16);

  return `ib_${fingerprint}`;
}
