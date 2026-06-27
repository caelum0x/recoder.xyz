import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { CLAUDE_CODE_CAPABILITIES } from './claude-capabilities';

/** Default `claude` binary name; overridable via RuntimeConfig.cliPaths. */
export const CLAUDE_CODE_BINARY = 'claude';

/**
 * The DriverDescriptor wiring all of the claude-code pieces together. `json` is the default
 * (and only) headless mode: the CLI's `--output-format stream-json` JSONL channel.
 */
export const CLAUDE_CODE_DESCRIPTOR: DriverDescriptor = {
  id: 'claude-code',
  kind: 'claude_code',
  surfaces: ['claude_code'],
  modes: ['json'],
  capabilities: CLAUDE_CODE_CAPABILITIES,
  cli: {
    binary: CLAUDE_CODE_BINARY,
    versionArg: '--version',
    binName: 'claude',
  },
  label: 'Claude Code',
};
