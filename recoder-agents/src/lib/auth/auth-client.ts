'use client';

import { createAuthClient } from 'better-auth/react';

const getAuthBaseURL = () => {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return window.location.origin;
    }
    if (hostname.endsWith('.recoder.xyz') || hostname === 'recoder.xyz') {
      // Auth providers are configured on the primary auth host only.
      return 'https://recoder.xyz';
    }
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  fetchOptions: {
    credentials: 'include',
  },
});
