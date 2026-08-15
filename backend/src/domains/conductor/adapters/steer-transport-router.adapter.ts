/** Route live steering to the transport owned by the workspace's substrate. */
import type { SubstrateKind } from '../types.js';
import type {
  SteerKeysInput,
  SteerTransportPort,
} from '../ports/steer-transport.port.js';

export interface CreateSteerTransportRouterDeps {
  readonly transports: Partial<Record<SubstrateKind, SteerTransportPort>>;
}

export function createSteerTransportRouter(
  deps: CreateSteerTransportRouterDeps
): SteerTransportPort {
  return {
    async sendKeys(input: SteerKeysInput): Promise<void> {
      const transport = deps.transports[input.substrate];
      if (!transport) {
        throw new Error(
          `live steering is unsupported for substrate ${input.substrate}`
        );
      }
      await transport.sendKeys(input);
    },
  };
}
