/**
 * errors/ barrel — the typed, narrow-able error surface.
 */
export { SubstrateErrorCode } from './codes.js';
export { SubstrateError } from './substrate-error.js';
export type { SubstrateErrorOptions } from './substrate-error.js';
export { SubstrateUnavailableError } from './unavailable-error.js';
export { SubstrateNotRegisteredError } from './not-registered-error.js';
export { ProvisionError } from './provision-error.js';
export { LaunchError } from './launch-error.js';
export { HandleGoneError } from './handle-gone-error.js';
export { DiffError } from './diff-error.js';
export { TeardownError } from './teardown-error.js';
export { isSubstrateError, toErrorPayload } from './is-substrate-error.js';
export type { SubstrateErrorPayload } from './is-substrate-error.js';
