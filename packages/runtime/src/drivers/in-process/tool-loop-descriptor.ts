import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { TOOL_LOOP_CAPABILITIES } from './tool-loop-capabilities';

/**
 * Descriptor for the in-process ToolLoopAgent driver. It runs in-process (no child
 * process) and serves the `recoder_code` surface as a first-party default, alongside
 * `custom`. Its only headless mode is `in_process`.
 */
export const inProcessDriverDescriptor: DriverDescriptor = {
  id: 'in-process',
  kind: 'recoder_code',
  surfaces: ['recoder_code', 'custom'],
  modes: ['in_process'],
  capabilities: TOOL_LOOP_CAPABILITIES,
  inProcess: true,
  label: 'In-process ToolLoopAgent (Vercel AI)',
};
