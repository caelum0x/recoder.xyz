/**
 * command/ barrel — resolve runtime+prompt → the REAL headless CLI line (8 CLIs).
 */
export { RUNTIME_SPECS } from './runtime-specs.js';
export { resolveRuntimeCommand } from './resolve-command.js';
export { runtimeAvailability } from './runtime-availability.js';
export { shellQuote } from './shell-quote.js';
export { modelFlag } from './model-flag.js';
export { extraArgs } from './extra-args.js';
export { isConductorRuntimeId, asConductorRuntime } from './is-conductor-runtime.js';
