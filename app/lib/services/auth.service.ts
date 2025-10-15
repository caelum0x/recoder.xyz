/**
 * AuthService
 * Complete authentication service handling all auth operations
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword, generateSecureToken } from '../crypto';
import { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } from '../email';

const prisma = new PrismaClient();

export class AuthService {
  /**
   * Register a new user
   */
  async register(email: string, password: string, name: string, plan: string = 'free') {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
          emailVerified: false,
        },
      });

      // Create user quota based on plan
      const quotaConfig = this.getQuotaConfig(plan);
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      await prisma.userQuota.create({
        data: {
          userId: user.id,
          sessionsPerDay: quotaConfig.sessionsPerDay,
          sessionsUsedToday: 0,
          tokensPerSession: quotaConfig.tokensPerSession,
          monthlyLimit: quotaConfig.monthlyLimit,
          monthlyUsed: 0,
          periodStart: now,
          periodEnd: endOfDay,
        },
      });

      // Create default user preferences
      await prisma.userPreferences.create({
        data: {
          userId: user.id,
          theme: 'system',
          emailNotifications: true,
          usageAlerts: true,
        },
      });

      // Generate email verification token
      const verificationToken = generateSecureToken('verify');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await prisma.emailVerification.create({
        data: {
          userId: user.id,
          email: user.email,
          token: verificationToken,
          expiresAt,
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
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'register',
          resource: 'user',
          resourceId: user.id,
          success: true,
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
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          preferences: true,
        },
      });

      if (!user || !user.passwordHash) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        // Log failed login attempt
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'login_failed',
            ipAddress,
            userAgent,
            success: false,
          },
        });

        throw new Error('Invalid email or password');
      }

      // Check if email is verified
      if (!user.emailVerified) {
        throw new Error('Please verify your email before logging in');
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Create session
      const sessionToken = generateSecureToken('session');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await prisma.session.create({
        data: {
          userId: user.id,
          token: sessionToken,
          ipAddress,
          device: this.extractDevice(userAgent),
          browser: this.extractBrowser(userAgent),
          expiresAt,
        },
      });

      // Log successful login
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'login',
          ipAddress,
          userAgent,
          success: true,
        },
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
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
      const session = await prisma.session.findUnique({
        where: { token: sessionToken },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Revoke session
      await prisma.session.update({
        where: { token: sessionToken },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Log logout
      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: 'logout',
          success: true,
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
      const verification = await prisma.emailVerification.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!verification) {
        throw new Error('Invalid verification token');
      }

      if (verification.used) {
        throw new Error('Verification token already used');
      }

      if (verification.expiresAt < new Date()) {
        throw new Error('Verification token expired');
      }

      // Mark email as verified
      await prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerified: true },
      });

      // Mark verification as used
      await prisma.emailVerification.update({
        where: { token },
        data: {
          used: true,
          usedAt: new Date(),
        },
      });

      // Log verification
      await prisma.auditLog.create({
        data: {
          userId: verification.userId,
          action: 'email_verified',
          success: true,
        },
      });

      return {
        success: true,
        message: 'Email verified successfully!',
        user: {
          id: verification.user.id,
          email: verification.user.email,
          name: verification.user.name,
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
      const user = await prisma.user.findUnique({
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

      await prisma.emailVerification.create({
        data: {
          userId: user.id,
          email: user.email,
          token,
          expiresAt,
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
   * Request password reset
   */
  async requestPasswordReset(email: string, ipAddress?: string, userAgent?: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists
        return { success: true, message: 'If the email exists, a reset link has been sent' };
      }

      // Generate reset token
      const token = generateSecureToken('reset');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
          ipAddress,
          userAgent,
        },
      });

      // Send reset email
      await sendPasswordResetEmail(user.email, token);

      // Log password reset request
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'password_reset_requested',
          ipAddress,
          userAgent,
          success: true,
        },
      });

      return { success: true, message: 'If the email exists, a reset link has been sent' };
    } catch (error: any) {
      console.error('Password reset request error:', error);
      throw error;
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    try {
      const reset = await prisma.passwordReset.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!reset) {
        throw new Error('Invalid reset token');
      }

      if (reset.used) {
        throw new Error('Reset token already used');
      }

      if (reset.expiresAt < new Date()) {
        throw new Error('Reset token expired');
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });

      // Mark reset as used
      await prisma.passwordReset.update({
        where: { token },
        data: {
          used: true,
          usedAt: new Date(),
        },
      });

      // Revoke all active sessions for security
      await prisma.session.updateMany({
        where: {
          userId: reset.userId,
          isActive: true,
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Log password reset
      await prisma.auditLog.create({
        data: {
          userId: reset.userId,
          action: 'password_reset',
          success: true,
        },
      });

      return { success: true, message: 'Password reset successfully' };
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  /**
   * Change password (for logged-in users)
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.passwordHash) {
        throw new Error('User not found');
      }

      // Verify old password
      const isValid = await verifyPassword(oldPassword, user.passwordHash);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Log password change
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'password_changed',
          success: true,
        },
      });

      return { success: true, message: 'Password changed successfully' };
    } catch (error: any) {
      console.error('Change password error:', error);
      throw error;
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string) {
    try {
      const session = await prisma.session.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
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

      if (!session.isActive) {
        throw new Error('Session expired or revoked');
      }

      if (session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      // Update last active time
      await prisma.session.update({
        where: { token },
        data: { lastActiveAt: new Date() },
      });

      return {
        valid: true,
        user: session.user,
        session: {
          device: session.device,
          browser: session.browser,
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
      const session = await prisma.session.findUnique({
        where: { token },
      });

      if (!session || !session.isActive) {
        throw new Error('Invalid or expired session');
      }

      // Extend expiration by 30 days
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.session.update({
        where: { token },
        data: {
          expiresAt: newExpiresAt,
          lastActiveAt: new Date(),
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
      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user from OAuth
        user = await prisma.user.create({
          data: {
            email,
            name,
            image: avatar,
            emailVerified: true, // OAuth emails are pre-verified
            subscriptionPlan: 'free',
            subscriptionStatus: 'active',
          },
        });

        // Create user quota
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        await prisma.userQuota.create({
          data: {
            userId: user.id,
            sessionsPerDay: 6,
            sessionsUsedToday: 0,
            tokensPerSession: 10000,
            periodStart: now,
            periodEnd: endOfDay,
          },
        });

        // Create default preferences
        await prisma.userPreferences.create({
          data: {
            userId: user.id,
          },
        });

        // Send welcome email
        await sendWelcomeEmail(user.email, user.name).catch((err) =>
          console.error('Failed to send welcome email:', err)
        );

        // Log new user from OAuth
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'oauth_register',
            metadata: { provider, profileId },
            success: true,
          },
        });
      } else {
        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // Log OAuth login
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'oauth_login',
            metadata: { provider, profileId },
            success: true,
          },
        });
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.image || user.avatar,
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
      await prisma.integration.create({
        data: {
          userId,
          provider,
          providerId: profileId,
          isActive: true,
        },
      });

      // Log account linking
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'oauth_linked',
          metadata: { provider, profileId },
          success: true,
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
