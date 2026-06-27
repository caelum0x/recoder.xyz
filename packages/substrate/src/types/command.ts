/**
 * Command resolution types — promoted from
 * docker-backend/src/conductor/runtime-commands.ts.
 *
 * These describe how a runtime + prompt becomes the exact headless CLI line that
 * the substrate runs inside its isolation.
 */
import type { ConductorRuntimeId } from './runtime-id.js';

export interface RuntimeCommandOptions {
  prompt: string;
  /** Optional model override passed to the CLI. */
  model?: string;
  /** Extra raw CLI args appended verbatim (already shell-safe). */
  extraArgs?: string[];
}

export interface RuntimeSpec {
  /** Executable name (resolved on PATH). */
  bin: string;
  /** Build the full shell command line for the runtime. */
  build(opts: RuntimeCommandOptions): string;
}

export interface ResolvedRuntimeCommand {
  runtimeId: ConductorRuntimeId;
  bin: string;
  commandLine: string;
}

export interface RuntimeAvailability {
  runtimeId: ConductorRuntimeId;
  bin: string;
  available: boolean;
  path?: string;
}
