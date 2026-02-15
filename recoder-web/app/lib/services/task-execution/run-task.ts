/**
 * Run Task
 * Core task execution logic with sequence and step management
 */

import type {
  TaskId,
  TaskExecutionContext,
  Sequence,
  Generation,
  GenerationId,
  QueuedGeneration,
  OnGenerationComplete,
  OnGenerationError,
  isCompletedGeneration,
  isFailedGeneration,
} from './types';
import { getTask } from './get-task';
import { createPatchQueue } from './patch-queue';
import { executeTask } from './shared/task-execution-utils';
import { generationPath } from './paths';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RunTask');

/**
 * Wait for a generation to finish execution
 */
async function waitUntilGenerationFinishes(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
}): Promise<Generation> {
  while (true) {
    const generation = await args.context.storage.getJson<Generation>({
      path: generationPath(args.generationId),
    });

    if (!generation) {
      throw new Error(`Generation(id: ${args.generationId}) is not found`);
    }

    if (
      generation.status === 'completed' ||
      generation.status === 'failed' ||
      generation.status === 'cancelled'
    ) {
      return generation;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export interface RunTaskCallbacks {
  sequenceStart?: (args: { sequence: Sequence }) => void | Promise<void>;
  sequenceFail?: (args: { sequence: Sequence }) => void | Promise<void>;
  sequenceComplete?: (args: { sequence: Sequence }) => void | Promise<void>;
  sequenceSkip?: (args: { sequence: Sequence }) => void | Promise<void>;
}

export interface RunTaskInputs {
  taskId: TaskId;
  callbacks?: RunTaskCallbacks;
}

/**
 * Execute a single step (generation)
 */
async function executeStep(args: {
  context: TaskExecutionContext;
  generation: QueuedGeneration;
  callbacks?: {
    onCompleted?: () => void | Promise<void>;
    onFailed?: (generation: Generation) => void | Promise<void>;
    onGenerationComplete?: OnGenerationComplete;
    onGenerationError?: OnGenerationError;
  };
}): Promise<void> {
  try {
    const operationType = args.generation.context.operationNode?.content?.type;

    // Execute based on operation type
    switch (operationType) {
      case 'textGeneration':
      case 'contentGeneration': {
        // Mark as running
        const runningGeneration = {
          ...args.generation,
          status: 'running' as const,
          startedAt: Date.now(),
        };

        await args.context.storage.setJson({
          path: generationPath(args.generation.id),
          data: runningGeneration,
        });

        // Simulate or execute actual generation
        // In a real implementation, this would call the LLM or other service
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Mark as completed
        const completedGeneration = {
          ...runningGeneration,
          status: 'completed' as const,
          completedAt: Date.now(),
          result: { text: 'Generated content' },
        };

        await args.context.storage.setJson({
          path: generationPath(args.generation.id),
          data: completedGeneration,
        });

        await args.callbacks?.onGenerationComplete?.(completedGeneration as any);
        await args.callbacks?.onCompleted?.();
        break;
      }

      case 'action': {
        // Execute action
        const runningGeneration = {
          ...args.generation,
          status: 'running' as const,
          startedAt: Date.now(),
        };

        await args.context.storage.setJson({
          path: generationPath(args.generation.id),
          data: runningGeneration,
        });

        // Simulate action execution
        await new Promise((resolve) => setTimeout(resolve, 50));

        const completedGeneration = {
          ...runningGeneration,
          status: 'completed' as const,
          completedAt: Date.now(),
          result: { success: true },
        };

        await args.context.storage.setJson({
          path: generationPath(args.generation.id),
          data: completedGeneration,
        });

        await args.callbacks?.onCompleted?.();
        break;
      }

      default: {
        // Generic step execution
        const runningGeneration = {
          ...args.generation,
          status: 'running' as const,
          startedAt: Date.now(),
        };

        await args.context.storage.setJson({
          path: generationPath(args.generation.id),
          data: runningGeneration,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        const completedGeneration = {
          ...runningGeneration,
          status: 'completed' as const,
          completedAt: Date.now(),
          result: null,
        };

        await args.context.storage.setJson({
          path: generationPath(args.generation.id),
          data: completedGeneration,
        });

        await args.callbacks?.onCompleted?.();
        break;
      }
    }
  } catch (error) {
    logger.error('Step execution error:', error);

    // Mark as failed
    const failedGeneration = {
      ...args.generation,
      status: 'failed' as const,
      failedAt: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    await args.context.storage.setJson({
      path: generationPath(args.generation.id),
      data: failedGeneration,
    });

    await args.callbacks?.onGenerationError?.(failedGeneration as any);
    await args.callbacks?.onFailed?.(failedGeneration);
  }
}

/**
 * Run a task that is ready for execution
 * Executes all sequences and steps in order
 */
export async function runTask(
  args: RunTaskInputs & {
    context: TaskExecutionContext;
    onGenerationComplete?: OnGenerationComplete;
    onGenerationError?: OnGenerationError;
  }
): Promise<void> {
  const task = await getTask(args);

  // Create patch queue for this task execution
  const patchQueue = createPatchQueue(args.context);
  const applyPatches = patchQueue.createApplyPatches();

  let executionError: Error | null = null;

  try {
    await executeTask({
      task,
      applyPatches,
      startGeneration: async (generationId, callbacks) => {
        // Get the generation
        let generation: Generation;
        try {
          generation = await args.context.storage.getJson<Generation>({
            path: generationPath(generationId),
          });
        } catch {
          args.context.logger.warn(`Generation ${generationId} not found, skipping`);
          return;
        }

        if (!generation || generation.status !== 'created') {
          return;
        }

        const queuedGeneration: QueuedGeneration = {
          ...generation,
          status: 'queued',
          queuedAt: Date.now(),
        };

        await args.context.storage.setJson({
          path: generationPath(generationId),
          data: queuedGeneration,
        });

        await executeStep({
          context: args.context,
          generation: queuedGeneration,
          callbacks: {
            ...callbacks,
            onGenerationComplete: args.onGenerationComplete,
            onGenerationError: args.onGenerationError,
          },
        });
      },
      onSequenceStart: async (sequence) => {
        args.context.logger.debug(`Starting sequence ${sequence.id}`);
        await args.callbacks?.sequenceStart?.({ sequence });
      },
      onSequenceError: async (sequence) => {
        args.context.logger.error(`Sequence ${sequence.id} failed`);
        await args.callbacks?.sequenceFail?.({ sequence });
      },
      onSequenceComplete: async (sequence) => {
        args.context.logger.debug(`Sequence ${sequence.id} completed`);
        await args.callbacks?.sequenceComplete?.({ sequence });
      },
      onSequenceSkip: async (sequence) => {
        args.context.logger.debug(`Skipping sequence ${sequence.id}`);
        await args.callbacks?.sequenceSkip?.({ sequence });
      },
      onTaskComplete: async () => {
        await patchQueue.flush();
      },
    });
  } catch (error) {
    executionError = error as Error;
  }

  patchQueue.cleanup();

  if (executionError !== null) {
    logger.error('Execution failed:', executionError);
    throw executionError;
  }
}
