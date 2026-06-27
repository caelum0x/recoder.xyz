/**
 * Static capability declarations for the codex surface. Refined at runtime by the
 * engine's capability-resolver against an actual CLI feature probe; this is the floor.
 */
import type { AgentCapability } from '@recoder/agent-os';

export const CODEX_CAPABILITIES: readonly AgentCapability[] = [
  {
    capabilityId: 'codex.implementation',
    kind: 'implementation',
    label: 'Code implementation via OpenAI Codex',
  },
  {
    capabilityId: 'codex.verification',
    kind: 'verification',
    label: 'Run verification commands headlessly',
  },
  {
    capabilityId: 'codex.review',
    kind: 'review',
    label: 'Code review and diff analysis',
  },
] as const;
