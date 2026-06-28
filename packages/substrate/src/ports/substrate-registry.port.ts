/**
 * SubstrateRegistryPort + EngineSubstrate — the engine's narrow view of the
 * substrate registry (design §4.5 / §7).
 *
 * The engine only needs to (a) resolve the substrate for a workspace by id,
 * (b) list registered ids (to validate the requested substrate before launch),
 * and (c) call `launch` + the optional `exitCode` probe. It depends on this
 * narrow port rather than the full `SubstrateRegistry` / `ConductorSubstrate`
 * so the proven backend substrate impls — which implement `launch`/`exitCode`
 * but predate `capabilities()` — can be injected unchanged (the engine never
 * touches capture/alive/diff/teardown/capabilities, which the run-tailer and
 * review modules drive through the full contract).
 *
 * The concrete package `SubstrateRegistry` satisfies this port structurally; the
 * backend may also inject its existing `getSubstrate`/`listSubstrates`-backed
 * registry. Interface only.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { SubstrateLaunchInput } from '../contract/launch-input.js';
import type { SubstrateHandle } from '../contract/handle.js';

/** The slice of a ConductorSubstrate the engine drives (launch + completion probe). */
export interface EngineSubstrate {
  id: WorkspaceSubstrate;
  /** Provision isolation and launch the agent command. */
  launch(input: SubstrateLaunchInput): Promise<SubstrateHandle>;
  /**
   * Exit code of the completed agent (0 = success, >0 = failure). `undefined`
   * while still alive, `null` when the handle is entirely gone. Used by reconcile
   * to distinguish a clean finish from a crash. Optional — a substrate without it
   * is treated as a clean completion.
   */
  exitCode?(handle: SubstrateHandle): Promise<number | null | undefined>;
}

export interface SubstrateRegistryPort {
  /** Resolve the substrate registered for `id`, or throw truthfully if not wired. */
  get(id: WorkspaceSubstrate): EngineSubstrate;
  /** Ids of all registered substrates (engine validates the requested id against this). */
  list(): WorkspaceSubstrate[];
}
