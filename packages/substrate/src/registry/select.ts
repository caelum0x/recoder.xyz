/**
 * selectSubstrate — resolve the substrate for a workspace by its `substrate` id.
 *
 * The single place orchestration code maps `Workspace.substrate` to an impl, so
 * nothing else in the engine/run-tailer/review is substrate-aware (design §1).
 */
import type { ConductorSubstrate } from '../contract/index.js';
import type { SubstrateRegistry } from './registry.js';

/** Minimal shape needed to select a substrate (a subset of Workspace). */
export interface SubstrateSelectable {
  substrate: ConductorSubstrate['id'];
}

export function selectSubstrate(
  registry: SubstrateRegistry,
  workspace: SubstrateSelectable,
): ConductorSubstrate {
  return registry.get(workspace.substrate);
}
