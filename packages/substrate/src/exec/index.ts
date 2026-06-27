/**
 * exec/ barrel — low-level process execution primitives shared across substrates.
 */
export { execFileSafe } from './exec-file.js';
export { which } from './which.js';
export { commandExists } from './command-exists.js';
export { ExecError, toExecError } from './exec-error.js';
export type { ExecResult, ExecOptions } from './exec-result.js';
