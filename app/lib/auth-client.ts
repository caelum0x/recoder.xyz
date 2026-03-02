/**
 * Client-side Better Auth hooks for the main app surface.
 *
 * Auth API calls always target the primary auth host (recoder.xyz)
 * because that is where the Better Auth handler lives. Subdomain
 * surfaces share the session cookie via `.recoder.xyz` domain
 * and make their own calls to the same origin.
 */

import { createAuthClient } from "better-auth/react"

const AUTH_ORIGIN = "https://recoder.xyz";

const getAuthBaseURL = () => {
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return origin;
    }

    // All *.recoder.xyz surfaces route auth calls to the primary origin
    if (hostname.endsWith('.recoder.xyz') || hostname === 'recoder.xyz') {
      return AUTH_ORIGIN;
    }
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  fetchOptions: {
    credentials: 'include',
  },
})

export const { useSession, signIn, signUp, signOut } = authClient
