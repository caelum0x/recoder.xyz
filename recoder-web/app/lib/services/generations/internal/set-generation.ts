/**
 * Internal Set Generation
 * Handles persisting generation state and updating indexes
 */

import {
  generationPath,
  getNodeGenerationIndexes,
  setNodeGenerationIndexes,
} from '../storage';
import type {
  Generation,
  GenerationLogger,
  GenerationStorage,
  NodeGenerationIndex,
  NodeId,
  TaskId,
} from '../types';
import { updateTaskGenerationIndexes } from './task-generation-index-queue';

/**
 * Upserts an index into the current list
 */
function upsertIndex(
  current: NodeGenerationIndex[] | undefined,
  incoming: NodeGenerationIndex,
): NodeGenerationIndex[] {
  if (!current) return [incoming];
  const pos = current.findIndex((i) => i.id === incoming.id);
  if (pos === -1) return [...current, incoming];
  return [...current.slice(0, pos), incoming, ...current.slice(pos + 1)];
}

/**
 * Converts a generation to a node generation index
 */
function toNodeGenerationIndex(generation: Generation): NodeGenerationIndex {
  return {
    id: generation.id,
    nodeId: generation.context.operationNode.id,
    status: generation.status,
    createdAt: generation.createdAt,
    queuedAt: 'queuedAt' in generation ? generation.queuedAt : undefined,
    startedAt: 'startedAt' in generation ? generation.startedAt : undefined,
    completedAt: 'completedAt' in generation ? generation.completedAt : undefined,
    failedAt: 'failedAt' in generation ? generation.failedAt : undefined,
    cancelledAt: 'cancelledAt' in generation ? generation.cancelledAt : undefined,
  };
}

/**
 * Internal function to set a generation and update all related indexes
 */
export async function internalSetGeneration(params: {
  storage: GenerationStorage;
  generation: Generation;
  logger?: GenerationLogger;
}): Promise<void> {
  const { storage, generation, logger } = params;

  // Save the generation itself
  await storage.setJson({
    path: generationPath(generation.id),
    data: generation,
  });

  logger?.debug(`Setting generation in storage: id=${generation.id}`);

  const newIndex = toNodeGenerationIndex(generation);
  const nodeId = generation.context.operationNode.id;

  // Update nodeId-based index
  const currentNodeIndexes = await getNodeGenerationIndexes({ storage, nodeId });
  const nextNodeIndexes = upsertIndex(currentNodeIndexes, newIndex);
  await setNodeGenerationIndexes({ storage, nodeId, indexes: nextNodeIndexes });

  // Update taskId-based index when present
  const taskId = generation.context.origin.taskId;
  logger?.debug(`internalSetGeneration ---- taskId: ${taskId}`);

  if (taskId !== undefined) {
    updateTaskGenerationIndexes(storage, taskId, newIndex);
  }
}
