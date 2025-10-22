import { prisma } from '../database/prisma';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Configuration
const CLI_JWT_SECRET = process.env.CLI_JWT_SECRET || 'your-secret-key-change-in-production';
const CLI_TOKEN_EXPIRY = process.env.CLI_TOKEN_EXPIRY || '30d';
const CLI_DEVICE_CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes
const CLI_POLLING_INTERVAL = 5; // 5 seconds

/**
 * Generate a random device code
 * Format: abc123-def456-ghi789
 */
function generateDeviceCode(): string {
  const segments = 3;
  const segmentLength = 6;
  const parts: string[] = [];
  
  for (let i = 0; i < segments; i++) {
    const segment = crypto.randomBytes(segmentLength / 2).toString('hex');
    parts.push(segment);
  }
  
  return parts.join('-');
}

/**
 * Generate a user-friendly code
 * Format: ABCD-1234
 */
function generateUserCode(): string {
  const letters = crypto.randomBytes(2).toString('hex').toUpperCase().substring(0, 4);
  const numbers = Math.floor(1000 + Math.random() * 9000).toString();
  return `${letters}-${numbers}`;
}

/**
 * Generate JWT access token
 */
function generateAccessToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { userId, sessionId, type: 'cli' },
    CLI_JWT_SECRET,
    { expiresIn: CLI_TOKEN_EXPIRY }
  );
}

/**
 * Generate refresh token
 */
function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Verify CLI JWT token
 */
export function verifyCliToken(token: string): any {
  try {
    return jwt.verify(token, CLI_JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Start CLI authorization flow
 */
export async function startCliAuthorization(deviceInfo?: any) {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + CLI_DEVICE_CODE_EXPIRY);

  const session = await prisma.cli_sessions.create({
    data: {
      id: crypto.randomUUID(),
      deviceCode,
      userCode,
      expiresAt,
      updatedAt: new Date(),
      deviceInfo: deviceInfo || {},
      status: 'pending'
    }
  });

  return {
    deviceCode,
    userCode,
    verificationUrl: `${process.env.FRONTEND_URL || 'https://recoder.xyz'}/cli/authorize`,
    expiresIn: Math.floor(CLI_DEVICE_CODE_EXPIRY / 1000), // seconds
    interval: CLI_POLLING_INTERVAL
  };
}

/**
 * Poll for authorization token
 */
export async function pollForToken(deviceCode: string) {
  const session = await prisma.cli_sessions.findUnique({
    where: { deviceCode },
    include: { user: true }
  });

  if (!session) {
    return { error: 'invalid_grant', message: 'Device code not found' };
  }

  // Check expiration
  if (new Date() > session.expiresAt) {
    await prisma.cli_sessions.update({
      where: { id: session.id },
      data: { status: 'expired' }
    });
    return { error: 'expired_token', message: 'Device code has expired' };
  }

  // Check status
  if (session.status === 'pending') {
    return { status: 'pending', message: 'User has not authorized yet' };
  }

  if (session.status === 'revoked') {
    return { error: 'access_denied', message: 'Authorization was revoked' };
  }

  if (session.status === 'expired') {
    return { error: 'expired_token', message: 'Device code has expired' };
  }

  // Status is 'authorized'
  if (session.accessToken && session.userId) {
    return {
      status: 'authorized',
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: Math.floor(30 * 24 * 60 * 60), // 30 days in seconds
      user: {
        id: session.user?.id,
        email: session.user?.email,
        name: session.user?.name,
        subscription: session.user?.subscription
      }
    };
  }

  return { error: 'authorization_pending', message: 'Authorization in progress' };
}

/**
 * Authorize a CLI session
 */
export async function authorizeCliSession(
  userCode: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const session = await prisma.cli_sessions.findUnique({
    where: { userCode }
  });

  if (!session) {
    throw new Error('Invalid user code');
  }

  if (new Date() > session.expiresAt) {
    throw new Error('User code has expired');
  }

  if (session.status !== 'pending') {
    throw new Error('Session already processed');
  }

  // Generate tokens
  const accessToken = generateAccessToken(userId, session.id);
  const refreshToken = generateRefreshToken();
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Update session
  const updatedSession = await prisma.cli_sessions.update({
    where: { id: session.id },
    data: {
      userId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      status: 'authorized',
      authorizedAt: new Date(),
      ipAddress,
      userAgent
    },
    include: { user: true }
  });

  return {
    success: true,
    session: updatedSession
  };
}

/**
 * Deny a CLI session
 */
export async function denyCliSession(userCode: string) {
  const session = await prisma.cli_sessions.findUnique({
    where: { userCode }
  });

  if (!session) {
    throw new Error('Invalid user code');
  }

  await prisma.cli_sessions.update({
    where: { id: session.id },
    data: {
      status: 'revoked',
      revokedAt: new Date()
    }
  });

  return { success: true };
}

/**
 * Verify CLI session and return user
 */
export async function verifyCliSession(token: string) {
  try {
    const decoded = verifyCliToken(token);
    
    const session = await prisma.cli_sessions.findFirst({
      where: {
        id: decoded.sessionId,
        accessToken: token,
        status: 'authorized'
      },
      include: { user: true }
    });

    if (!session) {
      throw new Error('Invalid session');
    }

    if (session.tokenExpiresAt && new Date() > session.tokenExpiresAt) {
      throw new Error('Token expired');
    }

    // Update last used
    await prisma.cli_sessions.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() }
    });

    return {
      valid: true,
      user: session.user,
      session
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid token'
    };
  }
}

/**
 * List user's CLI sessions
 */
export async function listCliSessions(userId: string) {
  const sessions = await prisma.cli_sessions.findMany({
    where: {
      userId,
      status: { in: ['authorized', 'pending'] }
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      deviceInfo: true,
      createdAt: true,
      lastUsedAt: true,
      authorizedAt: true,
      status: true,
      ipAddress: true,
      tokenExpiresAt: true
    }
  });

  return sessions;
}

/**
 * Revoke a CLI session
 */
export async function revokeCliSession(sessionId: string, userId: string) {
  const session = await prisma.cli_sessions.findFirst({
    where: {
      id: sessionId,
      userId
    }
  });

  if (!session) {
    throw new Error('Session not found');
  }

  await prisma.cli_sessions.update({
    where: { id: sessionId },
    data: {
      status: 'revoked',
      revokedAt: new Date()
    }
  });

  return { success: true };
}

/**
 * Revoke all CLI sessions for a user
 */
export async function revokeAllCliSessions(userId: string) {
  await prisma.cli_sessions.updateMany({
    where: {
      userId,
      status: 'authorized'
    },
    data: {
      status: 'revoked',
      revokedAt: new Date()
    }
  });

  return { success: true };
}

/**
 * Track CLI usage
 */
export async function trackCliUsage(data: {
  sessionId: string;
  userId: string;
  requestType: string;
  model?: string;
  provider?: string;
  tokens?: number;
  cost?: number;
  duration?: number;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  metadata?: any;
}) {
  await prisma.cLIUsage.create({
    data: {
      ...data,
      timestamp: new Date()
    }
  });
}

/**
 * Get CLI usage statistics
 */
export async function getCliUsageStats(userId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const usage = await prisma.cLIUsage.findMany({
    where: {
      userId,
      timestamp: { gte: startDate }
    },
    orderBy: { timestamp: 'desc' }
  });

  const stats = {
    totalRequests: usage.length,
    successfulRequests: usage.filter(u => u.success).length,
    failedRequests: usage.filter(u => !u.success).length,
    totalTokens: usage.reduce((sum, u) => sum + (u.tokens || 0), 0),
    totalCost: usage.reduce((sum, u) => sum + (u.cost || 0), 0),
    avgDuration: usage.length > 0
      ? usage.reduce((sum, u) => sum + (u.duration || 0), 0) / usage.length
      : 0,
    byProvider: {} as Record<string, number>,
    byModel: {} as Record<string, number>,
    byRequestType: {} as Record<string, number>
  };

  // Group by provider
  usage.forEach(u => {
    if (u.provider) {
      stats.byProvider[u.provider] = (stats.byProvider[u.provider] || 0) + 1;
    }
    if (u.model) {
      stats.byModel[u.model] = (stats.byModel[u.model] || 0) + 1;
    }
    stats.byRequestType[u.requestType] = (stats.byRequestType[u.requestType] || 0) + 1;
  });

  return stats;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions() {
  const result = await prisma.cli_sessions.updateMany({
    where: {
      status: 'pending',
      expiresAt: { lt: new Date() }
    },
    data: {
      status: 'expired'
    }
  });

  return { expiredCount: result.count };
}
