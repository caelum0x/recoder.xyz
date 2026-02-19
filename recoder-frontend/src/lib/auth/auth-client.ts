'use client';

import { createAuthClient } from 'better-auth/react';

const getAuthBaseURL = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('web.recoder.xyz')) {
      return 'https://recoder.xyz';
    }
    if (origin.includes('recoder.xyz')) {
      return origin;
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
