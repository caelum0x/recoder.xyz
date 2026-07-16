'use client';

import { ReactNode } from 'react';

/**
 * AuthProvider - Better Auth integration for Recoder.xyz
 * Provides authentication context to all components
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Better Auth handles its own session management via cookies
  // We just need to wrap our app to ensure auth client is available
  return <>{children}</>;
}
