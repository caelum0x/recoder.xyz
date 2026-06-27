import type { AgentCapability } from '@recoder/agent-os';
import type { RuntimeDriver } from '../../contracts/runtime-driver';
import type { DriverContext } from '../../contracts/driver-context';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import {
  GenericProcessDriver,
  createGenericProcessDriver,
  type GenericProcessDriverOptions,
} from './generic-process-driver';

export {
  GenericProcessDriver,
  createGenericProcessDriver,
  type GenericProcessDriverOptions,
  type GenericArgsBuilder,
} from './generic-process-driver';

const IMPLEMENTATION_CAPS: readonly AgentCapability[] = [
  { capabilityId: 'generic.implementation', kind: 'implementation', label: 'Code implementation' },
];

/** `gemini` CLI headless. Generic process driver over a print/prompt invocation. */
export const GEMINI_CLI_DESCRIPTOR: DriverDescriptor = {
  id: 'gemini-cli',
  kind: 'gemini_cli',
  surfaces: ['gemini_cli'],
  modes: ['print'],
  capabilities: IMPLEMENTATION_CAPS,
  cli: { binary: 'gemini', versionArg: '--version', binName: 'gemini' },
  label: 'Gemini CLI (generic)',
};

/** `qwen-code` CLI headless. Generic process driver over a print/prompt invocation. */
export const QWEN_CODE_DESCRIPTOR: DriverDescriptor = {
  id: 'qwen-code',
  kind: 'qwen_code',
  surfaces: ['qwen_code'],
  modes: ['print'],
  capabilities: IMPLEMENTATION_CAPS,
  cli: { binary: 'qwen-code', versionArg: '--version', binName: 'qwen-code' },
  label: 'Qwen Code CLI (generic)',
};

/**
 * Agent Client Protocol generic driver (Zed/Codex ACP). Presents the `custom` surface since
 * `AgentSurface` has no dedicated `acp` value. This is a thin process driver over the ACP
 * binary; full newline-framed JSON-RPC session handling is a later refinement layered on the
 * generic stdout stream.
 */
export const ACP_DESCRIPTOR: DriverDescriptor = {
  id: 'acp',
  kind: 'custom',
  surfaces: ['custom'],
  modes: ['acp'],
  capabilities: IMPLEMENTATION_CAPS,
  cli: { binary: 'acp', versionArg: '--version', binName: 'acp' },
  label: 'ACP transport (generic)',
};

function printPromptArgs(input: { prompt: string; ctx: DriverContext }): readonly string[] {
  // Most "code CLI" tools accept a single prompt argument in headless print mode.
  return ['-p', input.prompt];
}

export function createGeminiCliDriver(
  options: { cliPathOverride?: string } = {},
): RuntimeDriver {
  return createGenericProcessDriver({
    descriptor: GEMINI_CLI_DESCRIPTOR,
    buildArgs: printPromptArgs,
    cliPathOverride: options.cliPathOverride,
  });
}

export function createQwenCodeDriver(
  options: { cliPathOverride?: string } = {},
): RuntimeDriver {
  return createGenericProcessDriver({
    descriptor: QWEN_CODE_DESCRIPTOR,
    buildArgs: printPromptArgs,
    cliPathOverride: options.cliPathOverride,
  });
}

export function createAcpDriver(
  options: { cliPathOverride?: string } = {},
): RuntimeDriver {
  return createGenericProcessDriver({
    descriptor: ACP_DESCRIPTOR,
    // ACP feeds the prompt over stdin (JSON-RPC session/prompt); a richer ACP session layer
    // can replace this with framed JSON-RPC. The generic path keeps it spawnable today.
    buildArgs: () => [],
    promptViaStdin: true,
    cliPathOverride: options.cliPathOverride,
  });
}
