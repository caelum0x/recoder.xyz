/**
 * Generation Store
 * Nanostore-based reactive store for managing AI generations
 */

import { atom, computed, map } from 'nanostores';
import type {
  Generation,
  GenerationId,
  UIMessage,
  RunningGeneration,
  NodeId,
  GenerationOrigin,
} from './types';
import { isRunningGeneration } from './types';

// ============================================================
// Atoms for generation state
// ============================================================

/**
 * Map of all generations by ID for O(1) access
 */
export const $generationsById = map<Record<GenerationId, Generation>>({});

/**
 * Ordered list of generation IDs (most recent first)
 */
export const $generationIds = atom<GenerationId[]>([]);

/**
 * Stop handlers for active generations
 */
export const $generationStopHandlers = map<Record<GenerationId, () => void>>({});

// ============================================================
// Computed values
// ============================================================

/**
 * All generations as an array (ordered by createdAt descending)
 */
export const $generations = computed(
  [$generationsById, $generationIds],
  (byId, ids) => ids.map((id) => byId[id]).filter(Boolean) as Generation[]
);

/**
 * Currently running generations
 */
export const $runningGenerations = computed($generations, (generations) =>
  generations.filter(isRunningGeneration)
);

/**
 * Check if any generation is currently running
 */
export const $isAnyGenerating = computed(
  $runningGenerations,
  (running) => running.length > 0
);

/**
 * Count of active (non-terminal) generations
 */
export const $activeGenerationCount = computed($generations, (generations) =>
  generations.filter(
    (g) =>
      g.status === 'created' || g.status === 'queued' || g.status === 'running'
  ).length
);

// ============================================================
// Actions
// ============================================================

/**
 * Set all generations (replaces existing state)
 */
export function setGenerations(generations: Generation[]): void {
  const byId: Record<GenerationId, Generation> = {};
  const ids: GenerationId[] = [];

  // Sort by createdAt descending
  const sorted = [...generations].sort((a, b) => b.createdAt - a.createdAt);

  for (const gen of sorted) {
    byId[gen.id] = gen;
    ids.push(gen.id);
  }

  $generationsById.set(byId);
  $generationIds.set(ids);
}

/**
 * Add one or more generations to the store
 * If a generation with the same ID exists, it will be replaced
 */
export function addGenerations(generations: Generation | Generation[]): void {
  const arr = Array.isArray(generations) ? generations : [generations];
  const currentById = $generationsById.get();
  const currentIds = $generationIds.get();

  const newById = { ...currentById };
  const incomingIds = new Set<GenerationId>();

  for (const gen of arr) {
    newById[gen.id] = gen;
    incomingIds.add(gen.id);
  }

  // Keep existing IDs that aren't being replaced, then add new ones at front
  const filteredIds = currentIds.filter((id) => !incomingIds.has(id));
  const newIds = [...arr.map((g) => g.id), ...filteredIds];

  $generationsById.set(newById);
  $generationIds.set(newIds);
}

/**
 * Update a single generation
 */
export function updateGeneration(generation: Generation): void {
  const currentById = $generationsById.get();
  const currentIds = $generationIds.get();

  if (!currentById[generation.id]) {
    // Generation doesn't exist, add it
    addGenerations(generation);
    return;
  }

  $generationsById.setKey(generation.id, generation);
}

/**
 * Update messages for a specific generation
 */
export function updateGenerationMessages(
  id: GenerationId,
  messages: UIMessage[]
): void {
  const generation = $generationsById.get()[id];

  if (!generation) {
    console.warn(`Generation ${id} not found when updating messages`);
    return;
  }

  if (isRunningGeneration(generation)) {
    $generationsById.setKey(id, {
      ...generation,
      messages,
    });
  }
}

/**
 * Upsert a message into a generation
 * If the message ID exists, update it; otherwise, add it
 */
export function upsertGenerationMessage(
  id: GenerationId,
  message: UIMessage
): void {
  const generation = $generationsById.get()[id];

  if (!generation || !isRunningGeneration(generation)) {
    return;
  }

  const existingIndex = generation.messages.findIndex(
    (m) => m.id === message.id
  );

  const newMessages =
    existingIndex === -1
      ? [...generation.messages, message]
      : generation.messages.map((m, i) =>
          i === existingIndex ? message : m
        );

  $generationsById.setKey(id, {
    ...generation,
    messages: newMessages,
  });
}

/**
 * Remove a generation by ID
 */
export function removeGeneration(id: GenerationId): void {
  const currentById = $generationsById.get();
  const currentIds = $generationIds.get();

  if (!currentById[id]) {
    return;
  }

  // Also remove stop handler if exists
  const handlers = $generationStopHandlers.get();
  if (handlers[id]) {
    const { [id]: removed, ...restHandlers } = handlers;
    $generationStopHandlers.set(restHandlers);
  }

  const { [id]: removed, ...rest } = currentById;
  $generationsById.set(rest);
  $generationIds.set(currentIds.filter((gid) => gid !== id));
}

/**
 * Clear all generations
 */
export function clearGenerations(): void {
  $generationsById.set({});
  $generationIds.set([]);
  $generationStopHandlers.set({});
}

/**
 * Get a generation by ID
 */
export function getGeneration(id: GenerationId): Generation | undefined {
  return $generationsById.get()[id];
}

/**
 * Get generations for a specific node
 */
export function getGenerationsForNode(
  nodeId: NodeId,
  origin?: GenerationOrigin
): Generation[] {
  return $generations.get().filter((gen) => {
    if (gen.context.operationNode.id !== nodeId) {
      return false;
    }

    if (!origin) {
      return true;
    }

    if (gen.context.origin.type !== origin.type) {
      return false;
    }

    if (origin.type === 'studio' && gen.context.origin.type === 'studio') {
      return gen.context.origin.workspaceId === origin.workspaceId;
    }

    if (origin.type === 'task' && gen.context.origin.type === 'task') {
      return gen.context.origin.taskId === origin.taskId;
    }

    return true;
  });
}

/**
 * Register a stop handler for a generation
 */
export function addStopHandler(
  generationId: GenerationId,
  handler: () => void
): void {
  $generationStopHandlers.setKey(generationId, handler);
}

/**
 * Remove a stop handler
 */
export function removeStopHandler(generationId: GenerationId): void {
  const handlers = $generationStopHandlers.get();
  if (handlers[generationId]) {
    const { [generationId]: removed, ...rest } = handlers;
    $generationStopHandlers.set(rest);
  }
}

/**
 * Call the stop handler for a generation
 */
export function callStopHandler(generationId: GenerationId): boolean {
  const handler = $generationStopHandlers.get()[generationId];
  if (handler) {
    handler();
    return true;
  }
  return false;
}
