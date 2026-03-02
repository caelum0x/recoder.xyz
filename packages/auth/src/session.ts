import { authDatabase } from "./database";
import { parseSessionToken } from "./edge";
export { SESSION_COOKIE_NAMES, parseSessionToken } from "./edge";

/**
 * Core auth user from the shared auth database.
 */
export type AuthCoreUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Session with user data, returned by verifySessionToken.
 */
export type AuthSession = {
  sessionId: string;
  userId: string;
  user: AuthCoreUser;
  expiresAt: Date;
};

/**
 * Verify a session token by looking it up in the auth database.
 * Returns the session + user if valid, or null if expired/invalid.
 *
 * This is the core verification function used by:
 * - Next.js apps (via cookies)
 * - Python backend (via direct DB lookup)
 * - docker-backend (via HTTP call or direct DB lookup)
 */
export async function verifySessionToken(
  rawToken: string
): Promise<AuthSession | null> {
  const token = parseSessionToken(rawToken);

  const session = await authDatabase.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    return null;
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    user: {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      name: session.user.name,
      image: session.user.image,
      createdAt: session.user.createdAt,
      updatedAt: session.user.updatedAt,
    },
    expiresAt: session.expiresAt,
  };
}

/**
 * Get a user by ID from the auth database.
 */
export async function getAuthUserById(
  userId: string
): Promise<AuthCoreUser | null> {
  const user = await authDatabase.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Get a user by email from the auth database.
 */
export async function getAuthUserByEmail(
  email: string
): Promise<AuthCoreUser | null> {
  const user = await authDatabase.user.findUnique({
    where: { email },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
