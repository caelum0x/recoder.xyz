/**
 * Authentication utilities
 * Placeholder for actual authentication implementation
 */

export interface User {
  id: string;
  email: string;
  name?: string;
}

/**
 * Get current authenticated user
 * TODO: Implement with your chosen auth provider (Clerk, Auth0, etc.)
 */
export function getCurrentUser(): User | null {
  // This is a placeholder - replace with actual auth implementation
  // For now, we'll check localStorage for a user session
  if (typeof window === 'undefined') {
    return null;
  }

  const userStr = localStorage.getItem('current_user');
  if (!userStr) {
    return null;
  }

  try {
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

/**
 * Set current user (temporary - replace with real auth)
 */
export function setCurrentUser(user: User): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem('current_user', JSON.stringify(user));
}

/**
 * Clear current user session
 */
export function clearCurrentUser(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('current_user');
}
