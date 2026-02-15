/**
 * Generation Store
 * Nanostore-based reactive store for managing generations
 * Adapted from Giselle's Zustand-based store
 */

import { atom, computed, map } from 'nanostores';
import type {
  Generation,
  GenerationId,
  UIMessage,
  RunningGeneration,
} from './types';
import { isRunningGeneration } from './types';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('GiselleGenerationStore');

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

// ============================================================
// Computed values
// ============================================================

/**
 * All generations as an array
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

// ============================================================
// Actions
// ============================================================

/**
 * Set all generations (replaces existing state)
 */
export function setGenerations(generations: Generation[]): void {
  const byId: Record<GenerationId, Generation> = {};
  const ids: GenerationId[] = [];

  for (const gen of generations) {
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
export function addGenerations(
  generations: Generation | Generation[]
): void {
  const arr = Array.isArray(generations) ? generations : [generations];
  const currentById = $generationsById.get();
  const currentIds = $generationIds.get();

  const newById = { ...currentById };
  const incomingIds = new Set<GenerationId>();

  for (const gen of arr) {
    newById[gen.id] = gen;
    incomingIds.add(gen.id);
  }

  // Keep existing IDs that aren't being replaced, then add new ones
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
    logger.warn(`Generation ${id} not found when updating messages`);
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
  nodeId: string,
  origin?: { type: 'studio' | 'task'; workspaceId?: string; taskId?: string }
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

    return false;
  });
}
