import type {
  AgentProfile,
  ApprovalGate,
  InstructionBundle,
  MemoryRef,
  MemoryReferenceScope,
  TaskIntent,
} from '@recoder/a2a-sdk';
import {
  ApprovalGateStatusEnum,
  ApprovalRequirementAtEnum,
  createInstructionBundle,
} from '@recoder/a2a-sdk';

import { renderClaudeInstructionBundle } from './claude-renderer';
import { renderCodexInstructionBundle } from './codex-renderer';
import {
  loadBeadsInstructionSource,
  loadContext7InstructionSource,
  loadGitNexusInstructionSource,
  loadPALInstructionSource,
  loadPolicyInstructionSource,
  type BeadsInstructionContext,
  type Context7InstructionContext,
  type GitNexusInstructionContext,
  type PALInstructionContext,
  type PolicyInstructionContext,
} from './loaders';
import { buildInstructionProvenance, type LoadedInstructionSource } from './provenance';
import { renderRecoderCodeInstructionBundle } from './recoder-code-renderer';
import { loadInstructionSources } from './source-loader';

export interface RecoderTaskSpec {
  title: string;
  intent: TaskIntent;
  goal: string;
  repo?: string;
  space_id?: string;
  branch_policy?: string;
  target_paths?: string[];
  forbidden_paths?: string[];
  acceptance?: string[];
  verify?: string[];
  approval_required?: string[];
  artifact_required?: string[];
  handoff?: {
    reviewer?: string;
    final_owner?: string;
  };
}

export interface RepoContextManifest {
  repo_root: string;
  repo_name?: string;
  current_branch?: string;
  default_branch?: string;
}

export interface SpacePolicy {
  policy_id?: string;
  name?: string;
  forbidden_paths?: string[];
  forbidden_actions?: string[];
}

export interface MemorySnapshot {
  memory_id: string;
  scope: MemoryReferenceScope;
  title: string;
  body: string;
  evidence_task_id?: string;
  evidence_artifact_id?: string;
}

export interface PathInstructionRule {
  glob: string;
  instruction: string;
  priority?: number;
}

export interface FailurePattern {
  pattern_id: string;
  summary: string;
  guidance: string;
}

export interface VerificationPlan {
  commands: string[];
  browser_checks?: string[];
}

export interface InstructionCompileInput {
  task: RecoderTaskSpec;
  agent: AgentProfile;
  repoContext: RepoContextManifest;
  spacePolicy: SpacePolicy;
  memory: MemorySnapshot[];
  pathRules: PathInstructionRule[];
  recentFailures: FailurePattern[];
  verification: VerificationPlan;
  compilerVersion?: string;
  beads?: BeadsInstructionContext;
  gitNexus?: GitNexusInstructionContext;
  pal?: PALInstructionContext;
  context7?: Context7InstructionContext[];
  policy?: PolicyInstructionContext;
  extraSources?: LoadedInstructionSource[];
}

export interface LoadedCompileContext {
  sources: LoadedInstructionSource[];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function deriveAcceptanceCriteria(input: InstructionCompileInput): string[] {
  return uniqueStrings(input.task.acceptance ?? [input.task.goal]);
}

function deriveVerificationCommands(input: InstructionCompileInput): string[] {
  const commands = [
    ...(input.task.verify ?? []),
    ...input.verification.commands,
    ...(input.verification.browser_checks ?? []).map((check) => `browser_verify: ${check}`),
  ];
  return uniqueStrings(commands);
}

function deriveForbiddenActions(input: InstructionCompileInput): string[] {
  const pathWarnings = [
    ...(input.task.forbidden_paths ?? []).map((glob) => `Do not modify ${glob}`),
    ...(input.spacePolicy.forbidden_paths ?? []).map((glob) => `Space policy forbids ${glob}`),
  ];

  return uniqueStrings([
    ...pathWarnings,
    ...(input.spacePolicy.forbidden_actions ?? []),
  ]);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function deriveApprovalGates(input: InstructionCompileInput): ApprovalGate[] {
  const requirements = uniqueStrings([
    ...(input.task.approval_required ?? []),
    ...input.agent.approval_policy.required_rules
      .filter((rule) => rule.required)
      .map((rule) => rule.label),
  ]);

  return requirements.map((requirement, index) => ({
    approval_id: `approval-${index + 1}-${slugify(requirement)}`,
    title: requirement,
    status: ApprovalGateStatusEnum.Pending,
    required_at: input.agent.approval_policy.required_rules[index]?.when ?? ApprovalRequirementAtEnum.BeforeSensitiveAction,
    reason: requirement,
  }));
}

function deriveMemoryRefs(memory: MemorySnapshot[]): MemoryRef[] {
  return memory.map((item) => ({
    memory_id: item.memory_id,
    scope: item.scope,
    title: item.title,
    evidence_task_id: item.evidence_task_id,
    evidence_artifact_id: item.evidence_artifact_id,
  }));
}

function loadAdditionalSources(input: InstructionCompileInput): LoadedInstructionSource[] {
  return [
    input.beads ? loadBeadsInstructionSource(input.beads) : undefined,
    input.gitNexus ? loadGitNexusInstructionSource(input.gitNexus) : undefined,
    input.pal ? loadPALInstructionSource(input.pal) : undefined,
    input.policy ? loadPolicyInstructionSource(input.policy) : undefined,
    ...(input.context7 ?? []).map(loadContext7InstructionSource),
    ...(input.extraSources ?? []),
  ].filter((source): source is LoadedInstructionSource => source !== undefined);
}

export function compileInstructionBundle(input: InstructionCompileInput): InstructionBundle {
  const sources = [
    ...loadInstructionSources({
      repoRoot: input.repoContext.repo_root,
      vendorSurface: input.agent.vendor_surface,
    }),
    ...loadAdditionalSources(input),
  ];
  const context: LoadedCompileContext = { sources };

  const acceptanceCriteria = deriveAcceptanceCriteria(input);
  const verificationCommands = deriveVerificationCommands(input);
  const forbiddenActions = deriveForbiddenActions(input);
  const approvalGates = deriveApprovalGates(input);
  const memoryUsed = deriveMemoryRefs(input.memory);

  const baseRenderInput = {
    compileInput: input,
    context,
    acceptanceCriteria,
    verificationCommands,
    forbiddenActions,
    approvalGates,
    memoryUsed,
  };

  const rendered =
    input.agent.vendor_surface === 'claude_code'
      ? renderClaudeInstructionBundle(baseRenderInput)
      : input.agent.vendor_surface === 'codex'
        ? renderCodexInstructionBundle(baseRenderInput)
        : renderRecoderCodeInstructionBundle(baseRenderInput);

  return createInstructionBundle({
    ...rendered,
    provenance: buildInstructionProvenance({
      sources,
      compilerVersion: input.compilerVersion ?? '0.1.0',
    }),
  });
}
