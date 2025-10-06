/**
 * Prisma Client for Recoder.xyz
 * Singleton pattern to prevent multiple instances
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Helper functions for common operations
export const prismaHelpers = {
  // User operations
  async findOrCreateUser(email: string, name: string, provider?: string) {
    let user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
          emailVerified: provider ? true : false,
        },
      });
      
      // Create initial quota
      await prisma.userQuota.create({
        data: {
          userId: user.id,
          requestsLimit: 1000,
          requestsUsed: 0,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
    
    return user;
  },

  // Auth Code operations
  async createAuthCode(userId: string, clientId: string, redirectUri: string, scope: string, state: string) {
    const code = `ac_${crypto.randomUUID()}`;
    
    await prisma.authCode.create({
      data: {
        code,
        userId,
        clientId,
        redirectUri,
        scope,
        state,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });
    
    return code;
  },

  async validateAuthCode(code: string) {
    const authCode = await prisma.authCode.findUnique({
      where: { code },
      include: { user: true },
    });
    
    if (!authCode || authCode.used || authCode.expiresAt < new Date()) {
      return null;
    }
    
    // Mark as used
    await prisma.authCode.update({
      where: { code },
      data: { used: true },
    });
    
    return authCode;
  },

  // Device Flow operations
  async createDeviceFlow(clientId: string, scope: string) {
    const deviceCode = `dc_${crypto.randomUUID()}`;
    const userCode = generateUserCode();
    
    const deviceFlow = await prisma.deviceCode.create({
      data: {
        deviceCode,
        userCode,
        clientId,
        scope,
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });
    
    return deviceFlow;
  },

  async authorizeDevice(userCode: string, userId: string) {
    const device = await prisma.deviceCode.findUnique({
      where: { userCode: userCode.toUpperCase() },
    });
    
    if (!device || device.expiresAt < new Date() || device.status !== 'pending') {
      return null;
    }
    
    return await prisma.deviceCode.update({
      where: { userCode: userCode.toUpperCase() },
      data: {
        userId,
        status: 'authorized',
        authorizedAt: new Date(),
      },
    });
  },

  async pollDeviceCode(deviceCode: string) {
    const device = await prisma.deviceCode.findUnique({
      where: { deviceCode },
      include: { user: true },
    });
    
    if (!device) return { status: 'invalid' };
    if (device.expiresAt < new Date()) return { status: 'expired' };
    if (device.status === 'denied') return { status: 'denied' };
    if (device.status === 'pending') return { status: 'pending' };
    
    // Authorized!
    return {
      status: 'authorized',
      userId: device.userId,
      user: device.user,
    };
  },

  // CLI Session operations
  async createCLISession(userId: string, deviceName?: string) {
    const accessToken = `rct_${crypto.randomUUID()}`;
    const refreshToken = `rcr_${crypto.randomUUID()}`;
    
    const session = await prisma.cLISession.create({
      data: {
        userId,
        deviceId: crypto.randomUUID(),
        deviceName: deviceName || 'CLI',
        deviceType: 'cli',
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
    
    return session;
  },

  async validateSession(token: string) {
    const session = await prisma.cLISession.findFirst({
      where: {
        OR: [
          { accessToken: token },
          { refreshToken: token },
        ],
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    
    if (session) {
      // Update last used
      await prisma.cLISession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }
    
    return session;
  },

  async refreshSession(refreshToken: string) {
    const session = await prisma.cLISession.findUnique({
      where: { refreshToken },
      include: { user: true },
    });
    
    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }
    
    const newAccessToken = `rct_${crypto.randomUUID()}`;
    
    return await prisma.cLISession.update({
      where: { id: session.id },
      data: {
        accessToken: newAccessToken,
        lastUsedAt: new Date(),
      },
      include: { user: true },
    });
  },

  // API Key operations
  async createApiKey(userId: string, name: string, scopes: string[]) {
    const keyId = `key_${crypto.randomUUID()}`;
    const apiKey = `rck_${crypto.randomUUID()}`;
    const keyHash = await hashApiKey(apiKey);
    
    await prisma.apiKey.create({
      data: {
        userId,
        keyId,
        keyHash,
        keyPrefix: apiKey.substring(0, 12),
        name,
        scopes,
      },
    });
    
    return { keyId, apiKey };
  },

  async validateApiKey(apiKey: string) {
    const keyHash = await hashApiKey(apiKey);
    
    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });
    
    if (!key || !key.isActive || (key.expiresAt && key.expiresAt < new Date())) {
      return null;
    }
    
    // Update usage
    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });
    
    return key;
  },

  // Usage tracking
  async recordUsage(userId: string, sessionId: string, requestType: string, metadata: any) {
    await prisma.usageRecord.create({
      data: {
        userId,
        sessionId,
        requestType,
        ...metadata,
      },
    });
  },

  // Cleanup expired records
  async cleanupExpired() {
    const now = new Date();
    
    // Delete expired auth codes
    await prisma.authCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { used: true, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    
    // Mark expired device codes
    await prisma.deviceCode.updateMany({
      where: {
        expiresAt: { lt: now },
        status: 'pending',
      },
      data: { status: 'expired' },
    });
    
    // Delete old completed device codes
    await prisma.deviceCode.deleteMany({
      where: {
        status: { in: ['completed', 'expired'] },
        createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    
    // Deactivate expired sessions
    await prisma.cLISession.updateMany({
      where: {
        expiresAt: { lt: now },
        isActive: true,
      },
      data: { isActive: false },
    });
  },
};

// Helper function to generate user-friendly device code
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

// Helper function to hash API keys
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default prisma;
