/**
 * User Service
 * Handles all user-related business logic including API key management
 */

import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { encryptApiKey, decryptApiKey } from '../utils/encryption';
import bcrypt from 'bcryptjs';

export interface CreateUserData {
  email: string;
  password?: string;
  name: string;
  avatar?: string;
  provider?: 'email' | 'github' | 'google' | 'discord';
  providerId?: string;
}

export interface UpdateUserData {
  name?: string;
  avatar?: string;
  openRouterApiKey?: string;
  preferredModels?: string[];
  onboardingStep?: string;
}

export class UserService {
  /**
   * Create a new user
   */
  async createUser(data: CreateUserData) {
    try {
      const { email, password, name, avatar, provider = 'email', providerId } = data;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        throw new Error('USER_EXISTS');
      }

      // Hash password if provided
      const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name: name.trim(),
          avatar,
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
          emailVerified: provider !== 'email', // Auto-verify for OAuth
          onboardingStep: 'pending_api_key', // Start onboarding
          createdAt: new Date(),
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          emailVerified: true,
          hasOwnApiKey: true,
          onboardingStep: true,
          createdAt: true
        }
      });

      // Create initial quota
      await this.createInitialQuota(user.id);

      logger.info('User created successfully', {
        userId: user.id,
        email: user.email,
        provider
      });

      return user;
    } catch (error) {
      logger.error('Failed to create user', { error, data });
      throw error;
    }
  }

  /**
   * Get user by ID with all necessary data
   */
  async getUserById(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          emailVerified: true,
          hasOwnApiKey: true,
          onboardingStep: true,
          preferredModels: true,
          routerEnabled: true,
          createdAt: true,
          lastLoginAt: true,
          quotas: {
            where: {
              periodEnd: { gte: new Date() }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      return user;
    } catch (error) {
      logger.error('Failed to get user', { error, userId });
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string) {
    try {
      return await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          avatar: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          emailVerified: true,
          hasOwnApiKey: true,
          onboardingStep: true,
          createdAt: true
        }
      });
    } catch (error) {
      logger.error('Failed to get user by email', { error, email });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, data: UpdateUserData) {
    try {
      const updateData: any = {
        updatedAt: new Date()
      };

      if (data.name) updateData.name = data.name.trim();
      if (data.avatar) updateData.avatar = data.avatar;
      if (data.preferredModels) updateData.preferredModels = data.preferredModels;
      if (data.onboardingStep) updateData.onboardingStep = data.onboardingStep;

      // Handle OpenRouter API key
      if (data.openRouterApiKey) {
        const encrypted = await encryptApiKey(data.openRouterApiKey);
        updateData.openRouterApiKey = encrypted;
        updateData.hasOwnApiKey = true;
        updateData.apiKeyEncrypted = true;
        
        // Complete onboarding if API key is added
        if (!updateData.onboardingStep) {
          updateData.onboardingStep = 'completed';
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          subscriptionPlan: true,
          hasOwnApiKey: true,
          onboardingStep: true,
          preferredModels: true,
          updatedAt: true
        }
      });

      logger.info('User updated successfully', {
        userId,
        updatedFields: Object.keys(updateData)
      });

      return user;
    } catch (error) {
      logger.error('Failed to update user', { error, userId });
      throw error;
    }
  }

  /**
   * Get decrypted OpenRouter API key for a user
   */
  async getUserApiKey(userId: string): Promise<string | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          openRouterApiKey: true,
          hasOwnApiKey: true,
          subscriptionPlan: true
        }
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Premium users use platform API keys
      if (user.subscriptionPlan !== 'free') {
        return await this.getPlatformApiKey();
      }

      // Free users must provide their own key
      if (!user.hasOwnApiKey || !user.openRouterApiKey) {
        throw new Error('API_KEY_REQUIRED');
      }

      // Decrypt user's API key
      const decrypted = await decryptApiKey(user.openRouterApiKey);
      return decrypted;
    } catch (error) {
      logger.error('Failed to get user API key', { error, userId });
      throw error;
    }
  }

  /**
   * Validate OpenRouter API key
   */
  async validateOpenRouterKey(apiKey: string): Promise<boolean> {
    try {
      // Make a simple API call to OpenRouter to validate the key
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to validate OpenRouter key', { error });
      return false;
    }
  }

  /**
   * Get platform API key for premium users (with load balancing)
   */
  private async getPlatformApiKey(): Promise<string> {
    try {
      // Get available platform API keys with load balancing
      const apiKey = await prisma.platformApiKey.findFirst({
        where: {
          provider: 'openrouter',
          isActive: true,
          quotaUsed: { lt: prisma.platformApiKey.fields.quotaLimit }
        },
        orderBy: [
          { priority: 'desc' },
          { quotaUsed: 'asc' }
        ]
      });

      if (!apiKey) {
        throw new Error('NO_PLATFORM_KEYS_AVAILABLE');
      }

      // Decrypt the key
      const decrypted = await decryptApiKey(apiKey.keyEncrypted);
      
      // Update last used timestamp
      await prisma.platformApiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() }
      });

      return decrypted;
    } catch (error) {
      logger.error('Failed to get platform API key', { error });
      throw error;
    }
  }

  /**
   * Create initial quota for new user
   */
  private async createInitialQuota(userId: string) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.userQuota.create({
      data: {
        userId,
        requestsLimit: 1000, // Free tier: 1000 requests/month
        requestsUsed: 0,
        tokensLimit: BigInt(1000000), // 1M tokens/month
        tokensUsed: BigInt(0),
        tokensUsedThisPeriod: BigInt(0),
        costThisPeriod: 0,
        periodStart: now,
        periodEnd,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now
      }
    });
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() }
      });
    } catch (error) {
      logger.error('Failed to update last login', { error, userId });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Delete user API key
   */
  async deleteUserApiKey(userId: string) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          openRouterApiKey: null,
          hasOwnApiKey: false,
          apiKeyEncrypted: false,
          onboardingStep: 'pending_api_key',
          updatedAt: new Date()
        }
      });

      logger.info('User API key deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user API key', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user has completed onboarding
   */
  async isOnboardingComplete(userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingStep: true, hasOwnApiKey: true, subscriptionPlan: true }
      });

      if (!user) return false;

      // Premium users don't need API key
      if (user.subscriptionPlan !== 'free') {
        return true;
      }

      // Free users need API key
      return user.hasOwnApiKey && user.onboardingStep === 'completed';
    } catch (error) {
      logger.error('Failed to check onboarding status', { error, userId });
      return false;
    }
  }
}

export const userService = new UserService();
