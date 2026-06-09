/**
 * Canonical agent identity and capability contract for Recoder Agent OS.
 */

import type { TaskIntent } from './task-intent';
import type {
  AgentPermissionPolicy,
  ApprovalPolicy,
  CwdPolicy,
  RuntimeHealth,
} from './policy';

export type AgentVendorSurface =
  | 'recoder_code'
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'qwen_code'
  | 'gemini_cli'
  | 'browser'
  | 'custom';

export const AgentVendorSurfaceEnum = {
  RecoderCode: 'recoder_code' as const satisfies AgentVendorSurface,
  ClaudeCode: 'claude_code' as const satisfies AgentVendorSurface,
  Codex: 'codex' as const satisfies AgentVendorSurface,
  OpenCode: 'opencode' as const satisfies AgentVendorSurface,
  QwenCode: 'qwen_code' as const satisfies AgentVendorSurface,
  GeminiCli: 'gemini_cli' as const satisfies AgentVendorSurface,
  Browser: 'browser' as const satisfies AgentVendorSurface,
  Custom: 'custom' as const satisfies AgentVendorSurface,
} as const;

export const AGENT_VENDOR_SURFACES: readonly AgentVendorSurface[] = [
  AgentVendorSurfaceEnum.RecoderCode,
  AgentVendorSurfaceEnum.ClaudeCode,
  AgentVendorSurfaceEnum.Codex,
  AgentVendorSurfaceEnum.OpenCode,
  AgentVendorSurfaceEnum.QwenCode,
  AgentVendorSurfaceEnum.GeminiCli,
  AgentVendorSurfaceEnum.Browser,
  AgentVendorSurfaceEnum.Custom,
] as const;

export type AgentRuntimeKind = 'local' | 'sandbox' | 'hosted' | 'browser' | 'external';

export const AgentRuntimeKindEnum = {
  Local: 'local' as const satisfies AgentRuntimeKind,
  Sandbox: 'sandbox' as const satisfies AgentRuntimeKind,
  Hosted: 'hosted' as const satisfies AgentRuntimeKind,
  Browser: 'browser' as const satisfies AgentRuntimeKind,
  External: 'external' as const satisfies AgentRuntimeKind,
} as const;

export const AGENT_RUNTIME_KINDS: readonly AgentRuntimeKind[] = [
  AgentRuntimeKindEnum.Local,
  AgentRuntimeKindEnum.Sandbox,
  AgentRuntimeKindEnum.Hosted,
  AgentRuntimeKindEnum.Browser,
  AgentRuntimeKindEnum.External,
] as const;

export type AgentCapabilityKind =
  | 'planning'
  | 'implementation'
  | 'review'
  | 'verification'
  | 'deployment'
  | 'browser'
  | 'memory'
  | 'orchestration'
  | 'custom';

export const AgentCapabilityKindEnum = {
  Planning: 'planning' as const satisfies AgentCapabilityKind,
  Implementation: 'implementation' as const satisfies AgentCapabilityKind,
  Review: 'review' as const satisfies AgentCapabilityKind,
  Verification: 'verification' as const satisfies AgentCapabilityKind,
  Deployment: 'deployment' as const satisfies AgentCapabilityKind,
  Browser: 'browser' as const satisfies AgentCapabilityKind,
  Memory: 'memory' as const satisfies AgentCapabilityKind,
  Orchestration: 'orchestration' as const satisfies AgentCapabilityKind,
  Custom: 'custom' as const satisfies AgentCapabilityKind,
} as const;

export const AGENT_CAPABILITY_KINDS: readonly AgentCapabilityKind[] = [
  AgentCapabilityKindEnum.Planning,
  AgentCapabilityKindEnum.Implementation,
  AgentCapabilityKindEnum.Review,
  AgentCapabilityKindEnum.Verification,
  AgentCapabilityKindEnum.Deployment,
  AgentCapabilityKindEnum.Browser,
  AgentCapabilityKindEnum.Memory,
  AgentCapabilityKindEnum.Orchestration,
  AgentCapabilityKindEnum.Custom,
] as const;

export type ToolCapabilityMode = 'read' | 'write' | 'execute' | 'network' | 'custom';

export const ToolCapabilityModeEnum = {
  Read: 'read' as const satisfies ToolCapabilityMode,
  Write: 'write' as const satisfies ToolCapabilityMode,
  Execute: 'execute' as const satisfies ToolCapabilityMode,
  Network: 'network' as const satisfies ToolCapabilityMode,
  Custom: 'custom' as const satisfies ToolCapabilityMode,
} as const;

export const TOOL_CAPABILITY_MODES: readonly ToolCapabilityMode[] = [
  ToolCapabilityModeEnum.Read,
  ToolCapabilityModeEnum.Write,
  ToolCapabilityModeEnum.Execute,
  ToolCapabilityModeEnum.Network,
  ToolCapabilityModeEnum.Custom,
] as const;

export type MemoryScope = 'none' | 'space' | 'repo' | 'user' | 'org';

export const MemoryScopeEnum = {
  None: 'none' as const satisfies MemoryScope,
  Space: 'space' as const satisfies MemoryScope,
  Repo: 'repo' as const satisfies MemoryScope,
  User: 'user' as const satisfies MemoryScope,
  Org: 'org' as const satisfies MemoryScope,
} as const;

export const MEMORY_SCOPES: readonly MemoryScope[] = [
  MemoryScopeEnum.None,
  MemoryScopeEnum.Space,
  MemoryScopeEnum.Repo,
  MemoryScopeEnum.User,
  MemoryScopeEnum.Org,
] as const;

export interface AgentCapability {
  capability_id: string;
  label: string;
  kind: AgentCapabilityKind;
  description?: string;
  risky?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolCapability {
  tool_name: string;
  display_name?: string;
  description?: string;
  modes: ToolCapabilityMode[];
  metadata?: Record<string, unknown>;
}

export interface AgentProfile {
  agent_id: string;
  display_name: string;
  vendor_surface: AgentVendorSurface;
  connector_id: string;
  runtime_kind: AgentRuntimeKind;
  capabilities: AgentCapability[];
  tools: ToolCapability[];
  supported_task_intents: TaskIntent[];
  permissions: AgentPermissionPolicy;
  approval_policy: ApprovalPolicy;
  memory_scope: MemoryScope;
  cwd_policy: CwdPolicy;
  health: RuntimeHealth;
  last_seen_at: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAgentProfileInput extends Omit<AgentProfile, 'last_seen_at'> {
  last_seen_at?: string;
}

export function createAgentProfile(input: CreateAgentProfileInput): AgentProfile {
  return {
    ...input,
    last_seen_at: input.last_seen_at ?? new Date().toISOString(),
  };
}
