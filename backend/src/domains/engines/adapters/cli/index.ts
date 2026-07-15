/**
 * Barrel for the CLI-binary engine adapters (beads / tmux / dmux / recodergit).
 * Each is a bounded, degrade-safe `EngineClientPort` over a real CLI/engine; the
 * composer imports the classes, the shared `runCli` primitive, and the beads MCP
 * binder factory from here.
 */
export { runCli, parseCliJson } from './cli-exec.js';
export type { CliResult, RunCliOptions } from './cli-exec.js';

export { BeadsAdapter, beadsEngineBinder } from './beads.adapter.js';
export type { BeadsOp, BeadsAdapterDeps } from './beads.adapter.js';

export { TmuxAdapter } from './tmux.adapter.js';
export type { TmuxOp, TmuxAdapterDeps } from './tmux.adapter.js';

export { DmuxAdapter } from './dmux.adapter.js';
export type { DmuxOp, DmuxAdapterDeps } from './dmux.adapter.js';

export { RecodergitAdapter } from './recodergit.adapter.js';
export type { RecodergitOp, RecodergitAdapterDeps } from './recodergit.adapter.js';
