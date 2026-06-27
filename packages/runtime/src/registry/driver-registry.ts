import type { AgentSurface } from '@recoder/agent-os';
import type { RuntimeDriver } from '../contracts/runtime-driver';
import { supportsSurface } from './driver-descriptor';

type SurfaceKey = AgentSurface | 'browser_agent';

/**
 * Register and look up drivers by id and by surface. A registry is mutable at wiring
 * time (drivers registered once at startup) but lookups are read-only.
 */
export class DriverRegistry {
  private readonly byId = new Map<string, RuntimeDriver>();

  register(driver: RuntimeDriver): this {
    if (this.byId.has(driver.descriptor.id)) {
      throw new Error(`Driver "${driver.descriptor.id}" is already registered.`);
    }
    this.byId.set(driver.descriptor.id, driver);
    return this;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  getById(id: string): RuntimeDriver | undefined {
    return this.byId.get(id);
  }

  /** All drivers that can satisfy a surface, in registration order. */
  forSurface(surface: SurfaceKey): RuntimeDriver[] {
    return [...this.byId.values()].filter((driver) => supportsSurface(driver.descriptor, surface));
  }

  list(): RuntimeDriver[] {
    return [...this.byId.values()];
  }
}

export function createDriverRegistry(drivers: readonly RuntimeDriver[] = []): DriverRegistry {
  const registry = new DriverRegistry();
  for (const driver of drivers) registry.register(driver);
  return registry;
}
