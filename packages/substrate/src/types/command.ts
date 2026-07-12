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
  /**
   * Run the agent's INTERACTIVE TUI (the real Claude Code / Codex / opencode
   * experience the terminal-first center shows) instead of the headless one-shot
   * `-p`/`--print` run. The session stays live and the operator drives it in the
   * terminal. Falls back to the headless command when a runtime has no
   * interactive variant (degrade-safe).
   */
  interactive?: boolean;
}

export interface RuntimeSpec {
  /** Executable name (resolved on PATH). */
  bin: string;
  /** Build the headless (one-shot, exits) command line for the runtime. */
  build(opts: RuntimeCommandOptions): string;
  /**
   * Build the INTERACTIVE (persistent TUI) command line, when the runtime
   * supports one. When absent, `resolveRuntimeCommand` uses `build` even for an
   * interactive request.
   */
  buildInteractive?(opts: RuntimeCommandOptions): string;
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
