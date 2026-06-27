import type { AgentCapability } from '@recoder/agent-os';

/**
 * Static capabilities for the `claude_code` surface. The capability-resolver refines these at
 * runtime against a CLI feature probe; this is the declared baseline.
 */
export const CLAUDE_CODE_CAPABILITIES: readonly AgentCapability[] = [
  {
    capabilityId: 'claude_code.implementation',
    kind: 'implementation',
    label: 'Claude Code — code implementation',
  },
  {
    capabilityId: 'claude_code.review',
    kind: 'review',
    label: 'Claude Code — code review',
  },
  {
    capabilityId: 'claude_code.verification',
    kind: 'verification',
    label: 'Claude Code — runs verification commands via Bash',
  },
  {
    capabilityId: 'claude_code.planning',
    kind: 'planning',
    label: 'Claude Code — plan mode',
  },
] as const;
