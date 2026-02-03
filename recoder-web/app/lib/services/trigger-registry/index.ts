import { githubEvents } from './github';
import type { TriggerEntry } from './types';

// Re-export all GitHub events and utilities
export * from './github';

// Re-export all types
export * from './types';

// Re-export manual trigger utilities
export * from './manual';

// Re-export webhook verification utilities
export * from './webhook-verification';

// Re-export webhook handler utilities
export * from './webhook-handler';

/**
 * Trigger registry containing all supported trigger providers
 */
export const triggerRegistry = [
  {
    provider: 'github',
    label: 'GitHub Trigger',
    events: githubEvents,
  },
  {
    provider: 'manual',
    label: 'Manual Trigger',
    events: [],
  },
] as const;

export type TriggerProvider = (typeof triggerRegistry)[number]['provider'];

/**
 * Get a trigger entry by provider name
 */
export function getEntry(triggerProvider: TriggerProvider): TriggerEntry {
  const trigger = triggerRegistry.find((entry) => entry.provider === triggerProvider);

  if (trigger === undefined) {
    throw new Error(`Trigger provider ${triggerProvider} not found`);
  }

  return trigger as TriggerEntry;
}

/**
 * Type guard to check if a value is a valid trigger provider
 */
export function isTriggerProvider(provider: unknown): provider is TriggerProvider {
  return triggerRegistry.some((entry) => entry.provider === provider);
}

/**
 * Get all available trigger providers
 */
export function getTriggerProviders(): readonly TriggerProvider[] {
  return triggerRegistry.map((entry) => entry.provider);
}

/**
 * Get all events for a specific provider
 */
export function getEventsForProvider(provider: TriggerProvider): Record<string, unknown> | readonly never[] {
  const entry = getEntry(provider);
  return entry.events;
}

/**
 * Check if a specific event is supported for a provider
 */
export function isEventSupported(provider: TriggerProvider, eventId: string): boolean {
  const entry = getEntry(provider);

  if (Array.isArray(entry.events)) {
    return false;
  }

  return eventId in (entry.events as Record<string, unknown>);
}
