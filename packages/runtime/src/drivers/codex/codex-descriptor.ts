/**
 * DriverDescriptor wiring for the codex driver: surface, headless modes, CLI binary,
 * and declared capabilities. The registry resolves a `codex` surface to this descriptor.
 */
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { CODEX_CAPABILITIES } from './codex-capabilities';

export const CODEX_BINARY = 'codex';

export const codexDescriptor: DriverDescriptor = {
  id: 'codex',
  kind: 'codex',
  surfaces: ['codex'],
  // codex exec --json is the structured headless mode; print is the text fallback.
  modes: ['json', 'print'],
  capabilities: CODEX_CAPABILITIES,
  cli: {
    binary: CODEX_BINARY,
    versionArg: '--version',
    binName: CODEX_BINARY,
  },
  inProcess: false,
  label: 'OpenAI Codex CLI',
};
