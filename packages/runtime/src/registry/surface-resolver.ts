import type { AgentProfile, AgentSurface, TaskSpec } from '@recoder/agent-os';
import type { RuntimeDriver } from '../contracts/runtime-driver';
import { runtimeError } from '../errors/runtime-error';
import type { DriverRegistry } from './driver-registry';

type SurfaceKey = AgentSurface | 'browser_agent';

export type SurfaceResolveInput = {
  /** Explicit surface request (e.g. from API route or test). */
  surface?: SurfaceKey | string;
  task?: TaskSpec;
  profile?: AgentProfile;
};

/**
 * Resolve a requested `AgentSurface` (from explicit request, `AgentProfile.vendorSurface`,
 * or `TaskSpec.metadata.surface`) to a concrete driver via the registry.
 *
 * Fails loudly with `capability_mismatch` when no driver serves the surface — never
 * silently falls back to a different surface.
 */
export function resolveSurface(registry: DriverRegistry, input: SurfaceResolveInput): RuntimeDriver {
  const surface = pickSurface(input);
  if (!surface) {
    throw runtimeError('capability_mismatch', 'No agent surface could be resolved for this task.');
  }
  const candidates = registry.forSurface(surface as SurfaceKey);
  const driver = candidates[0];
  if (!driver) {
    throw runtimeError('capability_mismatch', `No driver is registered for surface "${surface}".`, {
      details: { surface },
    });
  }
  return driver;
}

export function pickSurface(input: SurfaceResolveInput): string | undefined {
  if (input.surface) return String(input.surface);
  if (input.profile?.vendorSurface) return input.profile.vendorSurface;
  const metaSurface = input.task?.metadata?.['surface'];
  return typeof metaSurface === 'string' ? metaSurface : undefined;
}
