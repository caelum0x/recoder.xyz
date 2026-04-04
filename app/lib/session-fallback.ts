import { prisma } from '@/lib/prisma';

export interface FallbackSessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface FallbackSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  user: FallbackSessionUser;
}

export async function findFallbackSessionByToken(token: string): Promise<FallbackSession | null> {
  const sessionToken = (token.includes('.') ? token.split('.')[0] : token).trim();
  if (!sessionToken) {
    return null;
  }

  const activeSessionWhere = {
    token: sessionToken,
    expiresAt: { gt: new Date() },
  };

  const primarySession = await prisma.sessions.findFirst({
    where: activeSessionWhere,
    include: { users: true },
  });

  if (primarySession?.users) {
    return {
      sessionId: primarySession.id,
      userId: primarySession.userId,
      expiresAt: primarySession.expiresAt,
      user: {
        id: primarySession.users.id,
        email: primarySession.users.email,
        name: primarySession.users.name,
        image: primarySession.users.image,
      },
    };
  }

  const legacySession = await prisma.session.findFirst({
    where: activeSessionWhere,
    include: { user: true },
  });

  if (legacySession?.user) {
    return {
      sessionId: legacySession.id,
      userId: legacySession.userId,
      expiresAt: legacySession.expiresAt,
      user: {
        id: legacySession.user.id,
        email: legacySession.user.email,
        name: legacySession.user.name,
        image: legacySession.user.image,
      },
    };
  }

  return null;
}
