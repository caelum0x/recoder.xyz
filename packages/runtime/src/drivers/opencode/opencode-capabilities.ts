import type { AgentCapability } from '@recoder/agent-os';

/**
 * Static capabilities advertised by the opencode surface. Refined at runtime by the
 * adapter's capability-resolver via a CLI presence probe; these are the declared defaults.
 */
export const OPENCODE_CAPABILITIES: readonly AgentCapability[] = [
  {
    capabilityId: 'opencode.implementation',
    kind: 'implementation',
    label: 'Code implementation via opencode',
  },
  {
    capabilityId: 'opencode.review',
    kind: 'review',
    label: 'Code review via opencode',
  },
  {
    capabilityId: 'opencode.verification',
    kind: 'verification',
    label: 'Run verification commands via opencode',
  },
] as const;
