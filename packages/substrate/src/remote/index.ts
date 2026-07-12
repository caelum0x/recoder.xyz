/**
 * remote/ barrel — substrates that run off-machine.
 *
 *   - `daytona` — a remote Daytona sandbox (injected DaytonaClientPort).
 *   - `ssh`     — a remote git worktree + tmux on an SSH host over the durable
 *                 SSH transport (injected SshExecPort).
 *
 * The local (tmux_worktree) substrate lives under its own module; this directory
 * holds the remote execution paths only.
 */
export { createDaytonaSubstrate } from './daytona-substrate.js';
export type { CreateDaytonaSubstrateDeps } from './daytona-substrate.js';
export { createSshSubstrate } from './ssh-substrate.js';
export type { CreateSshSubstrateDeps, SshSubstrateConfig } from './ssh-substrate.js';
export { readSshConfig, createSshSubstrateFromEnv } from './ssh-config.js';
export type { SshEnv, SshSubstrateFromEnvDeps } from './ssh-config.js';
