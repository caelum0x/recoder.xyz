/**
 * @module patterns/types
 *
 * Shared types for A2A collaboration patterns.
 */

import type { RecoderAgentPlatform } from '@recoder/shared/a2a';

export type PatternType = 'direct-handoff' | 'supervisor' | 'competitive';

export interface AgentRef {
  agent_id: string;
  platform: RecoderAgentPlatform;
  name: string;
}

export interface PatternConfig {
  patternType: PatternType;
  workspaceId: string;
  threadId: string;
  requester: AgentRef;
}

export interface DirectHandoffInput {
  kind: 'direct-handoff';
  prompt: string;
  agentA: AgentRef;
  agentB: AgentRef;
  /** Optional instructions for Agent B after handoff. */
  handoffInstructions?: string;
}

export interface SubtaskDef {
  prompt: string;
  assignee: AgentRef;
}

export interface SupervisorInput {
  kind: 'supervisor';
  prompt: string;
  supervisor: AgentRef;
  subtasks: SubtaskDef[];
}

export interface CompetitiveInput {
  kind: 'competitive';
  prompt: string;
  agents: AgentRef[];
  /** Timeout in ms before picking the first completed result. */
  timeoutMs?: number;
}

export type PatternInput = DirectHandoffInput | SupervisorInput | CompetitiveInput;

export interface PatternResult {
  success: boolean;
  patternType: PatternType;
  taskIds: string[];
  finalResult?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface CollaborationPattern {
  readonly patternType: PatternType;
  execute(config: PatternConfig, input: PatternInput): Promise<PatternResult>;
}
