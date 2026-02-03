/**
 * Cancel Generation
 * Functions for cancelling in-progress generations
 */

import type {
  CancelledGeneration,
  GenerationContextConfig,
  GenerationId,
} from './types';
import { getGeneration } from './storage';
import { internalSetGeneration } from './internal/set-generation';

// =============================================================================
// Cancel Generation
// =============================================================================

/**
 * Cancels a generation that is currently running or queued
 */
export async function cancelGeneration(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
}): Promise<CancelledGeneration> {
  const { context, generationId } = params;

  const generation = await getGeneration({
    storage: context.storage,
    generationId,
  });

  if (generation === undefined) {
    throw new Error(`Generation ${generationId} not found`);
  }

  // Only allow cancellation of queued or running generations
  if (generation.status !== 'queued' && generation.status !== 'running') {
    throw new Error(
      `Cannot cancel generation ${generationId} with status '${generation.status}'. ` +
        `Only 'queued' or 'running' generations can be cancelled.`,
    );
  }

  const cancelledGeneration: CancelledGeneration = {
    ...generation,
    status: 'cancelled',
    cancelledAt: Date.now(),
  };

  await internalSetGeneration({
    storage: context.storage,
    generation: cancelledGeneration,
    logger: context.logger,
  });

  context.logger.info(`Generation ${generationId} cancelled`);

  return cancelledGeneration;
}

// =============================================================================
// Check if Cancellation Requested
// =============================================================================

/**
 * Checks if a cancellation has been requested for a generation
 * This is used by long-running generation processes to check for cancellation
 */
export async function isCancellationRequested(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
}): Promise<boolean> {
  const { context, generationId } = params;

  const generation = await getGeneration({
    storage: context.storage,
    generationId,
  });

  return generation?.status === 'cancelled';
}

// =============================================================================
// Batch Cancel
// =============================================================================

/**
 * Cancels multiple generations at once
 */
export async function cancelGenerations(params: {
  context: GenerationContextConfig;
  generationIds: GenerationId[];
}): Promise<{
  cancelled: CancelledGeneration[];
  errors: Array<{ generationId: GenerationId; error: string }>;
}> {
  const { context, generationIds } = params;

  const cancelled: CancelledGeneration[] = [];
  const errors: Array<{ generationId: GenerationId; error: string }> = [];

  await Promise.all(
    generationIds.map(async (generationId) => {
      try {
        const result = await cancelGeneration({ context, generationId });
        cancelled.push(result);
      } catch (error) {
        errors.push({
          generationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return { cancelled, errors };
}
