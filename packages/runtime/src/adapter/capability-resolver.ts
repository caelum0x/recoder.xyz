import type { AgentCapability } from '@recoder/agent-os';
import type { DriverProbe, RuntimeDriver } from '../contracts/runtime-driver';

/**
 * Resolve the adapter's advertised `AgentCapability[]` from the driver descriptor,
 * refined by the runtime probe. When the driver is unavailable, capabilities are reported
 * as an empty list (truthful: an offline driver has no usable capabilities).
 */
export function resolveCapabilities(driver: RuntimeDriver, probe?: DriverProbe): AgentCapability[] {
  if (probe && !probe.available) {
    return [];
  }
  return [...driver.descriptor.capabilities];
}
