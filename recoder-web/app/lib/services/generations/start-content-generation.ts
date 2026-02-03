/**
 * Start Content Generation
 * Entry point for starting a content generation process
 */

import type {
  Generation,
  GenerationContextConfig,
  GenerationMetadata,
  OnGenerationComplete,
  OnGenerationError,
  QueuedGeneration,
  RunningGeneration,
} from './types';
import { isQueuedGeneration } from './types';
import { generateContent } from './generate-content';
import { internalSetGeneration } from './internal/set-generation';

// =============================================================================
// Types
// =============================================================================

export interface StartContentGenerationParams {
  context: GenerationContextConfig;
  generation: Generation;
  metadata?: GenerationMetadata;
  onComplete?: OnGenerationComplete;
  onError?: OnGenerationError;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Starts a content generation process
 *
 * The generation must be in 'queued' status to be started.
 * This function will:
 * 1. Validate the generation is queued
 * 2. Transition it to 'running' status
 * 3. Execute the generation based on context configuration
 * 4. Return the running generation
 */
export async function startContentGeneration(
  params: StartContentGenerationParams,
): Promise<RunningGeneration> {
  const { context, generation, metadata, onComplete, onError } = params;

  // Validate generation is queued
  if (!isQueuedGeneration(generation)) {
    throw new Error(`Generation ${generation.id} is not queued (status: ${generation.status})`);
  }

  // Transition to running status
  const runningGeneration: RunningGeneration = {
    ...generation,
    status: 'running',
    messages: [],
    startedAt: Date.now(),
  };

  // Persist the running state
  await internalSetGeneration({
    storage: context.storage,
    generation: runningGeneration,
  });

  // Determine how to process the generation
  const processType = context.generateContentProcess?.type ?? 'self';

  switch (processType) {
    case 'self':
      // Process in this context
      if (context.waitUntil) {
        // Non-blocking execution
        context.waitUntil(async () => {
          await generateContent({
            context,
            generation: runningGeneration,
            metadata,
            onComplete,
            onError,
          });
        });
      } else {
        // Blocking execution (fire and forget pattern - don't await)
        generateContent({
          context,
          generation: runningGeneration,
          metadata,
          onComplete,
          onError,
        }).catch((error) => {
          context.logger.error(error, `Generation ${generation.id} failed`);
        });
      }
      break;

    case 'external':
      // Delegate to external process
      if (context.generateContentProcess?.process) {
        await context.generateContentProcess.process({
          context,
          generation: runningGeneration,
          metadata,
        });
      } else {
        throw new Error('External process not configured');
      }
      break;

    default:
      throw new Error(`Unknown process type: ${processType}`);
  }

  return runningGeneration;
}

// =============================================================================
// Queue Generation
// =============================================================================

/**
 * Queues a generation for processing
 * This is a helper to transition from 'created' to 'queued' status
 */
export async function queueGeneration(params: {
  context: GenerationContextConfig;
  generation: Generation;
}): Promise<QueuedGeneration> {
  const { context, generation } = params;

  if (generation.status !== 'created') {
    throw new Error(`Generation ${generation.id} is not in created status`);
  }

  const queuedGeneration: QueuedGeneration = {
    ...generation,
    status: 'queued',
    queuedAt: Date.now(),
  };

  await internalSetGeneration({
    storage: context.storage,
    generation: queuedGeneration,
  });

  return queuedGeneration;
}

// =============================================================================
// Create and Start Generation
// =============================================================================

/**
 * Creates and immediately starts a generation
 * Combines creation, queueing, and starting into one operation
 */
export async function createAndStartGeneration(
  params: StartContentGenerationParams & {
    generation: Omit<Generation, 'status' | 'createdAt'> & {
      status?: 'created';
      createdAt?: number;
    };
  },
): Promise<RunningGeneration> {
  const { context, generation, metadata, onComplete, onError } = params;

  // Ensure creation timestamp
  const createdGeneration: Generation = {
    ...generation,
    status: 'created',
    createdAt: generation.createdAt ?? Date.now(),
  } as Generation;

  // Persist created state
  await internalSetGeneration({
    storage: context.storage,
    generation: createdGeneration,
  });

  // Queue it
  const queuedGeneration = await queueGeneration({
    context,
    generation: createdGeneration,
  });

  // Start it
  return startContentGeneration({
    context,
    generation: queuedGeneration,
    metadata,
    onComplete,
    onError,
  });
}
