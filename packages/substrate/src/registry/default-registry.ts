/**
 * defaultRegistry — a process-wide default SubstrateRegistry instance.
 *
 * Convenience for the backend, which wires substrates once at boot. Tests and
 * the engine should prefer their own `new SubstrateRegistry()` for isolation.
 */
import { SubstrateRegistry } from './registry.js';

export const defaultRegistry = new SubstrateRegistry();
