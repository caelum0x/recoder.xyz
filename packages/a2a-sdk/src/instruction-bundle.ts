/**
 * Canonical compiled instruction bundle contract for Agent OS runtimes.
 */

import type { ApprovalGate } from './policy';

export type InstructionSourceKind =
  | 'agents_md'
  | 'claude_md'
  | 'codex_override'
  | 'task_spec'
  | 'space_policy'
  | 'repo_policy'
  | 'memory'
  | 'custom';

export const InstructionSourceKindEnum = {
  AgentsMd: 'agents_md' as const satisfies InstructionSourceKind,
  ClaudeMd: 'claude_md' as const satisfies InstructionSourceKind,
  CodexOverride: 'codex_override' as const satisfies InstructionSourceKind,
  TaskSpec: 'task_spec' as const satisfies InstructionSourceKind,
  SpacePolicy: 'space_policy' as const satisfies InstructionSourceKind,
  RepoPolicy: 'repo_policy' as const satisfies InstructionSourceKind,
  Memory: 'memory' as const satisfies InstructionSourceKind,
  Custom: 'custom' as const satisfies InstructionSourceKind,
} as const;

export const INSTRUCTION_SOURCE_KINDS: readonly InstructionSourceKind[] = [
  InstructionSourceKindEnum.AgentsMd,
  InstructionSourceKindEnum.ClaudeMd,
  InstructionSourceKindEnum.CodexOverride,
  InstructionSourceKindEnum.TaskSpec,
  InstructionSourceKindEnum.SpacePolicy,
  InstructionSourceKindEnum.RepoPolicy,
  InstructionSourceKindEnum.Memory,
  InstructionSourceKindEnum.Custom,
] as const;

export type MemoryReferenceScope = 'space' | 'repo' | 'user' | 'org';

export const MemoryReferenceScopeEnum = {
  Space: 'space' as const satisfies MemoryReferenceScope,
  Repo: 'repo' as const satisfies MemoryReferenceScope,
  User: 'user' as const satisfies MemoryReferenceScope,
  Org: 'org' as const satisfies MemoryReferenceScope,
} as const;

export const MEMORY_REFERENCE_SCOPES: readonly MemoryReferenceScope[] = [
  MemoryReferenceScopeEnum.Space,
  MemoryReferenceScopeEnum.Repo,
  MemoryReferenceScopeEnum.User,
  MemoryReferenceScopeEnum.Org,
] as const;

export interface InstructionSourceRef {
  ref_id: string;
  kind: InstructionSourceKind;
  title?: string;
  path?: string;
  sha?: string;
  excerpt?: string;
}

export interface MemoryRef {
  memory_id: string;
  scope: MemoryReferenceScope;
  title: string;
  evidence_task_id?: string;
  evidence_artifact_id?: string;
}

export interface InstructionProvenanceSourceFile {
  path: string;
  sha: string;
}

export interface InstructionBundleProvenance {
  source_files: InstructionProvenanceSourceFile[];
  compiled_at: string;
  compiler_version: string;
}

export interface InstructionBundle {
  shared_goal: string;
  agent_specific_prompt: string;
  system_context_refs: InstructionSourceRef[];
  acceptance_criteria: string[];
  verification_commands: string[];
  forbidden_actions: string[];
  approval_gates: ApprovalGate[];
  memory_used: MemoryRef[];
  provenance: InstructionBundleProvenance;
  metadata?: Record<string, unknown>;
}

export interface CreateInstructionBundleInput extends Omit<InstructionBundle, 'provenance'> {
  provenance: Omit<InstructionBundleProvenance, 'compiled_at'> & { compiled_at?: string };
}

export function createInstructionBundle(
  input: CreateInstructionBundleInput,
): InstructionBundle {
  return {
    ...input,
    provenance: {
      ...input.provenance,
      compiled_at: input.provenance.compiled_at ?? new Date().toISOString(),
    },
  };
}
