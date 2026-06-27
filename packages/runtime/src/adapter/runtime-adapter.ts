import type { AgentCapability, RuntimeHealth } from '@recoder/agent-os';
import type {
  AgentRuntimeAdapter,
  RuntimeHandle,
  RuntimeStartInput,
  RuntimeTaskInput,
} from '@recoder/agent-runtimes';
import type { RuntimeDriver, ApprovalDecision } from '../contracts/runtime-driver';
import type { RuntimeConfig } from '../types/runtime-config';
import { DEFAULT_RUNTIME_CONFIG } from '../config/defaults';
import { CancellationRegistry } from '../engine/cancellation';
import { resolveAdapterOptions, runtimeIdOf } from './adapter-options';
import { aggregateHealth } from './health-aggregator';
import { resolveCapabilities } from './capability-resolver';
import { sendTask } from './send-task';

export type CreateRuntimeAdapterOptions = {
  id?: string;
  config?: RuntimeConfig;
  /** Shared cancellation registry (the Runtime passes one in so cancel() routes correctly). */
  cancellation?: CancellationRegistry;
  resolveCwd?: (input: RuntimeTaskInput) => string;
};

/**
 * `createRuntimeAdapter(driver)` returns an `AgentRuntimeAdapter` over the engine, so all
 * existing `@recoder/agent-runtimes` / `agent-os` `RuntimeAdapterPort` consumers work
 * unchanged. This is the drop-in replacement for the empty generic-adapter shells.
 */
export function createRuntimeAdapter(
  driver: RuntimeDriver,
  options: CreateRuntimeAdapterOptions = {},
): AgentRuntimeAdapter {
  const opts = resolveAdapterOptions(driver, { id: options.id, config: options.config ?? DEFAULT_RUNTIME_CONFIG });
  const runtimeId = runtimeIdOf(opts);
  const cancellation = options.cancellation ?? new CancellationRegistry();

  return {
    id: opts.id,
    kind: opts.kind,

    async health(): Promise<RuntimeHealth> {
      const probe = await driver.probe({ surface: opts.kind });
      return aggregateHealth(probe);
    },

    async capabilities(): Promise<AgentCapability[]> {
      const probe = await driver.probe({ surface: opts.kind });
      return resolveCapabilities(driver, probe);
    },

    async start(input: RuntimeStartInput): Promise<RuntimeHandle> {
      if (driver.start) {
        // The driver's start requires a full DriverContext; the foundation exposes the
        // lightweight handle path and defers context-bound start to the engine's run.
        return defaultHandle(opts.id, input);
      }
      return defaultHandle(opts.id, input);
    },

    sendTask(input: RuntimeTaskInput) {
      return sendTask(input, {
        driver,
        adapterId: opts.id,
        runtimeId,
        surface: opts.kind,
        config: opts.config,
        cancellation,
        resolveCwd: options.resolveCwd,
      });
    },

    async cancel(runId: string): Promise<void> {
      cancellation.abort(runId);
      await driver.cancel?.(runId);
    },

    async approve(approvalId: string, decision: ApprovalDecision): Promise<void> {
      await driver.approve?.(approvalId, decision);
    },
  };
}

function defaultHandle(id: string, input: RuntimeStartInput): RuntimeHandle {
  return {
    runtimeId: `${id}:${input.workspaceId}`,
    startedAt: new Date().toISOString(),
    metadata: input.metadata,
  };
}
