import { prisma } from '../prisma';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

/**
 * Platform API Key Service
 * Generates and manages API keys for premium users to authenticate from CLI/external apps
 * Format: sk-recoder-{48 chars}
 */

interface ApiKeyUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  lastUsed: Date | null;
}

export class PlatformApiKeyService {
  /**
   * Generate a new API key for a premium user
   */
  static async generateApiKey(
    userId: string,
    name: string,
    description?: string,
    expiresAt?: Date
  ): Promise<{
    success: boolean;
    apiKey?: string;
    keyId?: string;
    message: string;
  }> {
    try {
      // Check if user is premium
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          subscriptionPlan: true,
          subscriptionStatus: true,
        },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Generate unique API key
      const apiKey = `sk-recoder-${nanoid(48)}`;
      const keyId = `key_${nanoid(24)}`;

      // Hash the key for storage
      const keyHash = this.hashKey(apiKey);
      const keyPrefix = apiKey.substring(0, 20); // Show "sk-recoder-abc123..."

      // Determine scopes based on plan
      const scopes = this.getScopesForPlan(user.subscriptionPlan);

      // Create API key record
      await prisma.api_keys.create({
        data: {
          userId,
          id: keyId,
          keyHash,
          keyPrefix,
          name,
          permissions: scopes,
          expiresAt,
          isActive: true,
          usageCount: 0,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        apiKey, // Only returned once!
        keyId: keyId,
        message: 'API key created successfully. Save it securely - you won\'t see it again!',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to generate API key',
      };
    }
  }

  /**
   * Validate and authenticate an API key
   */
  static async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    userId?: string;
    user?: {
      id: string;
      email: string;
      name: string;
      plan: string;
      status: string;
    };
    keyInfo?: {
      keyId: string;
      name: string;
      scopes: string[];
    };
    message?: string;
  }> {
    try {
      const keyHash = this.hashKey(apiKey);

      const key = await prisma.api_keys.findUnique({
        where: { keyHash },
        include: {
          users: {
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
        return { valid: false, message: 'Invalid API key' };
      }

      if (!key.isActive) {
        return { valid: false, message: 'API key has been revoked' };
      }

      if (key.expiresAt && key.expiresAt < new Date()) {
        return { valid: false, message: 'API key has expired' };
      }

      if (key.users.subscriptionStatus !== 'active') {
        return { valid: false, message: 'Subscription is not active' };
      }

      // Update last used timestamp and usage count
      await prisma.api_keys.update({
        where: { id: key.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });

      return {
        valid: true,
        userId: key.users.id,
        user: {
          id: key.users.id,
          email: key.users.email,
          name: key.users.name,
          plan: key.users.subscriptionPlan,
          status: key.users.subscriptionStatus,
        },
        keyInfo: {
          keyId: key.id,
          name: key.name,
          scopes: key.permissions,
        },
      };
    } catch (error: any) {
      return { valid: false, message: 'Validation error' };
    }
  }

  /**
   * List all API keys for a user
   */
  static async listUserApiKeys(userId: string) {
    try {
      const keys = await prisma.api_keys.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          id: true,
          keyPrefix: true,
          name: true,
          permissions: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          usageCount: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Ensure each key has safe defaults for all fields
      return keys.map(key => ({
        ...key,
        keyId: key.id,
        name: key.name || 'Unnamed Key',
        keyPrefix: key.keyPrefix || 'sk-recoder-***',
        scopes: Array.isArray(key.permissions) ? key.permissions : [],
        usageCount: key.usageCount ?? 0,
        lastUsedAt: key.lastUsedAt ?? null,
        expiresAt: key.expiresAt ?? null,
      }));
    } catch (error) {
      console.error('Failed to list API keys from database:', error);
      return [];
    }
  }

  /**
   * Get API key usage statistics
   */
  static async getKeyUsageStats(id: string, userId: string): Promise<ApiKeyUsageStats> {
    const key = await prisma.api_keys.findFirst({
      where: {
        id: id,
        userId,
      },
    });

    if (!key) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        lastUsed: null,
      };
    }

    // Get usage records for this key
    const usageRecords = await prisma.usage_records.findMany({
      where: {
        userId,
        // We need to track which key was used - add this to schema
        metadata: {
          path: ['keyId'],
          equals: id,
        },
      },
      select: {
        tokensUsed: true,
        cost: true,
        timestamp: true,
      },
    });

    const stats = usageRecords.reduce(
      (acc, record) => {
        acc.totalTokens += record.tokensUsed || 0;
        acc.totalCost += record.cost || 0;
        return acc;
      },
      { totalRequests: usageRecords.length, totalTokens: 0, totalCost: 0 }
    );

    return {
      ...stats,
      lastUsed: key.lastUsedAt,
    };
  }

  /**
   * Revoke an API key
   */
  static async revokeApiKey(id: string, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        return { success: false, message: 'API key not found' };
      }

      await prisma.api_keys.update({
        where: { id: key.id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      return { success: true, message: 'API key revoked successfully' };
    } catch (error: any) {
      return { success: false, message: 'Failed to revoke API key' };
    }
  }

  /**
   * Update API key name/description
   */
  static async updateApiKey(
    id: string,
    userId: string,
    updates: { name?: string }
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        return { success: false, message: 'API key not found' };
      }

      await prisma.api_keys.update({
        where: { id: key.id },
        data: updates,
      });

      return { success: true, message: 'API key updated successfully' };
    } catch (error: any) {
      return { success: false, message: 'Failed to update API key' };
    }
  }

  /**
   * Hash API key for secure storage
   */
  private static hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Get scopes based on user's plan
   */
  private static getScopesForPlan(plan: string): string[] {
    const scopesByPlan: Record<string, string[]> = {
      free: ['read'], // Free users can't have API keys
      weekly: ['read', 'write', 'ai:basic'],
      monthly: ['read', 'write', 'ai:basic', 'ai:advanced'],
      pro: ['read', 'write', 'ai:basic', 'ai:advanced', 'ai:premium', 'team'],
      enterprise: ['*'], // All permissions
    };

    return scopesByPlan[plan] || ['read'];
  }

  /**
   * Check if user can create more API keys
   */
  static async canCreateApiKey(userId: string): Promise<{
    canCreate: boolean;
    reason?: string;
    limit?: number;
    current?: number;
  }> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true },
    });

    if (!user) {
      return { canCreate: false, reason: 'User not found' };
    }

    // Set limits based on plan
    const limits: Record<string, number> = {
      free: 3,
      weekly: 5,
      monthly: 10,
      pro: 25,
      enterprise: 999,
    };

    const limit = limits[user.subscriptionPlan] || 0;

    const currentCount = await prisma.api_keys.count({
      where: {
        userId,
        isActive: true,
      },
    });

    if (currentCount >= limit) {
      return {
        canCreate: false,
        reason: `You have reached the maximum number of API keys for your plan (${limit})`,
        limit,
        current: currentCount,
      };
    }

    return {
      canCreate: true,
      limit,
      current: currentCount,
    };
  }
}
