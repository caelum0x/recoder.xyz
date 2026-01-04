/**
 * User Store
 * Simple module-level storage for the current user's ID
 * Used by runtime components to pass userId when creating containers
 * This enables Claude Code token injection for authenticated users
 */

import { atom } from 'nanostores';

// Store the current user's ID for container creation
export const currentUserId = atom<string | null>(null);

/**
 * Set the current user ID (called when user logs in)
 */
export function setCurrentUserId(userId: string | null) {
  currentUserId.set(userId);
}

/**
 * Get the current user ID
 */
export function getCurrentUserId(): string | null {
  return currentUserId.get();
}
