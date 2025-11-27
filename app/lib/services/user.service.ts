/**
 * UserService
 * Complete user management service
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../crypto';
import crypto from 'crypto';

const prisma = new PrismaClient();

export class UserService {
  /**
   * Get user profile
   */
  async getProfile(userId: string) {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        include: {
          user_preferences: true,
          quota: true,
          subscriptions: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.image,
          image: user.image,
          organization: user.organization,
          subscriptionPlan: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          preferences: user.user_preferences,
          quota: user.quota,
          subscription: user.subscriptions[0] || null,
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
      organization?: string;
      image?: string;
    }
  ) {
    try {
      const user = await prisma.users.update({
        where: { id: userId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      // Log profile update
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'profile_updated',
          resource: 'user',
          metadata: data,
        },
      });

      return {
        user: {
          id: user.id,
          name: user.name,
          organization: user.organization,
          image: user.image,
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
      const user = await prisma.users.update({
        where: { id: userId },
        data: { image: avatarUrl },
      });

      // Log avatar update
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'avatar_updated',
          resource: 'user',
        },
      });

      return {
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
      await prisma.users.update({
        where: { id: userId },
        data: { image: null },
      });

      // Log avatar deletion
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'avatar_deleted',
          resource: 'user',
        },
      });

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
      let preferences = await prisma.user_preferences.findUnique({
        where: { userId },
      });

      // Create default preferences if they don't exist
      if (!preferences) {
        preferences = await prisma.user_preferences.create({
          data: { 
            id: crypto.randomUUID(),
            userId,
            updatedAt: new Date()
          },
        });
      }

      return {
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
      const preferences = await prisma.user_preferences.upsert({
        where: { userId },
        update: {
          themePreferences: data.theme ? { theme: data.theme } : undefined,
          languagePreferences: data.language ? { language: data.language } : undefined,
          notificationPreferences: {
            emailNotifications: data.emailNotifications,
            usageAlerts: data.usageAlerts,
            billingNotifications: data.billingNotifications,
            securityNotifications: data.securityNotifications,
            productUpdates: data.productUpdates,
            marketingEmails: data.marketingEmails,
            weeklyDigest: data.weeklyDigest,
            monthlyReport: data.monthlyReport,
            slackNotifications: data.slackNotifications,
            slackWebhookUrl: data.slackWebhookUrl
          },
          updatedAt: new Date()
        },
        create: {
          id: crypto.randomUUID(),
          userId,
          themePreferences: data.theme ? { theme: data.theme } : {},
          languagePreferences: data.language ? { language: data.language } : {},
          notificationPreferences: {
            emailNotifications: data.emailNotifications || false,
            usageAlerts: data.usageAlerts || false,
            billingNotifications: data.billingNotifications || true,
            securityNotifications: data.securityNotifications || true,
            productUpdates: data.productUpdates || true,
            marketingEmails: data.marketingEmails || false,
            weeklyDigest: data.weeklyDigest || false,
            monthlyReport: data.monthlyReport || false,
            slackNotifications: data.slackNotifications || false,
            slackWebhookUrl: data.slackWebhookUrl
          },
          updatedAt: new Date()
        },
      });

      // Log preferences update
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'preferences_updated',
          resource: 'user',
          metadata: data,
        },
      });

      return {
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
      // Soft delete - just mark as inactive and anonymize
      await prisma.users.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@recoder.xyz`, // Free up email
          isActive: false,
          updatedAt: new Date()
        },
      });

      // Revoke all sessions
      await prisma.sessions.updateMany({
        where: { userId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Revoke all API keys
      await prisma.api_keys.updateMany({
        where: { userId },
        data: {
          isActive: false,
          updatedAt: new Date()
        },
      });

      // Log account deletion
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'account_deleted',
          resource: 'user',
        },
      });

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
      const user = await prisma.users.findUnique({
        where: { id: userId },
        include: {
          user_preferences: true,
          quota: true,
          subscriptions: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          api_keys: {
            select: {
              name: true,
              createdAt: true,
              lastUsedAt: true,
              usageCount: true,
            },
          },
          usage_records: {
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
          audit_logs: {
            take: 100,
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Log data export
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'data_exported',
          resource: 'user',
        },
      });

      return {
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
      const usageStats = await prisma.usage_records.aggregate({
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

      const monthlyUsage = await prisma.usage_records.aggregate({
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
      const apiKeyCount = await prisma.api_keys.count({
        where: { userId, isActive: true },
      });

      // Get active sessions
      const activeSessions = await prisma.sessions.count({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      return {
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
      const sessions = await prisma.sessions.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          device: s.device,
          browser: s.browser,
          os: s.os,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          location: s.location,
          isActive: s.isActive,
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          updatedAt: s.updatedAt,
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
      const session = await prisma.sessions.findFirst({
        where: {
          id: sessionId,
          userId,
        },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      await prisma.sessions.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Log session revocation
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'session_revoked',
          resource: 'session',
          resourceId: sessionId,
        },
      });

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
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user || !user.password) {
        throw new Error('User not found');
      }

      // Verify password
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new Error('Password is incorrect');
      }

      // Check if new email is already taken
      const existing = await prisma.users.findUnique({
        where: { email: newEmail },
      });

      if (existing) {
        throw new Error('Email already in use');
      }

      // Update email
      await prisma.users.update({
        where: { id: userId },
        data: {
          email: newEmail,
          emailVerified: false, // Require re-verification
        },
      });

      // Log email change
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'email_changed',
          resource: 'user',
          metadata: { oldEmail: user.email, newEmail },
        },
      });

      return {
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
