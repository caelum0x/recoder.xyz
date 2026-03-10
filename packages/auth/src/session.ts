import { authDatabase } from "./database";
import { parseSessionToken } from "./edge";
import { Prisma } from "../prisma/auth-client";
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

  // Compatibility bridge: production currently has mixed auth schemas.
  // Prefer legacy plural tables first (`sessions` + `users`), then fallback
  // to singular Better Auth tables (`session` + `user`).
  let legacyRows: Array<{
    sessionId: string;
    userId: string;
    expiresAt: Date;
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  try {
    legacyRows = await authDatabase.$queryRaw<
      Array<{
        sessionId: string;
        userId: string;
        expiresAt: Date;
        id: string;
        email: string;
        emailVerified: boolean;
        name: string;
        image: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        s.id AS "sessionId",
        s."userId" AS "userId",
        s."expiresAt" AS "expiresAt",
        u.id AS "id",
        u.email AS "email",
        u."emailVerified" AS "emailVerified",
        u.name AS "name",
        u.image AS "image",
        u."createdAt" AS "createdAt",
        u."updatedAt" AS "updatedAt"
      FROM "sessions" s
      INNER JOIN "users" u ON u.id = s."userId"
      WHERE s.token = ${token}
      LIMIT 1
    `);
  } catch {
    // Ignore when legacy tables are not present in this environment.
  }

  const legacy = legacyRows[0];
  if (legacy) {
    if (legacy.expiresAt < new Date()) {
      return null;
    }

    return {
      sessionId: legacy.sessionId,
      userId: legacy.userId,
      user: {
        id: legacy.id,
        email: legacy.email,
        emailVerified: legacy.emailVerified,
        name: legacy.name,
        image: legacy.image,
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt,
      },
      expiresAt: legacy.expiresAt,
    };
  }

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
  let legacyUsers: Array<{
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  try {
    legacyUsers = await authDatabase.$queryRaw<
      Array<{
        id: string;
        email: string;
        emailVerified: boolean;
        name: string;
        image: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT id, email, "emailVerified", name, image, "createdAt", "updatedAt"
      FROM "users"
      WHERE id = ${userId}
      LIMIT 1
    `);
  } catch {
    // Ignore when legacy table is not present in this environment.
  }

  const legacy = legacyUsers[0];
  if (legacy) {
    return {
      id: legacy.id,
      email: legacy.email,
      emailVerified: legacy.emailVerified,
      name: legacy.name,
      image: legacy.image,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    };
  }

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
  let legacyUsers: Array<{
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  try {
    legacyUsers = await authDatabase.$queryRaw<
      Array<{
        id: string;
        email: string;
        emailVerified: boolean;
        name: string;
        image: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT id, email, "emailVerified", name, image, "createdAt", "updatedAt"
      FROM "users"
      WHERE email = ${email}
      LIMIT 1
    `);
  } catch {
    // Ignore when legacy table is not present in this environment.
  }

  const legacy = legacyUsers[0];
  if (legacy) {
    return {
      id: legacy.id,
      email: legacy.email,
      emailVerified: legacy.emailVerified,
      name: legacy.name,
      image: legacy.image,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    };
  }

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
