/**
 * createSubstrateRegistry — the composition root for the registry (design §4.9).
 *
 * Builds a fresh SubstrateRegistry and registers every substrate the caller
 * supplies. This stage moves the FOUNDATION; the concrete local (tmux_worktree)
 * and remote (daytona) substrate impls land in a later move (see substrate.md
 * §12 steps 3–4). Until then the caller passes the substrates it has wired —
 * the factory NEVER invents a stub substrate, so an unregistered substrate id
 * fails truthfully via SubstrateNotRegisteredError.
 */
import type { ConductorSubstrate } from '../contract/index.js';
import { SubstrateRegistry } from '../registry/index.js';

export interface CreateSubstrateRegistryInput {
  /** Substrate implementations to register (e.g. tmux_worktree, daytona). */
  substrates?: readonly ConductorSubstrate[];
}

export function createSubstrateRegistry(
  input: CreateSubstrateRegistryInput = {},
): SubstrateRegistry {
  const registry = new SubstrateRegistry();
  for (const substrate of input.substrates ?? []) {
    registry.register(substrate);
  }
  return registry;
}
