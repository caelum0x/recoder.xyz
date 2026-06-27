import type { RuntimeHealth } from '@recoder/agent-os';
import type { DriverProbe } from '../../contracts/runtime-driver';
import { canResolveModel, type ToolLoopModelOptions } from './tool-loop-models';

/**
 * Truthful health/presence probe for the in-process driver. Unlike CLI drivers there is no
 * binary to locate; availability is gated on whether a model factory (gateway/provider) is
 * configured. When none is configured the driver reports `available: false` with a clear
 * reason — it never green-washes a run it cannot perform.
 */
export function probeToolLoopHealth(options: ToolLoopModelOptions): DriverProbe {
  const checkedAt = new Date().toISOString();
  const available = canResolveModel(options);

  const health: RuntimeHealth = available
    ? {
        status: 'healthy',
        checkedAt,
        message: 'In-process ToolLoopAgent ready (model factory configured).',
      }
    : {
        status: 'offline',
        checkedAt,
        message: 'No model factory configured for the in-process driver.',
      };

  return available
    ? { health, available: true }
    : {
        health,
        available: false,
        unavailableReason:
          'No model factory configured. Inject `modelFactory` (real gateway in production, ' +
          'mock model in tests) to enable the in-process driver.',
      };
}
