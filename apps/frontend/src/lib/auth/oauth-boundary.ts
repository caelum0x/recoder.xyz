'use client';

import { getSessionAccessToken } from '@/lib/auth/session-token';
import { authClient } from '@/lib/auth/auth-client';

type OAuthProvider = 'github' | 'google';

type OAuthOptions = {
  redirectTo: string;
  queryParams?: Record<string, string>;
};

export async function startOAuthSignIn(provider: OAuthProvider, options: OAuthOptions) {
  await authClient.signIn.social({
    provider,
    callbackURL: options.redirectTo,
    ...(options.queryParams ? { queryParams: options.queryParams } : {}),
  });
}

export async function waitForOAuthSession(timeoutMs = 10_000, intervalMs = 400): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const token = await getSessionAccessToken();
    if (token) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
