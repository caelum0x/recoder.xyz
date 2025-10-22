import { createAuthClient } from "better-auth/react";

// Ensure we use the correct base URL
const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use current origin
    return window.location.origin;
  }
  // Server-side: use env variable
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  fetchOptions: {
    credentials: 'include',
  },
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  $Infer
} = authClient;
