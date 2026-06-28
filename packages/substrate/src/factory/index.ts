/**
 * factory/ barrel — the composition root (wires ports → registry).
 *
 * This stage ships the foundation composition root: a `SubstratePorts` bundle,
 * real host-backed `clock`/`id` defaults, and `createSubstrateRegistry`. The
 * full `createEngine(deps)` lands with the engine module (substrate.md §12
 * step 4); it is intentionally NOT stubbed here.
 */
export type { SubstratePorts } from './ports.js';
export {
  resolvePorts,
  type SubstratePortsInput,
} from './resolve-ports.js';
export { systemClock } from './system-clock.js';
export { uuidId } from './uuid-id.js';
export {
  createSubstrateRegistry,
  type CreateSubstrateRegistryInput,
} from './create-substrate-registry.js';
