/**
 * SubstrateRegistry — pluggable registry of ConductorSubstrate impls.
 *
 * Promoted from the module-level `Map` + register/get/list functions in
 * docker-backend/src/conductor/substrate.ts, hardened into an instance (not a
 * process global) so the engine, tests, and the backend can each own their
 * wiring. `get` throws a typed SubstrateNotRegisteredError (was a bare Error).
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { ConductorSubstrate } from '../contract/index.js';
import { SubstrateNotRegisteredError } from '../errors/index.js';

export class SubstrateRegistry {
  readonly #substrates = new Map<WorkspaceSubstrate, ConductorSubstrate>();

  /** Register (or replace) a substrate by its id. */
  register(substrate: ConductorSubstrate): void {
    this.#substrates.set(substrate.id, substrate);
  }

  /** Whether a substrate is registered for the id. */
  has(id: WorkspaceSubstrate): boolean {
    return this.#substrates.has(id);
  }

  /** Resolve a registered substrate, or throw truthfully if not wired. */
  get(id: WorkspaceSubstrate): ConductorSubstrate {
    const substrate = this.#substrates.get(id);
    if (!substrate) {
      throw new SubstrateNotRegisteredError(id, this.list());
    }
    return substrate;
  }

  /** Resolve a registered substrate, or undefined (non-throwing). */
  tryGet(id: WorkspaceSubstrate): ConductorSubstrate | undefined {
    return this.#substrates.get(id);
  }

  /** Ids of all registered substrates. */
  list(): WorkspaceSubstrate[] {
    return [...this.#substrates.keys()];
  }
}
