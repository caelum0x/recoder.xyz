/**
 * Get Generation
 * Functions for retrieving generation data
 */

import type {
  Generation,
  GenerationContextConfig,
  GenerationId,
  NodeId,
  NodeGenerationIndex,
  TaskId,
} from './types';
import {
  getGeneration as getGenerationFromStorage,
  getNodeGenerationIndexes,
  getTaskGenerationIndexes,
} from './storage';

// =============================================================================
// Get Generation
// =============================================================================

/**
 * Gets a generation by ID
 */
export async function getGeneration(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
}): Promise<Generation | undefined> {
  return getGenerationFromStorage({
    storage: params.context.storage,
    generationId: params.generationId,
  });
}

// =============================================================================
// Get Node Generations
// =============================================================================

const DEFAULT_LIMIT = 10;

/**
 * Gets generations for a specific node, sorted by creation time
 */
export async function getNodeGenerations(params: {
  context: GenerationContextConfig;
  nodeId: NodeId;
  limit?: number;
}): Promise<Generation[]> {
  const { context, nodeId, limit = DEFAULT_LIMIT } = params;

  const nodeGenerationIndexes = await getNodeGenerationIndexes({
    storage: context.storage,
    nodeId,
  });

  if (nodeGenerationIndexes === undefined) {
    return [];
  }

  // Sort by creation time (newest first) and take limit
  const sortedIndexes = [...nodeGenerationIndexes]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .reverse(); // Reverse to get oldest first

  // Fetch all generations
  const generations = await Promise.all(
    sortedIndexes.map((index) =>
      getGenerationFromStorage({
        storage: context.storage,
        generationId: index.id,
      }).catch(() => null),
    ),
  );

  return generations.filter((gen): gen is Generation => gen !== null);
}

// =============================================================================
// Get Latest Generation for Node
// =============================================================================

/**
 * Gets the most recent generation for a node
 */
export async function getLatestNodeGeneration(params: {
  context: GenerationContextConfig;
  nodeId: NodeId;
}): Promise<Generation | undefined> {
  const { context, nodeId } = params;

  const nodeGenerationIndexes = await getNodeGenerationIndexes({
    storage: context.storage,
    nodeId,
  });

  if (!nodeGenerationIndexes || nodeGenerationIndexes.length === 0) {
    return undefined;
  }

  // Get the most recent one
  const sortedIndexes = [...nodeGenerationIndexes].sort((a, b) => b.createdAt - a.createdAt);
  const latestIndex = sortedIndexes[0];

  return getGenerationFromStorage({
    storage: context.storage,
    generationId: latestIndex.id,
  });
}

// =============================================================================
// Get Task Generations
// =============================================================================

/**
 * Gets all generation indexes for a task
 */
export async function getTaskGenerationIndexesWithDetails(params: {
  context: GenerationContextConfig;
  taskId: TaskId;
}): Promise<{
  indexes: NodeGenerationIndex[];
  generations: Generation[];
}> {
  const { context, taskId } = params;

  const indexes = await getTaskGenerationIndexes({
    storage: context.storage,
    taskId,
  });

  if (!indexes) {
    return { indexes: [], generations: [] };
  }

  const generations = await Promise.all(
    indexes.map((index) =>
      getGenerationFromStorage({
        storage: context.storage,
        generationId: index.id,
      }).catch(() => null),
    ),
  );

  return {
    indexes,
    generations: generations.filter((gen): gen is Generation => gen !== null),
  };
}

// =============================================================================
// Get Completed Generation for Node
// =============================================================================

/**
 * Gets the most recent completed generation for a node
 */
export async function getLatestCompletedGeneration(params: {
  context: GenerationContextConfig;
  nodeId: NodeId;
}): Promise<Generation | undefined> {
  const { context, nodeId } = params;

  const nodeGenerationIndexes = await getNodeGenerationIndexes({
    storage: context.storage,
    nodeId,
  });

  if (!nodeGenerationIndexes || nodeGenerationIndexes.length === 0) {
    return undefined;
  }

  // Find the most recent completed generation
  const completedIndexes = nodeGenerationIndexes
    .filter((index) => index.status === 'completed')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  if (completedIndexes.length === 0) {
    return undefined;
  }

  return getGenerationFromStorage({
    storage: context.storage,
    generationId: completedIndexes[0].id,
  });
}

// =============================================================================
// Check Generation Status
// =============================================================================

/**
 * Checks if a generation exists and returns its status
 */
export async function getGenerationStatus(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
}): Promise<string | undefined> {
  const generation = await getGenerationFromStorage({
    storage: params.context.storage,
    generationId: params.generationId,
  });

  return generation?.status;
}

/**
 * Waits for a generation to complete (or fail/cancel)
 */
export async function waitForGeneration(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<Generation> {
  const { context, generationId, pollIntervalMs = 500, timeoutMs = 60000 } = params;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const generation = await getGenerationFromStorage({
      storage: context.storage,
      generationId,
    });

    if (!generation) {
      throw new Error(`Generation ${generationId} not found`);
    }

    if (
      generation.status === 'completed' ||
      generation.status === 'failed' ||
      generation.status === 'cancelled'
    ) {
      return generation;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Generation ${generationId} timed out after ${timeoutMs}ms`);
}
