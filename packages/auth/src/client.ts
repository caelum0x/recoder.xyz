/**
 * Client-side auth helpers for browser/React apps.
 * Framework-agnostic — works with Next.js, Remix, etc.
 */

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
};

export type SessionResponse = {
  data: {
    user: SessionUser | null;
  };
};

const sessionFallback: SessionResponse = { data: { user: null } };

/**
 * Client-side auth API. Calls the app's auth endpoints using cookies.
 */
export const authClient = {
  /**
   * Fetch the current session from the server.
   * The session cookie is sent automatically via credentials: "include".
   */
  getSession: async (): Promise<SessionResponse> => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });

      if (!response.ok) {
        return sessionFallback;
      }

      return (await response.json()) as SessionResponse;
    } catch {
      return sessionFallback;
    }
  },

  /**
   * Sign out the current user by calling the sign-out endpoint.
   */
  signOut: async (): Promise<void> => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
  },
};
