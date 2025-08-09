'use client';

/**
 * Authentication Context for Recoder Web App
 * Provides unified authentication state and methods across the app
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { webBackendClient, UserSession } from './backend-client';

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password: string } | { token: string }) => Promise<UserSession>;
  register: (userData: { email: string; password: string; name: string }) => Promise<UserSession>;
  logout: () => Promise<void>;
  syncSession: () => Promise<UserSession | null>;
  checkQuota: () => Promise<boolean>;
  trackUsage: (usage: { command: string; tokens: number; model: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize authentication on mount
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Load existing session
      const session = webBackendClient.getCurrentSession();
      if (session) {
        setUser(session);
        
        // Mark web platform as active
        await webBackendClient.updatePlatformStatus('web', true);
        
        // Sync with backend if available
        try {
          const syncedSession = await webBackendClient.syncSession();
          if (syncedSession) {
            setUser(syncedSession);
          }
        } catch (error) {
          console.warn('Could not sync session with backend');
        }
      }
    } catch (error) {
      console.error('Failed to initialize authentication:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: { email: string; password: string } | { token: string }): Promise<UserSession> => {
    try {
      setIsLoading(true);
      const session = await webBackendClient.authenticate(credentials);
      if (!session) {
        throw new Error('Authentication failed: session is null');
      }
      setUser(session);
      
      // Mark web platform as active
      await webBackendClient.updatePlatformStatus('web', true);
      
      return session as UserSession;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: { email: string; password: string; name: string }): Promise<UserSession> => {
    try {
      setIsLoading(true);
      const session = await webBackendClient.register(userData);
      if (!session) {
        throw new Error('Registration failed: session is null');
      }
      setUser(session);
      
      // Mark web platform as active
      await webBackendClient.updatePlatformStatus('web', true);
      
      return session;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Mark web platform as inactive before logout
      if (user) {
        await webBackendClient.updatePlatformStatus('web', false);
      }
      
      await webBackendClient.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if logout fails, clear local state
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const syncSession = async (): Promise<UserSession | null> => {
    try {
      const syncedSession = await webBackendClient.syncSession();
      if (syncedSession) {
        setUser(syncedSession);
      }
      return syncedSession;
    } catch (error) {
      console.error('Session sync failed:', error);
      return user;
    }
  };

  const checkQuota = async (): Promise<boolean> => {
    try {
      return await webBackendClient.checkQuota();
    } catch (error) {
      console.error('Quota check failed:', error);
      return false;
    }
  };

  const trackUsage = async (usage: { command: string; tokens: number; model: string }): Promise<void> => {
    try {
      await webBackendClient.trackUsage({
        platform: 'web',
        command: usage.command,
        tokens: usage.tokens,
        model: usage.model,
        timestamp: new Date()
      });

      // Update local quota count
      if (user?.quotas) {
        const updatedUser = {
          ...user,
          quotas: {
            ...user.quotas,
            usedRequests: user.quotas.usedRequests + 1
          }
        };
        setUser(updatedUser);
      }
    } catch (error) {
      console.error('Usage tracking failed:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    syncSession,
    checkQuota,
    trackUsage
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthProvider;