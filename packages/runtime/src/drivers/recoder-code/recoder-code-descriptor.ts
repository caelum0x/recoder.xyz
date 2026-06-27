import type { AgentCapability } from '@recoder/agent-os';
import type { DriverDescriptor } from '../../registry/driver-descriptor';

const RECODER_CODE_CAPABILITIES: readonly AgentCapability[] = [
  { capabilityId: 'recoder_code.implementation', kind: 'implementation', label: 'Code implementation' },
  { capabilityId: 'recoder_code.verification', kind: 'verification', label: 'Verification & checks' },
  { capabilityId: 'recoder_code.planning', kind: 'planning', label: 'Planning & reasoning' },
];

/**
 * The first-party `recoder_code` surface driver. It delegates to pi or in-process; the modes
 * it advertises are the union the delegates support (`json`/`in_process`).
 */
export const RECODER_CODE_DESCRIPTOR: DriverDescriptor = {
  id: 'recoder-code',
  kind: 'recoder_code',
  surfaces: ['recoder_code'],
  modes: ['json', 'in_process'],
  capabilities: RECODER_CODE_CAPABILITIES,
  label: 'Recoder Code (first-party, delegates to pi/in-process)',
};
