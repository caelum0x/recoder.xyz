/**
 * AuthService
 * Complete authentication service handling all auth operations
 * FIXED VERSION - Updated to use correct Prisma models (users, user_quota, verification, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword, generateSecureToken } from '../crypto';
import { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } from '../email';
import crypto from 'crypto';

const prisma = new PrismaClient();

export class AuthService {
  /**
   * Register a new user
   */
  async register(email: string, password: string, name: string, plan: string = 'free') {
    try {
      // Check if user already exists
      const existingUser = await prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await prisma.users.create({
        data: {
          id: crypto.randomUUID(),
          email,
          name,
          password: hashedPassword,
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
          emailVerified: false,
          updatedAt: new Date(),
        },
      });

      // Create user quota based on plan
      const quotaConfig = this.getQuotaConfig(plan);
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      await prisma.user_quota.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          sessionsPerDay: quotaConfig.sessionsPerDay,
          sessionsUsedToday: 0,
          tokensPerSession: quotaConfig.tokensPerSession,
          requestsLimit: quotaConfig.requestsLimit || 1000,
          requestsUsed: 0,
          periodStart: now,
          periodEnd: endOfDay,
          updatedAt: new Date(),
        },
      });

      // Create default user preferences
      await prisma.user_preferences.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          themePreferences: { theme: 'system' },
          notificationPreferences: {
            emailNotifications: true,
            usageAlerts: true,
          },
          updatedAt: new Date(),
        },
      });

      // Generate email verification token
      const verificationToken = generateSecureToken('verify');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await prisma.verification.create({
        data: {
          id: crypto.randomUUID(),
          identifier: user.email,
          value: verificationToken,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      // Send verification email
      await sendVerificationEmail(user.email, verificationToken).catch((err) =>
        console.error('Failed to send verification email:', err)
      );

      // Send welcome email
      await sendWelcomeEmail(user.email, user.name).catch((err) =>
        console.error('Failed to send welcome email:', err)
      );

      // Log registration
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          action: 'register',
          resource: 'user',
          resourceId: user.id,
          metadata: {},
        },
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        },
        message: 'Registration successful! Please check your email to verify your account.',
      };
    } catch (error: any) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    try {
      // Find user
      const user = await prisma.users.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        // Log failed login attempt
        await prisma.audit_logs.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            action: 'login_failed',
            resource: 'auth',
            ipAddress,
            userAgent,
            metadata: {},
          },
        });

        throw new Error('Invalid email or password');
      }

      // Check if email is verified
      if (!user.emailVerified) {
        throw new Error('Please verify your email before logging in');
      }

      // Update last login (if field exists in schema)
      await prisma.users.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      }).catch(() => {
        // If lastLoginAt doesn't exist, just update updatedAt
        prisma.users.update({
          where: { id: user.id },
          data: { updatedAt: new Date() },
        });
      });

      // Create session
      const sessionToken = generateSecureToken('session');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await prisma.sessions.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          token: sessionToken,
          ipAddress,
          userAgent,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      // Log successful login
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          action: 'login',
          resource: 'auth',
          ipAddress,
          userAgent,
          metadata: {},
        },
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.image,
          subscriptionPlan: user.subscriptionPlan,
        },
        sessionToken,
        expiresAt,
      };
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(sessionToken: string) {
    try {
      const session = await prisma.sessions.findUnique({
        where: { token: sessionToken },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Delete session
      await prisma.sessions.delete({
        where: { token: sessionToken },
      });

      // Log logout
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId: session.userId,
          action: 'logout',
          resource: 'auth',
          metadata: {},
        },
      });

      return { success: true, message: 'Logged out successfully' };
    } catch (error: any) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string) {
    try {
      const verification = await prisma.verification.findFirst({
        where: { value: token },
      });

      if (!verification) {
        throw new Error('Invalid verification token');
      }

      if (verification.expiresAt < new Date()) {
        throw new Error('Verification token expired');
      }

      // Find user by email
      const user = await prisma.users.findUnique({
        where: { email: verification.identifier },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Mark email as verified
      await prisma.users.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          updatedAt: new Date(),
        },
      });

      // Delete verification token
      await prisma.verification.delete({
        where: { id: verification.id },
      });

      // Log verification
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          action: 'email_verified',
          resource: 'auth',
          metadata: {},
        },
      });

      return {
        success: true,
        message: 'Email verified successfully!',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } catch (error: any) {
      console.error('Email verification error:', error);
      throw error;
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(userId: string) {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.emailVerified) {
        throw new Error('Email already verified');
      }

      // Generate new verification token
      const token = generateSecureToken('verify');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.verification.create({
        data: {
          id: crypto.randomUUID(),
          identifier: user.email,
          value: token,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      // Send email
      await sendVerificationEmail(user.email, token);

      return { success: true, message: 'Verification email sent' };
    } catch (error: any) {
      console.error('Send verification email error:', error);
      throw error;
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string) {
    try {
      const session = await prisma.sessions.findUnique({
        where: { token },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              subscriptionPlan: true,
              subscriptionStatus: true,
              emailVerified: true,
            },
          },
        },
      });

      if (!session) {
        throw new Error('Invalid session');
      }

      if (session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      // Update session
      await prisma.sessions.update({
        where: { token },
        data: { updatedAt: new Date() },
      });

      return {
        valid: true,
        user: session.users,
        session: {
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
        },
      };
    } catch (error: any) {
      console.error('Session validation error:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Refresh session (extend expiration)
   */
  async refreshSession(token: string) {
    try {
      const session = await prisma.sessions.findUnique({
        where: { token },
      });

      if (!session) {
        throw new Error('Invalid or expired session');
      }

      // Extend expiration by 30 days
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.sessions.update({
        where: { token },
        data: {
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        },
      });

      return { success: true, expiresAt: newExpiresAt };
    } catch (error: any) {
      console.error('Refresh session error:', error);
      throw error;
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(
    provider: string,
    profileId: string,
    email: string,
    name: string,
    avatar?: string
  ) {
    try {
      // Check if user exists
      let user = await prisma.users.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user from OAuth
        user = await prisma.users.create({
          data: {
            id: crypto.randomUUID(),
            email,
            name,
            image: avatar,
            emailVerified: true, // OAuth emails are pre-verified
            subscriptionPlan: 'free',
            subscriptionStatus: 'active',
            updatedAt: new Date(),
          },
        });

        // Create user quota
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        await prisma.user_quota.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            sessionsPerDay: 6,
            sessionsUsedToday: 0,
            tokensPerSession: 10000,
            periodStart: now,
            periodEnd: endOfDay,
            updatedAt: new Date(),
          },
        });

        // Create default preferences
        await prisma.user_preferences.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            updatedAt: new Date(),
          },
        });

        // Send welcome email
        await sendWelcomeEmail(user.email, user.name).catch((err) =>
          console.error('Failed to send welcome email:', err)
        );

        // Log new user from OAuth
        await prisma.audit_logs.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            action: 'oauth_register',
            resource: 'auth',
            metadata: { provider, profileId },
          },
        });
      } else {
        // Update last login
        await prisma.users.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          },
        }).catch(() => {
          // If lastLoginAt doesn't exist, just update updatedAt
          prisma.users.update({
            where: { id: user.id },
            data: { updatedAt: new Date() },
          });
        });

        // Log OAuth login
        await prisma.audit_logs.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            action: 'oauth_login',
            resource: 'auth',
            metadata: { provider, profileId },
          },
        });
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.image,
        },
      };
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Link OAuth account to existing user
   */
  async linkOAuthAccount(userId: string, provider: string, profileId: string) {
    try {
      // Create integration record
      await prisma.integrations.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          name: `${provider} Integration`,
          type: 'oauth',
          provider,
          config: { profileId },
          status: 'active',
          updatedAt: new Date(),
        },
      });

      // Log account linking
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'oauth_linked',
          resource: 'integrations',
          metadata: { provider, profileId },
        },
      });

      return { success: true, message: `${provider} account linked successfully` };
    } catch (error: any) {
      console.error('Link OAuth account error:', error);
      throw error;
    }
  }

  // Helper methods

  private getQuotaConfig(plan: string) {
    const configs: Record<string, any> = {
      free: {
        sessionsPerDay: 6,
        tokensPerSession: 10000,
        monthlyLimit: null,
      },
      weekly: {
        sessionsPerDay: 10,
        tokensPerSession: 30000,
        monthlyLimit: 5000,
      },
      monthly: {
        sessionsPerDay: 15,
        tokensPerSession: 50000,
        monthlyLimit: 10000,
      },
      pro: {
        sessionsPerDay: 20,
        tokensPerSession: 100000,
        monthlyLimit: 50000,
      },
      enterprise: {
        sessionsPerDay: 100,
        tokensPerSession: 500000,
        monthlyLimit: 500000,
      },
    };

    return configs[plan] || configs.free;
  }

  private extractDevice(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }

  private extractBrowser(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  }
}

// Export singleton instance
export const authService = new AuthService();
