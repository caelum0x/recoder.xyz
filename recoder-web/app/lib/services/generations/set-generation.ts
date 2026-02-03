/**
 * Set Generation
 * Functions for creating and updating generation state
 */

import type {
  CreatedGeneration,
  Generation,
  GenerationContext,
  GenerationContextConfig,
  GenerationId,
  QueuedGeneration,
} from './types';
import { GenerationIdGenerator } from './types';
import { internalSetGeneration } from './internal/set-generation';

// =============================================================================
// Set Generation
// =============================================================================

/**
 * Sets/updates a generation in storage
 */
export async function setGeneration(params: {
  context: GenerationContextConfig;
  generation: Generation;
}): Promise<void> {
  await internalSetGeneration({
    storage: params.context.storage,
    generation: params.generation,
    logger: params.context.logger,
  });
}

// =============================================================================
// Create Generation
// =============================================================================

export interface CreateGenerationParams {
  context: GenerationContextConfig;
  generationContext: GenerationContext;
  id?: GenerationId;
}

/**
 * Creates a new generation in 'created' status
 */
export async function createGeneration(params: CreateGenerationParams): Promise<CreatedGeneration> {
  const { context, generationContext, id } = params;

  const generation: CreatedGeneration = {
    id: id ?? GenerationIdGenerator.generate(),
    status: 'created',
    context: generationContext,
    createdAt: Date.now(),
  };

  await internalSetGeneration({
    storage: context.storage,
    generation,
    logger: context.logger,
  });

  context.logger.info(`Created generation ${generation.id}`);

  return generation;
}

// =============================================================================
// Queue Generation
// =============================================================================

/**
 * Queues an existing generation for processing
 */
export async function queueExistingGeneration(params: {
  context: GenerationContextConfig;
  generation: CreatedGeneration;
}): Promise<QueuedGeneration> {
  const { context, generation } = params;

  const queuedGeneration: QueuedGeneration = {
    ...generation,
    status: 'queued',
    queuedAt: Date.now(),
  };

  await internalSetGeneration({
    storage: context.storage,
    generation: queuedGeneration,
    logger: context.logger,
  });

  context.logger.info(`Queued generation ${generation.id}`);

  return queuedGeneration;
}

// =============================================================================
// Create and Queue Generation
// =============================================================================

/**
 * Creates a new generation and immediately queues it
 */
export async function createAndQueueGeneration(
  params: CreateGenerationParams,
): Promise<QueuedGeneration> {
  const createdGeneration = await createGeneration(params);
  return queueExistingGeneration({
    context: params.context,
    generation: createdGeneration,
  });
}

// =============================================================================
// Batch Create Generations
// =============================================================================

/**
 * Creates multiple generations at once
 */
export async function batchCreateGenerations(params: {
  context: GenerationContextConfig;
  generationContexts: GenerationContext[];
}): Promise<CreatedGeneration[]> {
  const { context, generationContexts } = params;

  const generations: CreatedGeneration[] = [];

  for (const generationContext of generationContexts) {
    const generation = await createGeneration({
      context,
      generationContext,
    });
    generations.push(generation);
  }

  return generations;
}

// =============================================================================
// Update Generation Metadata
// =============================================================================

/**
 * Updates a generation with new context or metadata
 * Note: This should only be used for non-status changes
 */
export async function updateGenerationContext(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  updates: Partial<Pick<Generation, 'context'>>;
}): Promise<Generation> {
  const { context, generationId, updates } = params;

  const { getGeneration } = await import('./storage');
  const existing = await getGeneration({
    storage: context.storage,
    generationId,
  });

  if (!existing) {
    throw new Error(`Generation ${generationId} not found`);
  }

  const updated: Generation = {
    ...existing,
    ...updates,
  };

  await internalSetGeneration({
    storage: context.storage,
    generation: updated,
    logger: context.logger,
  });

  return updated;
}
