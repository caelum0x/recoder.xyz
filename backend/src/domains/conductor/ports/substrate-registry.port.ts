/**
 * SubstrateRegistryPort — the conductor's narrow view of the substrate registry.
 *
 * REUSE: this is the SAME contract the `@recoder/substrate` `WorkspaceEngine`
 * codes to. The conductor domain re-exports it verbatim so the composer, the
 * adapters (`substrate-tmux` / `daytona` / `in-process` / `ssh`), and the engine
 * all name ONE port. The concrete package `SubstrateRegistry` satisfies it
 * structurally; the existing backend `getSubstrate`/`listSubstrates` registry
 * satisfies it too — no rewrite.
 *
 * The engine only needs: resolve a substrate by id, list registered ids (to
 * validate a requested substrate before launch), and call `launch` + the
 * optional `exitCode` probe. Capture/alive/diff/teardown are driven by the
 * run-tailer and review modules through the full `ConductorSubstrate` contract.
 */
export type {
  SubstrateRegistryPort,
  EngineSubstrate,
} from '@recoder/substrate';

// The full contract + availability shapes the adapters implement and the
// composer surfaces truthfully (GET /substrates). Re-exported for one import.
export type {
  ConductorSubstrate,
  SubstrateLaunchInput,
  SubstrateHandle,
  SubstrateAvailability,
  SubstrateCapabilities,
} from '@recoder/substrate';
