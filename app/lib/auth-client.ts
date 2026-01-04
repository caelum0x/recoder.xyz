import { createAuthClient } from "better-auth/react"

// Determine the correct base URL for authentication
const getAuthBaseURL = () => {
  // Check if we're in the browser
  if (typeof window !== 'undefined') {
    // In production, use the current origin (works for recoder.xyz, web.recoder.xyz, etc.)
    const origin = window.location.origin;

    // If on a subdomain like web.recoder.xyz, route to main domain for auth
    if (origin.includes('web.recoder.xyz')) {
      return 'https://recoder.xyz';
    }

    // For production domains, use the origin
    if (origin.includes('recoder.xyz')) {
      return origin;
    }
  }

  // Fall back to env variable or localhost for SSR/development
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  fetchOptions: {
    credentials: 'include', // Ensure cookies are sent with cross-origin requests
  },
})

export const { useSession, signIn, signUp, signOut } = authClient
