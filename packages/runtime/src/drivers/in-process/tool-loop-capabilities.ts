import type { AgentCapability } from '@recoder/agent-os';

/**
 * Static capabilities for the in-process ToolLoopAgent surface. The agent can implement
 * changes (read/write/edit/bash) and run verification commands via its shell tool.
 */
export const TOOL_LOOP_CAPABILITIES: readonly AgentCapability[] = [
  {
    capabilityId: 'in-process.implementation',
    kind: 'implementation',
    label: 'In-process code implementation (read/write/edit/bash)',
  },
  {
    capabilityId: 'in-process.verification',
    kind: 'verification',
    label: 'Run verification commands via the shell tool',
  },
] as const;
