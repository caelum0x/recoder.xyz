/**
 * Generation Manager
 * Utilities for managing generation lifecycle
 */

import type {
  Generation,
  GenerationId,
  CreatedGeneration,
  QueuedGeneration,
  RunningGeneration,
  CompletedGeneration,
  FailedGeneration,
  CancelledGeneration,
  TaskExecutionContext,
  GenerationContext,
} from './types';
import { GenerationIdUtils } from './types';
import { generationPath } from './paths';

/**
 * Create a new generation
 */
export async function createGeneration(args: {
  context: TaskExecutionContext;
  generationContext: GenerationContext;
}): Promise<CreatedGeneration> {
  const generation: CreatedGeneration = {
    id: GenerationIdUtils.generate(),
    status: 'created',
    createdAt: Date.now(),
    context: args.generationContext,
  };

  await args.context.storage.setJson({
    path: generationPath(generation.id),
    data: generation,
  });

  return generation;
}

/**
 * Get a generation by ID
 */
export async function getGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
}): Promise<Generation | null> {
  try {
    return await args.context.storage.getJson<Generation>({
      path: generationPath(args.generationId),
    });
  } catch {
    return null;
  }
}

/**
 * Set/update a generation
 */
export async function setGeneration(args: {
  context: TaskExecutionContext;
  generation: Generation;
}): Promise<void> {
  await args.context.storage.setJson({
    path: generationPath(args.generation.id),
    data: args.generation,
  });
}

/**
 * Transition a generation to queued status
 */
export async function queueGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
}): Promise<QueuedGeneration> {
  const current = await getGeneration(args);

  if (!current) {
    throw new Error(`Generation ${args.generationId} not found`);
  }

  if (current.status !== 'created') {
    throw new Error(
      `Cannot queue generation ${args.generationId}: current status is ${current.status}`
    );
  }

  const queued: QueuedGeneration = {
    ...current,
    status: 'queued',
    queuedAt: Date.now(),
  };

  await setGeneration({ context: args.context, generation: queued });
  return queued;
}

/**
 * Transition a generation to running status
 */
export async function startGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
}): Promise<RunningGeneration> {
  const current = await getGeneration(args);

  if (!current) {
    throw new Error(`Generation ${args.generationId} not found`);
  }

  if (current.status !== 'queued') {
    throw new Error(
      `Cannot start generation ${args.generationId}: current status is ${current.status}`
    );
  }

  const running: RunningGeneration = {
    ...current,
    status: 'running',
    queuedAt: (current as QueuedGeneration).queuedAt,
    startedAt: Date.now(),
  };

  await setGeneration({ context: args.context, generation: running });
  return running;
}

/**
 * Complete a generation with a result
 */
export async function completeGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
  result: unknown;
}): Promise<CompletedGeneration> {
  const current = await getGeneration(args);

  if (!current) {
    throw new Error(`Generation ${args.generationId} not found`);
  }

  if (current.status !== 'running') {
    throw new Error(
      `Cannot complete generation ${args.generationId}: current status is ${current.status}`
    );
  }

  const runningGen = current as RunningGeneration;

  const completed: CompletedGeneration = {
    ...runningGen,
    status: 'completed',
    completedAt: Date.now(),
    result: args.result,
  };

  await setGeneration({ context: args.context, generation: completed });
  return completed;
}

/**
 * Fail a generation with an error
 */
export async function failGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
  error: string;
}): Promise<FailedGeneration> {
  const current = await getGeneration(args);

  if (!current) {
    throw new Error(`Generation ${args.generationId} not found`);
  }

  // Can fail from any non-terminal state
  if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
    throw new Error(
      `Cannot fail generation ${args.generationId}: current status is ${current.status}`
    );
  }

  const failed: FailedGeneration = {
    ...current,
    status: 'failed',
    queuedAt: (current as QueuedGeneration).queuedAt,
    startedAt: (current as RunningGeneration).startedAt,
    failedAt: Date.now(),
    error: args.error,
  };

  await setGeneration({ context: args.context, generation: failed });
  return failed;
}

/**
 * Cancel a generation
 */
export async function cancelGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
}): Promise<CancelledGeneration> {
  const current = await getGeneration(args);

  if (!current) {
    throw new Error(`Generation ${args.generationId} not found`);
  }

  // Can cancel from any non-terminal state
  if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
    throw new Error(
      `Cannot cancel generation ${args.generationId}: current status is ${current.status}`
    );
  }

  const cancelled: CancelledGeneration = {
    ...current,
    status: 'cancelled',
    cancelledAt: Date.now(),
  };

  await setGeneration({ context: args.context, generation: cancelled });
  return cancelled;
}

/**
 * Delete a generation
 */
export async function deleteGeneration(args: {
  context: TaskExecutionContext;
  generationId: GenerationId;
}): Promise<void> {
  await args.context.storage.deleteJson({
    path: generationPath(args.generationId),
  });
}
