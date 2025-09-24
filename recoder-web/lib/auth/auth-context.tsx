'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthAPI } from './client-auth';
import type { AuthSession, AuthUser } from './types';

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionData = await AuthAPI.getSession();
      setSession(sessionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const sessionData = await AuthAPI.login({ email, password });
      setSession(sessionData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      setLoading(true);
      setError(null);
      const sessionData = await AuthAPI.register({ email, password, name });
      setSession(sessionData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await AuthAPI.logout();
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async () => {
    await loadSession();
  };

  const value: AuthContextType = {
    user: session?.user || null,
    session,
    loading,
    error,
    login,
    register,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Higher-order component for protected routes
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requiredPlan?: AuthUser['plan']
) {
  return function AuthenticatedComponent(props: P) {
    const { user, loading } = useAuth();

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
            <p className="text-gray-600 mb-8">Please log in to access this page.</p>
            <a
              href="/login"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Log In
            </a>
          </div>
        </div>
      );
    }

    if (requiredPlan) {
      const planHierarchy: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
      const userLevel = planHierarchy[user.plan || 'FREE'] ?? 0;
      const requiredLevel = planHierarchy[requiredPlan] ?? 0;

      if (userLevel < requiredLevel) {
        return (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Upgrade Required</h1>
              <p className="text-gray-600 mb-8">
                You need a {requiredPlan} plan to access this feature.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Upgrade Now
              </a>
            </div>
          </div>
        );
      }
    }

    return <WrappedComponent {...props} />;
  };
}

// Hook for checking plan access
export function usePlanAccess(requiredPlan: AuthUser['plan']) {
  const { user } = useAuth();
  
  if (!user) return false;
  
  const planHierarchy: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
  const userLevel = planHierarchy[user.plan || 'FREE'] ?? 0;
  const requiredLevel = planHierarchy[requiredPlan || 'FREE'] ?? 0;
  
  return userLevel >= requiredLevel;
}

export default AuthProvider;