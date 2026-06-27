import type { AgentRuntimeAdapter } from '@recoder/agent-runtimes';
import type { AgentSurface, RuntimeHealth } from '@recoder/agent-os';
import type { RuntimeDriver } from '../contracts/runtime-driver';
import type { RuntimeConfig, RuntimeConfigInput } from '../types/runtime-config';
import { loadRuntimeConfig } from '../config/runtime-config';
import { DriverRegistry, createDriverRegistry } from '../registry/driver-registry';
import { registerBuiltinDrivers } from '../registry/builtin-drivers';
import { resolveSurface } from '../registry/surface-resolver';
import { createRuntimeAdapter } from '../adapter/runtime-adapter';
import { CancellationRegistry } from './cancellation';

export interface Runtime {
  /** Build an `AgentRuntimeAdapter` for a surface (resolves the registered driver). */
  adapterFor(surface: AgentSurface | string): AgentRuntimeAdapter;
  readonly registry: DriverRegistry;
  /** Probe health of every registered driver, keyed by driver id. */
  health(): Promise<Record<string, RuntimeHealth>>;
  readonly config: RuntimeConfig;
}

export type CreateRuntimeInput = {
  config?: RuntimeConfigInput;
  /** Drivers to register. Driver agents supply the concrete per-CLI drivers. */
  drivers?: readonly RuntimeDriver[];
};

/**
 * Top-level entry. Builds the registry + shared cancellation registry, then hands out
 * adapters per surface. `createRuntime().adapterFor('codex')` returns an
 * `AgentRuntimeAdapter` the existing control-plane consumers already understand.
 */
export function createRuntime(input: CreateRuntimeInput = {}): Runtime {
  const config = loadRuntimeConfig(input.config ?? {});
  const registry = createDriverRegistry();
  registerBuiltinDrivers(registry, input.drivers ?? []);
  const cancellation = new CancellationRegistry();

  return {
    registry,
    config,

    adapterFor(surface: AgentSurface | string): AgentRuntimeAdapter {
      const driver = resolveSurface(registry, { surface });
      return createRuntimeAdapter(driver, { config, cancellation });
    },

    async health(): Promise<Record<string, RuntimeHealth>> {
      const out: Record<string, RuntimeHealth> = {};
      for (const driver of registry.list()) {
        const probe = await driver.probe({ surface: driver.descriptor.kind });
        out[driver.descriptor.id] = probe.health;
      }
      return out;
    },
  };
}
