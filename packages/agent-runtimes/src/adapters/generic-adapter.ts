import type {
  AgentCapability,
  AgentSurface,
  RunEvent,
  RunEventType,
  RuntimeHealth,
  TaskRunState,
} from '@recoder/agent-os';
import type { AgentRuntimeAdapter, RuntimeHandle, RuntimeStartInput, RuntimeTaskInput } from '../index';
import { runtimeEvent } from '../runtime-events';
import { RuntimeAdapterError, type RuntimeErrorCode } from '../runtime-errors';

export type RuntimeExecutionUpdate = {
  type: RunEventType;
  taskId?: string;
  runId?: string;
  agentId?: string;
  state?: TaskRunState;
  message?: string;
  artifactId?: string;
  data?: Record<string, unknown>;
  now?: string;
  errorCode?: RuntimeErrorCode;
  retryable?: boolean;
};

export type RuntimeExecutionOutput = RunEvent | RuntimeExecutionUpdate;

export type RuntimeExecutionDriver = {
  start?(input: RuntimeStartInput): Promise<RuntimeHandle> | RuntimeHandle;
  run?(
    input: RuntimeTaskInput,
    context: RuntimeExecutionContext,
  ): AsyncIterable<RuntimeExecutionOutput> | Promise<AsyncIterable<RuntimeExecutionOutput>>;
  cancel?(runId: string): Promise<void> | void;
};

export type RuntimeExecutionContext = {
  runtimeId: string;
  adapterId: string;
  kind: AgentSurface | 'browser_agent';
  signal: AbortSignal;
  emit(input: RuntimeExecutionUpdate): RunEvent;
};

export type GenericRuntimeAdapterOptions = {
  id: string;
  kind: AgentSurface | 'browser_agent';
  capabilities?: AgentCapability[];
  health?: RuntimeHealth;
  driver?: RuntimeExecutionDriver;
};

export type RuntimeAdapterFactoryOptions = Omit<GenericRuntimeAdapterOptions, 'id' | 'kind'> & {
  id?: string;
};

export type RuntimeAdapterFactoryInput = string | RuntimeAdapterFactoryOptions;

export function resolveGenericRuntimeAdapterOptions(
  kind: AgentSurface | 'browser_agent',
  defaultId: string,
  input?: RuntimeAdapterFactoryInput,
): GenericRuntimeAdapterOptions {
  const options = typeof input === 'string' ? { id: input } : input ?? {};
  const { id = defaultId, ...rest } = options;

  return {
    ...rest,
    id,
    kind,
  };
}

export function createGenericRuntimeAdapter(options: GenericRuntimeAdapterOptions): AgentRuntimeAdapter {
  const controllers = new Map<string, AbortController>();
  const runtimeId = `${options.kind}:${options.id}`;

  function createContext(input: RuntimeTaskInput, controller: AbortController, runId: string): RuntimeExecutionContext {
    return {
      runtimeId,
      adapterId: options.id,
      kind: options.kind,
      signal: controller.signal,
      emit(eventInput) {
        return createRunEventFromUpdate(input, eventInput, runId);
      },
    };
  }

  return {
    id: options.id,
    kind: options.kind,
    async health() {
      return options.health ?? {
        status: 'unknown',
        checkedAt: new Date().toISOString(),
        message: 'Adapter boundary is configured but no runtime bridge is attached.',
      };
    },
    async capabilities() {
      return options.capabilities ?? [];
    },
    async start(input: RuntimeStartInput): Promise<RuntimeHandle> {
      if (options.driver?.start) {
        return options.driver.start(input);
      }
      return {
        runtimeId: `${options.id}:${input.workspaceId}`,
        startedAt: new Date().toISOString(),
        metadata: input.metadata,
      };
    },
    async *sendTask(input: RuntimeTaskInput) {
      const controller = new AbortController();
      const runId = input.bundle.bundleId || `${options.id}:${input.task.taskId}`;
      controllers.set(runId, controller);
      controllers.set(input.task.taskId, controller);
      const context = createContext(input, controller, runId);
      yield runtimeEvent({
        type: 'started',
        taskId: input.task.taskId,
        agentId: input.bundle.agentId,
        state: 'running',
        runId,
        message: `Task accepted by ${options.kind} adapter boundary.`,
        data: {
          runtimeId,
          bundleId: input.bundle.bundleId,
          verificationCommands: input.bundle.verificationCommands,
          acceptanceCriteria: input.bundle.acceptanceCriteria,
        },
      });
      if (controller.signal.aborted) {
        yield createCancelledEvent(input, runId, 'Runtime task was cancelled before execution.');
        deleteControllerAliases(controllers, runId, input.task.taskId);
        return;
      }
      try {
        if (!options.driver?.run) {
          throw new RuntimeAdapterError(
            'runtime_unavailable',
            `No runtime execution driver is attached for ${options.kind}; refusing to mark task complete.`,
            {
              details: {
                runtimeId,
                adapterId: options.id,
              },
            },
          );
        }

        const events = await options.driver.run(input, context);
        for await (const output of events) {
          if (controller.signal.aborted) {
            yield createCancelledEvent(input, runId, 'Runtime task was cancelled.');
            return;
          }

          const event = normalizeRuntimeOutput(input, output, runId);
          yield event;

          if (isTerminalRunEvent(event)) {
            return;
          }

          if (controller.signal.aborted) {
            yield createCancelledEvent(input, runId, 'Runtime task was cancelled.');
            return;
          }
        }

        if (controller.signal.aborted) {
          yield createCancelledEvent(input, runId, 'Runtime task was cancelled.');
          return;
        }

        yield runtimeEvent({
          type: 'completed',
          taskId: input.task.taskId,
          agentId: input.bundle.agentId,
          state: 'completed',
          runId,
          message: `Task completed by ${options.kind} execution driver.`,
        });
      } catch (error) {
        const adapterError = error instanceof RuntimeAdapterError
          ? error
          : new RuntimeAdapterError('unknown', error instanceof Error ? error.message : String(error));
        const errorData: Record<string, unknown> = {
          code: adapterError.code,
          retryable: adapterError.retryable,
        };
        if (adapterError.details) {
          errorData.details = adapterError.details;
        }
        yield runtimeEvent({
          type: 'failed',
          taskId: input.task.taskId,
          agentId: input.bundle.agentId,
          state: adapterError.code === 'cancelled' ? 'cancelled' : 'failed',
          runId,
          message: adapterError.message,
          data: errorData,
        });
      } finally {
        deleteControllerAliases(controllers, runId, input.task.taskId);
      }
    },
    async cancel(runId: string) {
      controllers.get(runId)?.abort();
      await options.driver?.cancel?.(runId);
    },
  };
}

function normalizeRuntimeOutput(input: RuntimeTaskInput, output: RuntimeExecutionOutput, runId: string): RunEvent {
  if (isRunEvent(output)) {
    return {
      ...output,
      taskId: output.taskId || input.task.taskId,
      agentId: output.agentId ?? input.bundle.agentId,
      runId: output.runId ?? runId,
    };
  }

  return createRunEventFromUpdate(input, output, runId);
}

function createRunEventFromUpdate(input: RuntimeTaskInput, update: RuntimeExecutionUpdate, runId: string): RunEvent {
  const { data: updateData, errorCode, retryable, ...eventInput } = update;
  const data = { ...(updateData ?? {}) };

  if (errorCode) {
    data.code = errorCode;
  }
  if (retryable !== undefined) {
    data.retryable = retryable;
  }

  const eventBase = {
    ...eventInput,
    taskId: eventInput.taskId ?? input.task.taskId,
    agentId: eventInput.agentId ?? input.bundle.agentId,
    runId: eventInput.runId ?? runId,
  };

  if (Object.keys(data).length === 0) {
    return runtimeEvent(eventBase);
  }

  return runtimeEvent({
    ...eventBase,
    data,
  });
}

function createCancelledEvent(input: RuntimeTaskInput, runId: string, message: string): RunEvent {
  return runtimeEvent({
    type: 'failed',
    taskId: input.task.taskId,
    agentId: input.bundle.agentId,
    state: 'cancelled',
    runId,
    message,
    data: {
      code: 'cancelled',
      retryable: false,
    },
  });
}

function isRunEvent(output: RuntimeExecutionOutput): output is RunEvent {
  return typeof output === 'object'
    && output !== null
    && 'eventId' in output
    && 'createdAt' in output;
}

function isTerminalRunEvent(event: RunEvent): boolean {
  return event.type === 'completed' || event.type === 'failed';
}

function deleteControllerAliases(controllers: Map<string, AbortController>, runId: string, taskId: string): void {
  controllers.delete(runId);
  if (taskId !== runId) {
    controllers.delete(taskId);
  }
}
