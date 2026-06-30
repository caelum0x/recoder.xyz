/**
 * remote/ barrel — substrates that run off-machine in a remote sandbox.
 *
 * Currently the `daytona` substrate (created over an injected DaytonaClientPort).
 * The local (tmux_worktree) substrate lives under its own module; this directory
 * holds the remote execution path only.
 */
export { createDaytonaSubstrate } from './daytona-substrate.js';
export type { CreateDaytonaSubstrateDeps } from './daytona-substrate.js';
