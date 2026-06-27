/**
 * ConductorRuntimeId type guards — promoted from runtime-commands.ts.
 */
import type { AgentSurface } from '@recoder/agent-os';
import { CONDUCTOR_RUNTIME_IDS, type ConductorRuntimeId } from '../types/runtime-id.js';

export function isConductorRuntimeId(value: string): value is ConductorRuntimeId {
  return (CONDUCTOR_RUNTIME_IDS as readonly string[]).includes(value);
}

/** Narrow a generic AgentSurface to a ConductorRuntimeId, or null. */
export function asConductorRuntime(surface: AgentSurface): ConductorRuntimeId | null {
  return isConductorRuntimeId(surface) ? surface : null;
}
