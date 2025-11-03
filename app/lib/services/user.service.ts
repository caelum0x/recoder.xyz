/**
 * UserService
 * Complete user management service
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../crypto';

const prisma = new PrismaClient();

export class UserService {
  /**
   * Get user profile
   */
  async getProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          preferences: true,
          quota: true,
          subscription: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.image,
          image: user.image,
          bio: user.bio,
          company: user.company,
          website: user.website,
          timezone: user.timezone,
          locale: user.locale,
          subscriptionPlan: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          preferences: user.preferences,
          quota: user.quota,
          subscription: user.subscription,
        },
      };
    } catch (error: any) {
      console.error('Get profile error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: {
      name?: string;
      bio?: string;
      company?: string;
      website?: string;
      timezone?: string;
      locale?: string;
    }
  ) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data,
      });

      // Log profile update
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'profile_updated',
          metadata: data,
          success: true,
        },
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          bio: user.bio,
          company: user.company,
          website: user.website,
          timezone: user.timezone,
          locale: user.locale,
        },
      };
    } catch (error: any) {
      console.error('Update profile error:', error);
      throw error;
    }
  }

  /**
   * Upload/update avatar
   */
  async uploadAvatar(userId: string, avatarUrl: string) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { image: avatarUrl },
      });

      // Log avatar update
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'avatar_updated',
          success: true,
        },
      });

      return {
        success: true,
        avatar: user.image,
      };
    } catch (error: any) {
      console.error('Upload avatar error:', error);
      throw error;
    }
  }

  /**
   * Delete avatar
   */
  async deleteAvatar(userId: string) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { image: null },
      });

      // Log avatar deletion
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'avatar_deleted',
          success: true,
        },
      });

      return { success: true, message: 'Avatar deleted successfully' };
    } catch (error: any) {
      console.error('Delete avatar error:', error);
      throw error;
    }
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string) {
    try {
      let preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      // Create default preferences if they don't exist
      if (!preferences) {
        preferences = await prisma.userPreferences.create({
          data: { userId },
        });
      }

      return {
        success: true,
        preferences,
      };
    } catch (error: any) {
      console.error('Get preferences error:', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    data: {
      theme?: string;
      language?: string;
      timezone?: string;
      emailNotifications?: boolean;
      usageAlerts?: boolean;
      usageAlertThreshold?: number;
      billingNotifications?: boolean;
      securityNotifications?: boolean;
      productUpdates?: boolean;
      marketingEmails?: boolean;
      weeklyDigest?: boolean;
      monthlyReport?: boolean;
      slackNotifications?: boolean;
      slackWebhookUrl?: string;
    }
  ) {
    try {
      const preferences = await prisma.userPreferences.upsert({
        where: { userId },
        update: data,
        create: {
          userId,
          ...data,
        },
      });

      // Log preferences update
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'preferences_updated',
          metadata: data,
          success: true,
        },
      });

      return {
        success: true,
        preferences,
      };
    } catch (error: any) {
      console.error('Update preferences error:', error);
      throw error;
    }
  }

  /**
   * Delete user account
   */
  async deleteAccount(userId: string) {
    try {
      // Soft delete - just mark as deleted
      await prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          email: `deleted_${userId}@recoder.xyz`, // Free up email
        },
      });

      // Revoke all sessions
      await prisma.session.updateMany({
        where: { userId },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Revoke all API keys
      await prisma.apiKey.updateMany({
        where: { userId },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Log account deletion
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'account_deleted',
          success: true,
        },
      });

      return { success: true, message: 'Account deleted successfully' };
    } catch (error: any) {
      console.error('Delete account error:', error);
      throw error;
    }
  }

  /**
   * Export user data (GDPR compliance)
   */
  async exportUserData(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          preferences: true,
          quota: true,
          subscription: true,
          apiKeys: {
            select: {
              name: true,
              createdAt: true,
              lastUsedAt: true,
              usageCount: true,
            },
          },
          usageRecords: {
            take: 100,
            orderBy: { timestamp: 'desc' },
            select: {
              requestType: true,
              model: true,
              tokensUsed: true,
              cost: true,
              timestamp: true,
            },
          },
          auditLogs: {
            take: 100,
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Log data export
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'data_exported',
          success: true,
        },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error('Export user data error:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string) {
    try {
      // Get usage stats
      const usageStats = await prisma.usageRecord.aggregate({
        where: { userId },
        _sum: {
          tokensUsed: true,
          cost: true,
          requestCount: true,
        },
        _count: true,
      });

      // Get this month's usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyUsage = await prisma.usageRecord.aggregate({
        where: {
          userId,
          timestamp: { gte: startOfMonth },
        },
        _sum: {
          tokensUsed: true,
          cost: true,
          requestCount: true,
        },
      });

      // Get API key count
      const apiKeyCount = await prisma.apiKey.count({
        where: { userId, isActive: true },
      });

      // Get active sessions
      const activeSessions = await prisma.session.count({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      return {
        success: true,
        stats: {
          totalUsage: {
            tokens: usageStats._sum.tokensUsed || 0,
            cost: usageStats._sum.cost || 0,
            requests: usageStats._sum.requestCount || 0,
            sessions: usageStats._count || 0,
          },
          monthlyUsage: {
            tokens: monthlyUsage._sum.tokensUsed || 0,
            cost: monthlyUsage._sum.cost || 0,
            requests: monthlyUsage._sum.requestCount || 0,
          },
          apiKeys: apiKeyCount,
          activeSessions,
        },
      };
    } catch (error: any) {
      console.error('Get user stats error:', error);
      throw error;
    }
  }

  /**
   * List user sessions
   */
  async listSessions(userId: string) {
    try {
      const sessions = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return {
        success: true,
        sessions: sessions.map((s) => ({
          id: s.id,
          device: s.device,
          browser: s.browser,
          os: s.os,
          ipAddress: s.ipAddress,
          location: s.location,
          isActive: s.isActive,
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          expiresAt: s.expiresAt,
        })),
      };
    } catch (error: any) {
      console.error('List sessions error:', error);
      throw error;
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(userId: string, sessionId: string) {
    try {
      const session = await prisma.session.findFirst({
        where: {
          id: sessionId,
          userId,
        },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Log session revocation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'session_revoked',
          resourceId: sessionId,
          success: true,
        },
      });

      return { success: true, message: 'Session revoked successfully' };
    } catch (error: any) {
      console.error('Revoke session error:', error);
      throw error;
    }
  }

  /**
   * Change email address
   */
  async changeEmail(userId: string, newEmail: string, password: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.passwordHash) {
        throw new Error('User not found');
      }

      // Verify password
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new Error('Password is incorrect');
      }

      // Check if new email is already taken
      const existing = await prisma.user.findUnique({
        where: { email: newEmail },
      });

      if (existing) {
        throw new Error('Email already in use');
      }

      // Update email
      await prisma.user.update({
        where: { id: userId },
        data: {
          email: newEmail,
          emailVerified: false, // Require re-verification
        },
      });

      // Log email change
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'email_changed',
          metadata: { oldEmail: user.email, newEmail },
          success: true,
        },
      });

      return {
        success: true,
        message: 'Email changed successfully. Please verify your new email.',
      };
    } catch (error: any) {
      console.error('Change email error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const userService = new UserService();
