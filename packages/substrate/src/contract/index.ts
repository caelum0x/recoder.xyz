/**
 * contract/ barrel — the seam everyone codes to.
 *
 * The ConductorSubstrate interface and its data shapes. This is the only thing
 * the engine, registry, routes, run-tailer, review, and reconcile depend on.
 */
export type { ConductorSubstrate } from './substrate.js';
export type { SubstrateLaunchInput } from './launch-input.js';
export type { SubstrateHandle } from './handle.js';
export type { SubstrateDiff } from './diff.js';
export type { SubstrateAvailability } from './availability.js';
export type { SubstrateCapabilities } from './capabilities.js';
export type {
  SubstrateLifecycleEvent,
  SubstrateProvisionedEvent,
  SubstrateLaunchedEvent,
  SubstrateCapturedEvent,
  SubstrateFinishedEvent,
  SubstrateTornDownEvent,
} from './lifecycle.js';
