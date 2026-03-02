'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { clearUserLocalStorage } from '@/lib/utils/clear-local-storage';
import { getSessionAccessToken } from '@/lib/auth/session-token';

/**
 * Unified user type for the auth context.
 * Maps better-auth session data to a shape compatible with existing consumers.
 */
type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  user_metadata: {
    name: string | null;
    image_url: string | null;
    full_name?: string | null;
    locale?: string | null;
    access_token?: string | null;
  };
};

type AuthContextType = {
  /** @deprecated — session object is no longer JWT-based. Use `user` instead. */
  session: { user: AuthUser; access_token?: string | null } | null;
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const [response, token] = await Promise.all([
        fetch('/api/auth/session', {
          credentials: 'include',
        }),
        getSessionAccessToken(),
      ]);
      setAccessToken(token);

      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = await response.json();
      const sessionUser = data?.user ?? data?.data?.user ?? null;

      if (sessionUser) {
        setUser({
          id: sessionUser.id,
          email: sessionUser.email,
          emailVerified: sessionUser.emailVerified ?? false,
          name: sessionUser.name ?? null,
          image: sessionUser.image ?? null,
          user_metadata: {
            name: sessionUser.name ?? null,
            image_url: sessionUser.image ?? null,
            full_name: sessionUser.name ?? null,
            locale: sessionUser.locale ?? null,
            access_token: token ?? null,
          },
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const signOut = async () => {
    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      setAccessToken(null);
      clearUserLocalStorage();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const session = user ? { user, access_token: accessToken } : null;

  const value = {
    session,
    user,
    isLoading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
