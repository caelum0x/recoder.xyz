/**
 * extraArgs — safe append of verbatim extra CLI args.
 *
 * Promoted verbatim from the inline `tail()` in runtime-commands.ts. Callers pass
 * already-shell-safe args; this only joins them onto the command line.
 */
import type { RuntimeCommandOptions } from '../types/command.js';

export function extraArgs(opts: RuntimeCommandOptions): string {
  return opts.extraArgs?.length ? ` ${opts.extraArgs.join(' ')}` : '';
}
