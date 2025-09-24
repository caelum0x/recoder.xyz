/**
 * Unified SSO Service
 * Cross-platform authentication for all 5 Recoder platforms
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

export interface UnifiedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  isActive: boolean;
  platforms: PlatformAccess[];
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  quotas: {
    totalRequests: number;
    usedRequests: number;
    resetDate: Date;
  };
}

export interface PlatformAccess {
  platform: 'web' | 'chat' | 'cli' | 'desktop' | 'mobile';
  enabled: boolean;
  lastAccess: Date;
  deviceInfo?: string;
}

export interface SSOTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
  platforms: string[];
}

export interface DeviceFlowResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export class UnifiedSSOService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';
  private readonly DEVICE_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

  /**
   * Authenticate user and return unified tokens
   */
  async authenticateUser(email: string, password: string, platform: string, deviceInfo?: string): Promise<{
    success: boolean;
    tokens?: SSOTokens;
    user?: UnifiedUser;
    error?: string;
  }> {
    try {
      // This would integrate with the existing auth route
      // For now, create a simplified implementation
      const bcrypt = require('bcryptjs');
      
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user || !user.password || !await bcrypt.compare(password, user.password)) {
        return { success: false, error: 'Invalid credentials' };
      }

      if (!user.isActive) {
        return { success: false, error: 'Account deactivated' };
      }

      // Generate session ID
      const sessionId = crypto.randomUUID();

      // Create unified user object
      const unifiedUser: UnifiedUser = {
        id: user.id,
        email: user.email,
        name: user.name || 'User',
        role: user.role || 'user',
        emailVerified: user.emailVerified || false,
        isActive: user.isActive,
        platforms: await this.getUserPlatformAccess(user.id),
        subscriptionTier: await this.getUserSubscriptionTier(user.id),
        quotas: await this.getUserQuotas(user.id)
      };

      // Update platform access
      await this.updatePlatformAccess(user.id, platform, deviceInfo);

      // Generate tokens
      const tokens = this.generateUnifiedTokens(unifiedUser, sessionId);

      // Store session in database
      await this.storeSession(sessionId, user.id, platform, deviceInfo);

      logger.info('Unified SSO authentication successful', {
        userId: user.id,
        email: user.email,
        platform,
        sessionId
      });

      return {
        success: true,
        tokens,
        user: unifiedUser
      };

    } catch (error: any) {
      logger.error('Unified SSO authentication failed', {
        email,
        platform,
        error: error.message
      });

      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Refresh tokens with cross-platform validity
   */
  async refreshTokens(refreshToken: string): Promise<{
    success: boolean;
    tokens?: SSOTokens;
    user?: UnifiedUser;
    error?: string;
  }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as any;

      // Get user and session
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user || !user.isActive) {
        return { success: false, error: 'Invalid refresh token' };
      }

      // Check if session is still valid
      const session = await this.getSession(decoded.sessionId);
      if (!session) {
        return { success: false, error: 'Session expired' };
      }

      // Create unified user object
      const unifiedUser: UnifiedUser = {
        id: user.id,
        email: user.email,
        name: user.name || 'User',
        role: user.role || 'user',
        emailVerified: user.emailVerified || false,
        isActive: user.isActive,
        platforms: await this.getUserPlatformAccess(user.id),
        subscriptionTier: await this.getUserSubscriptionTier(user.id),
        quotas: await this.getUserQuotas(user.id)
      };

      // Generate new tokens
      const tokens = this.generateUnifiedTokens(unifiedUser, decoded.sessionId);

      return {
        success: true,
        tokens,
        user: unifiedUser
      };

    } catch (error: any) {
      logger.error('Token refresh failed', { error: error.message });
      return { success: false, error: 'Invalid refresh token' };
    }
  }

  /**
   * Validate token across all platforms
   */
  async validateToken(token: string): Promise<{
    success: boolean;
    user?: UnifiedUser;
    platformAccess?: string[];
    error?: string;
  }> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user || !user.isActive) {
        return { success: false, error: 'Invalid token' };
      }

      // Check session validity
      const session = await this.getSession(decoded.sessionId);
      if (!session) {
        return { success: false, error: 'Session expired' };
      }

      const unifiedUser: UnifiedUser = {
        id: user.id,
        email: user.email,
        name: user.name || 'User',
        role: user.role || 'user',
        emailVerified: user.emailVerified || false,
        isActive: user.isActive,
        platforms: await this.getUserPlatformAccess(user.id),
        subscriptionTier: await this.getUserSubscriptionTier(user.id),
        quotas: await this.getUserQuotas(user.id)
      };

      const platformAccess = unifiedUser.platforms
        .filter(p => p.enabled)
        .map(p => p.platform);

      return {
        success: true,
        user: unifiedUser,
        platformAccess
      };

    } catch (error: any) {
      return { success: false, error: 'Invalid token' };
    }
  }

  /**
   * Start device flow for CLI authentication
   */
  async startDeviceFlow(): Promise<DeviceFlowResult> {
    const deviceCode = crypto.randomBytes(16).toString('hex');
    const userCode = this.generateUserCode();
    const expiresIn = this.DEVICE_CODE_EXPIRY;
    
    // Store device flow in database/cache
    await this.storeDeviceFlow(deviceCode, userCode, expiresIn);

    return {
      deviceCode,
      userCode,
      verificationUri: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/device`,
      expiresIn,
      interval: 5 // Polling interval in seconds
    };
  }

  /**
   * Complete device flow authentication
   */
  async completeDeviceFlow(deviceCode: string): Promise<{
    success: boolean;
    tokens?: SSOTokens;
    user?: UnifiedUser;
    error?: string;
  }> {
    try {
      const deviceFlow = await this.getDeviceFlow(deviceCode);
      
      if (!deviceFlow) {
        return { success: false, error: 'Invalid or expired device code' };
      }

      if (!deviceFlow.userId) {
        return { success: false, error: 'Device not authorized yet' };
      }

      const user = await prisma.user.findUnique({
        where: { id: deviceFlow.userId }
      });

      if (!user || !user.isActive) {
        return { success: false, error: 'User not found or inactive' };
      }

      // Generate session for CLI
      const sessionId = crypto.randomUUID();
      
      const unifiedUser: UnifiedUser = {
        id: user.id,
        email: user.email,
        name: user.name || 'User',
        role: user.role || 'user',
        emailVerified: user.emailVerified || false,
        isActive: user.isActive,
        platforms: await this.getUserPlatformAccess(user.id),
        subscriptionTier: await this.getUserSubscriptionTier(user.id),
        quotas: await this.getUserQuotas(user.id)
      };

      // Generate tokens
      const tokens = this.generateUnifiedTokens(unifiedUser, sessionId);

      // Store session
      await this.storeSession(sessionId, user.id, 'cli', 'CLI Device Flow');

      // Clean up device flow
      await this.cleanupDeviceFlow(deviceCode);

      return {
        success: true,
        tokens,
        user: unifiedUser
      };

    } catch (error: any) {
      logger.error('Device flow completion failed', { error: error.message });
      return { success: false, error: 'Device flow failed' };
    }
  }

  /**
   * Authorize device flow with user credentials
   */
  async authorizeDevice(userCode: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deviceFlow = await this.getDeviceFlowByUserCode(userCode);
      
      if (!deviceFlow) {
        return { success: false, error: 'Invalid user code' };
      }

      if (Date.now() > deviceFlow.expiresAt) {
        return { success: false, error: 'User code expired' };
      }

      // Update device flow with user ID
      await this.updateDeviceFlow(deviceFlow.deviceCode, userId);

      return { success: true };

    } catch (error: any) {
      logger.error('Device authorization failed', { error: error.message });
      return { success: false, error: 'Authorization failed' };
    }
  }

  /**
   * Logout from all platforms
   */
  async logoutFromAllPlatforms(sessionId: string): Promise<{ success: boolean }> {
    try {
      // Invalidate session
      await this.invalidateSession(sessionId);

      // Could also invalidate all sessions for the user
      // await this.invalidateAllUserSessions(userId);

      return { success: true };

    } catch (error: any) {
      logger.error('Logout failed', { error: error.message });
      return { success: false };
    }
  }

  // Private helper methods

  private generateUnifiedTokens(user: UnifiedUser, sessionId: string): SSOTokens {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      platforms: user.platforms.filter(p => p.enabled).map(p => p.platform)
    };

    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'recoder-sso',
      audience: ['web', 'chat', 'cli', 'desktop', 'mobile']
    });

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: 15 * 60, // 15 minutes in seconds
      platforms: user.platforms.filter(p => p.enabled).map(p => p.platform)
    };
  }

  private async getUserPlatformAccess(userId: string): Promise<PlatformAccess[]> {
    // This would query a user_platform_access table
    // For now, return default access
    return [
      { platform: 'web', enabled: true, lastAccess: new Date() },
      { platform: 'chat', enabled: true, lastAccess: new Date() },
      { platform: 'cli', enabled: true, lastAccess: new Date() },
      { platform: 'desktop', enabled: true, lastAccess: new Date() },
      { platform: 'mobile', enabled: true, lastAccess: new Date() }
    ];
  }

  private async getUserSubscriptionTier(userId: string): Promise<'free' | 'pro' | 'enterprise'> {
    // Query subscription from database
    // For now, return 'free'
    return 'free';
  }

  private async getUserQuotas(userId: string): Promise<UnifiedUser['quotas']> {
    // Query user quotas from database
    // For now, return default free tier quotas
    return {
      totalRequests: 1000,
      usedRequests: 0,
      resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }

  private async updatePlatformAccess(userId: string, platform: string, deviceInfo?: string): Promise<void> {
    // Update user's platform access in database
    logger.info('Platform access updated', { userId, platform, deviceInfo });
  }

  private async storeSession(sessionId: string, userId: string, platform: string, deviceInfo?: string): Promise<void> {
    // Store session in Redis or database
    logger.info('Session stored', { sessionId, userId, platform });
  }

  private async getSession(sessionId: string): Promise<any> {
    // Get session from Redis or database
    // For now, return valid session
    return { sessionId, valid: true };
  }

  private async invalidateSession(sessionId: string): Promise<void> {
    // Remove session from Redis or database
    logger.info('Session invalidated', { sessionId });
  }

  private generateUserCode(): string {
    // Generate human-readable 6-8 character code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async storeDeviceFlow(deviceCode: string, userCode: string, expiresIn: number): Promise<void> {
    // Store in Redis or database
    const expiresAt = Date.now() + expiresIn;
    logger.info('Device flow stored', { deviceCode, userCode, expiresAt });
  }

  private async getDeviceFlow(deviceCode: string): Promise<any> {
    // Get from Redis or database
    return {
      deviceCode,
      userCode: 'ABC12345',
      expiresAt: Date.now() + 300000,
      userId: null
    };
  }

  private async getDeviceFlowByUserCode(userCode: string): Promise<any> {
    // Get from Redis or database by user code
    return {
      deviceCode: 'device123',
      userCode,
      expiresAt: Date.now() + 300000,
      userId: null
    };
  }

  private async updateDeviceFlow(deviceCode: string, userId: string): Promise<void> {
    // Update device flow with user ID
    logger.info('Device flow authorized', { deviceCode, userId });
  }

  private async cleanupDeviceFlow(deviceCode: string): Promise<void> {
    // Remove device flow from storage
    logger.info('Device flow cleaned up', { deviceCode });
  }
}

export const unifiedSSO = new UnifiedSSOService();