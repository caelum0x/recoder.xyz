/**
 * Auth Context for recoder-web
 * Provides user session data throughout the app
 */

import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../auth/session.server';
import { setCurrentUserId } from '../stores/user';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
});

interface AuthProviderProps {
  user: User | null;
  children: ReactNode;
}

export function AuthProvider({ user, children }: AuthProviderProps) {
  // Set the user ID in the global store for runtime components
  // This enables Claude Code token injection when creating containers
  useEffect(() => {
    setCurrentUserId(user?.id ?? null);
  }, [user?.id]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to get current user (throws if not authenticated)
 */
export function useRequireAuth() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    throw new Error('User must be authenticated');
  }

  return user;
}
