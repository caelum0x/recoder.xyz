/**
 * resolveRuntimeCommand — runtime + prompt → the shell command line to run.
 *
 * Promoted verbatim from docker-backend/src/conductor/runtime-commands.ts, now
 * throwing typed SubstrateErrors instead of bare Errors (design §8).
 */
import type { ResolvedRuntimeCommand, RuntimeCommandOptions } from '../types/command.js';
import { CONDUCTOR_RUNTIME_IDS } from '../types/runtime-id.js';
import { SubstrateError, SubstrateErrorCode } from '../errors/index.js';
import { isConductorRuntimeId } from './is-conductor-runtime.js';
import { RUNTIME_SPECS } from './runtime-specs.js';

export function resolveRuntimeCommand(
  runtimeId: string,
  opts: RuntimeCommandOptions,
): ResolvedRuntimeCommand {
  if (!isConductorRuntimeId(runtimeId)) {
    throw new SubstrateError(
      SubstrateErrorCode.INVALID_INPUT,
      `unsupported conductor runtime: ${runtimeId} (supported: ${CONDUCTOR_RUNTIME_IDS.join(', ')})`,
    );
  }
  if (!opts.prompt || !opts.prompt.trim()) {
    throw new SubstrateError(
      SubstrateErrorCode.INVALID_INPUT,
      'prompt is required to resolve a runtime command',
    );
  }
  const spec = RUNTIME_SPECS[runtimeId];
  // Interactive request → the TUI variant when the runtime has one; otherwise the
  // headless command (degrade-safe).
  const commandLine =
    opts.interactive && spec.buildInteractive ? spec.buildInteractive(opts) : spec.build(opts);
  return { runtimeId, bin: spec.bin, commandLine };
}
