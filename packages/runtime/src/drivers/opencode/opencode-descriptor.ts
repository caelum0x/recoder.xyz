import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { OPENCODE_CAPABILITIES } from './opencode-capabilities';

/** The user's `opencode` CLI binary name. */
export const OPENCODE_BINARY = 'opencode';

/**
 * DriverDescriptor for the opencode driver. opencode's non-interactive headless run uses
 * `opencode run --format json`, a line-delimited JSON event stream → `json` is the default
 * (only) headless mode this driver supports.
 */
export const OPENCODE_DESCRIPTOR: DriverDescriptor = {
  id: 'opencode',
  kind: 'opencode',
  surfaces: ['opencode'],
  modes: ['json'],
  capabilities: OPENCODE_CAPABILITIES,
  cli: {
    binary: OPENCODE_BINARY,
    versionArg: '--version',
    binName: 'opencode',
  },
  inProcess: false,
  label: 'opencode (oh-my-openagent fusion)',
};
