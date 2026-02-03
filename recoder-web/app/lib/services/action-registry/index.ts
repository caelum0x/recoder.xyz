import {
  githubActions,
  githubActionEntries,
  isGitHubActionId,
  getGitHubActionInputFields,
  type GitHubActionId,
  type GitHubActions,
} from './github-actions';
import type { ActionContext, ActionProvider, ActionResult, InputField, RegisteredAction } from './types';

// Re-export all types
export * from './types';

// Re-export GitHub actions
export * from './github-actions';

// Re-export GitHub API client
export { createGitHubClient, GitHubAPIClient } from './github-api';

// Re-export executor
export * from './executor';

// ============================================================================
// Action Registry
// ============================================================================

/**
 * Action providers registry
 */
export const actionRegistry: ActionProvider[] = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'GitHub repository actions (issues, PRs, discussions)',
    icon: 'github',
    actions: githubActions as unknown as Record<string, RegisteredAction>,
  },
];

/**
 * All available action providers
 */
export type ActionProviderId = (typeof actionRegistry)[number]['id'];

/**
 * Get all available providers
 */
export function getProviders(): ActionProvider[] {
  return actionRegistry;
}

/**
 * Get a specific provider by ID
 */
export function getProvider(providerId: string): ActionProvider | undefined {
  return actionRegistry.find((p) => p.id === providerId);
}

/**
 * Check if a provider ID is valid
 */
export function isValidProviderId(providerId: string): providerId is ActionProviderId {
  return actionRegistry.some((p) => p.id === providerId);
}

/**
 * Get all actions for a provider
 */
export function getProviderActions(providerId: string): RegisteredAction[] {
  const provider = getProvider(providerId);
  if (!provider) return [];
  return Object.values(provider.actions);
}

/**
 * Get a specific action by its full ID (e.g., "github.create.issue")
 */
export function getAction(actionId: string): RegisteredAction | undefined {
  for (const provider of actionRegistry) {
    if (actionId in provider.actions) {
      return provider.actions[actionId];
    }
  }
  return undefined;
}

/**
 * Check if an action ID is valid
 */
export function isValidActionId(actionId: string): boolean {
  return getAction(actionId) !== undefined;
}

/**
 * Get all registered actions
 */
export function getAllActions(): RegisteredAction[] {
  return actionRegistry.flatMap((p) => Object.values(p.actions));
}

/**
 * Get actions by category (based on action ID pattern)
 */
export function getActionsByCategory(category: string): RegisteredAction[] {
  return getAllActions().filter((action) => {
    const parts = action.definition.id.split('.');
    return parts.length >= 2 && parts[1] === category;
  });
}

/**
 * Get input fields for an action
 */
export function getActionInputFields(actionId: string): InputField[] {
  const action = getAction(actionId);
  if (!action) return [];
  return action.getInputFields();
}

/**
 * Execute an action by ID
 */
export async function executeAction(
  actionId: string,
  payload: unknown,
  context: ActionContext
): Promise<ActionResult> {
  const action = getAction(actionId);
  if (!action) {
    return {
      success: false,
      error: `Unknown action: ${actionId}`,
    };
  }

  // Validate payload
  const validationResult = action.definition.payload.safeParse(payload);
  if (!validationResult.success) {
    return {
      success: false,
      error: 'Invalid payload',
      errorDetails: validationResult.error.errors,
    };
  }

  try {
    return await action.execute(validationResult.data, context);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorDetails: error,
    };
  }
}

/**
 * Search actions by label or description
 */
export function searchActions(query: string): RegisteredAction[] {
  const lowerQuery = query.toLowerCase();
  return getAllActions().filter((action) => {
    const label = action.definition.label.toLowerCase();
    const description = action.definition.description?.toLowerCase() || '';
    const id = action.definition.id.toLowerCase();
    return label.includes(lowerQuery) || description.includes(lowerQuery) || id.includes(lowerQuery);
  });
}

/**
 * Group actions by provider
 */
export function groupActionsByProvider(): Map<string, RegisteredAction[]> {
  const groups = new Map<string, RegisteredAction[]>();
  for (const provider of actionRegistry) {
    groups.set(provider.id, Object.values(provider.actions));
  }
  return groups;
}

/**
 * Get action categories for a provider
 */
export function getProviderCategories(providerId: string): string[] {
  const actions = getProviderActions(providerId);
  const categories = new Set<string>();

  for (const action of actions) {
    const parts = action.definition.id.split('.');
    if (parts.length >= 2) {
      categories.add(parts[1]); // e.g., "create", "update", "get", "add", "delete"
    }
  }

  return Array.from(categories).sort();
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * GitHub-specific exports for convenience
 */
export const github = {
  actions: githubActions,
  actionEntries: githubActionEntries,
  isActionId: isGitHubActionId,
  getInputFields: getGitHubActionInputFields,
} as const;
