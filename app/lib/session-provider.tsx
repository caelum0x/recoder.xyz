'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  hasApiKey?: boolean;
}

interface Session {
  user: User;
  expires: string;
}

interface SessionContextType {
  data: Session | null;
  isPending: boolean;
  error: Error | null;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = async () => {
    try {
      setIsPending(true);
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
      });

      if (response.ok) {
        const sessionData = await response.json();
        if (sessionData?.user) {
          setSession({
            user: sessionData.user,
            expires: sessionData?.session?.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
        } else {
          setSession(null);
        }
      } else {
        setSession(null);
      }
    } catch (err) {
      setError(err as Error);
      setSession(null);
    } finally {
      setIsPending(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  // Listen for storage events (when user logs in in another tab)
  useEffect(() => {
    const handleStorageChange = () => {
      fetchSession();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleStorageChange);
    };
  }, []);

  return (
    <SessionContext.Provider value={{ data: session, isPending, error }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

// Create a signIn function that supports both regular and social login
function createSignInFunction() {
  const regularSignIn = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    return response;
  };

  const socialSignIn = async (options: { provider: 'google' | 'github'; callbackURL?: string }) => {
    const { provider, callbackURL } = options;

    // Redirect to OAuth provider
    const redirectUrl = `/api/auth/${provider}`;
    window.location.href = redirectUrl;
    
    // Return a promise that resolves when redirect happens
    return Promise.resolve({ ok: true });
  };

  // Combine them
  const signInWithSocial = regularSignIn as typeof regularSignIn & { social: typeof socialSignIn };
  signInWithSocial.social = socialSignIn;
  
  return signInWithSocial;
}

export const signIn = createSignInFunction();

export async function signUp(email: string, password: string, name: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, name }),
    credentials: 'include',
  });

  return response;
}

export async function signOut() {
  let response = await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
  });

  // Compatibility and resilience fallback.
  if (!response.ok) {
    response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  }

  if (response.ok) {
    window.location.href = '/';
  }

  return response;
}
