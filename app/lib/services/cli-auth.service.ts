import { prisma } from '../prisma';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

/**
 * CLI Authentication Service
 * Handles device code flow, token management, and API key operations for CLI
 */

// Constants
const DEVICE_CODE_LENGTH = 32;
const USER_CODE_LENGTH = 8;
const DEVICE_CODE_EXPIRY_MINUTES = 10;
const ACCESS_TOKEN_EXPIRY_DAYS = 90;
const REFRESH_TOKEN_EXPIRY_DAYS = 365;
const CLIENT_ID = 'recoder-cli';

// Generate random user code (e.g., "ABCD-1234")
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
  let code = '';
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Hash token for storage
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class CLIAuthService {
  /**
   * Step 1: Generate device code for CLI authentication
   * CLI calls this to start the auth flow
   */
  static async generateDeviceCode(clientId: string = CLIENT_ID) {
    const deviceCode = nanoid(DEVICE_CODE_LENGTH);
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_MINUTES * 60 * 1000);

    const record = await prisma.deviceCode.create({
      data: {
        deviceCode,
        userCode,
        clientId,
        status: 'pending',
        expiresAt,
      },
    });

    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${process.env.NEXTAUTH_URL}/cli/auth`,
      verification_uri_complete: `${process.env.NEXTAUTH_URL}/cli/auth?code=${userCode}`,
      expires_in: DEVICE_CODE_EXPIRY_MINUTES * 60,
      interval: 5, // Poll every 5 seconds
    };
  }

  /**
   * Step 2: User authorizes device code in browser
   * Web UI calls this when user confirms
   */
  static async authorizeDeviceCode(userCode: string, userId: string) {
    // Find pending device code
    const deviceCode = await prisma.deviceCode.findFirst({
      where: {
        userCode,
        status: 'pending',
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!deviceCode) {
      throw new Error('Invalid or expired user code');
    }

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlan: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Update device code status
    await prisma.deviceCode.update({
      where: { id: deviceCode.id },
      data: {
        status: 'authorized',
        userId: user.id,
        authorizedAt: new Date(),
        userData: user as any,
      },
    });

    return {
      success: true,
      user: {
        email: user.email,
        name: user.name,
        plan: user.subscriptionPlan,
      },
    };
  }

  /**
   * Step 3: CLI polls to check if authorized
   * Returns tokens once user authorizes
   */
  static async pollDeviceCode(deviceCode: string) {
    const record = await prisma.deviceCode.findUnique({
      where: { deviceCode },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            subscriptionPlan: true,
          },
        },
      },
    });

    if (!record) {
      throw new Error('Invalid device code');
    }

    // Check if expired
    if (record.expiresAt < new Date()) {
      await prisma.deviceCode.update({
        where: { id: record.id },
        data: { status: 'expired' },
      });
      throw new Error('Device code expired');
    }

    // Check status
    if (record.status === 'pending') {
      return {
        status: 'pending',
        message: 'Authorization pending',
      };
    }

    if (record.status === 'denied') {
      throw new Error('Authorization denied by user');
    }

    if (record.status === 'expired') {
      throw new Error('Device code expired');
    }

    if (record.status === 'authorized' && record.user) {
      // Generate access and refresh tokens
      const tokens = await this.createCLISession(
        record.user.id,
        deviceCode,
        'CLI Device Flow'
      );

      // Mark device code as completed
      await prisma.deviceCode.update({
        where: { id: record.id },
        data: { status: 'completed' },
      });

      return {
        status: 'authorized',
        ...tokens,
        user: {
          id: record.user.id,
          email: record.user.email,
          name: record.user.name,
          plan: record.user.subscriptionPlan,
        },
      };
    }

    throw new Error('Invalid device code status');
  }

  /**
   * Create CLI session with access/refresh tokens
   */
  static async createCLISession(
    userId: string,
    deviceId: string,
    deviceName: string,
    deviceType: string = 'cli'
  ) {
    const accessToken = `reco_${nanoid(48)}`;
    const refreshToken = `recr_${nanoid(48)}`;

    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.cLISession.create({
      data: {
        userId,
        deviceId,
        deviceName,
        deviceType,
        accessToken,
        refreshToken,
        expiresAt,
        isActive: true,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    };
  }

  /**
   * Validate access token
   */
  static async validateAccessToken(token: string) {
    const session = await prisma.cLISession.findUnique({
      where: { accessToken: token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            subscriptionPlan: true,
            subscriptionStatus: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Invalid access token');
    }

    if (!session.isActive) {
      throw new Error('Session has been revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new Error('Access token expired');
    }

    // Update last used
    await prisma.cLISession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      plan: session.user.subscriptionPlan,
      status: session.user.subscriptionStatus,
      sessionId: session.id,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(refreshToken: string) {
    const session = await prisma.cLISession.findUnique({
      where: { refreshToken },
    });

    if (!session || !session.isActive) {
      throw new Error('Invalid refresh token');
    }

    // Generate new access token
    const newAccessToken = `reco_${nanoid(48)}`;
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.cLISession.update({
      where: { id: session.id },
      data: {
        accessToken: newAccessToken,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    return {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    };
  }

  /**
   * Revoke CLI session
   */
  static async revokeSession(sessionId: string, userId: string) {
    const session = await prisma.cLISession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    await prisma.cLISession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * List user's CLI sessions
   */
  static async listUserSessions(userId: string) {
    const sessions = await prisma.cLISession.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        ipAddress: true,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });

    return sessions;
  }

  /**
   * Create API Key (long-lived authentication)
   */
  static async createApiKey(
    userId: string,
    name: string,
    description?: string,
    scopes: string[] = ['cli:full'],
    expiresAt?: Date
  ) {
    const keyId = `key_${nanoid(24)}`;
    const apiKey = `rk_${nanoid(48)}`;
    const keyHash = hashToken(apiKey);
    const keyPrefix = apiKey.substring(0, 12);

    await prisma.apiKey.create({
      data: {
        userId,
        keyId,
        keyHash,
        keyPrefix,
        name,
        description,
        scopes,
        expiresAt,
        isActive: true,
      },
    });

    // Return the full key only once
    return {
      keyId,
      apiKey, // Full key - only shown once
      keyPrefix,
      name,
      scopes,
      expiresAt,
      createdAt: new Date(),
    };
  }

  /**
   * Validate API Key
   */
  static async validateApiKey(apiKey: string) {
    const keyHash = hashToken(apiKey);

    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            subscriptionPlan: true,
            subscriptionStatus: true,
          },
        },
      },
    });

    if (!key) {
      throw new Error('Invalid API key');
    }

    if (!key.isActive) {
      throw new Error('API key has been revoked');
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new Error('API key expired');
    }

    // Update usage stats
    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });

    return {
      userId: key.user.id,
      email: key.user.email,
      name: key.user.name,
      plan: key.user.subscriptionPlan,
      status: key.user.subscriptionStatus,
      scopes: key.scopes,
      keyId: key.keyId,
    };
  }

  /**
   * List user's API keys
   */
  static async listApiKeys(userId: string) {
    const keys = await prisma.apiKey.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        keyId: true,
        keyPrefix: true,
        name: true,
        description: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        usageCount: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return keys;
  }

  /**
   * Revoke API key
   */
  static async revokeApiKey(keyId: string, userId: string) {
    const key = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId,
      },
    });

    if (!key) {
      throw new Error('API key not found');
    }

    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Deny device code authorization
   */
  static async denyDeviceCode(userCode: string) {
    const deviceCode = await prisma.deviceCode.findFirst({
      where: {
        userCode,
        status: 'pending',
      },
    });

    if (!deviceCode) {
      throw new Error('Invalid or already processed user code');
    }

    await prisma.deviceCode.update({
      where: { id: deviceCode.id },
      data: {
        status: 'denied',
        deniedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Get device code info (for display in web UI)
   */
  static async getDeviceCodeInfo(userCode: string) {
    const deviceCode = await prisma.deviceCode.findFirst({
      where: {
        userCode,
        status: 'pending',
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!deviceCode) {
      return null;
    }

    return {
      userCode: deviceCode.userCode,
      expiresAt: deviceCode.expiresAt,
      createdAt: deviceCode.createdAt,
    };
  }
}
