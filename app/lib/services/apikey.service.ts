/**
 * ApiKeyService
 * API key management service
 */

import { prisma } from '@/lib/prisma';
import { generateSecureToken, encryptApiKey, decryptApiKey } from '../crypto';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export class ApiKeyService {
  /**
   * Create a new API key
   */
  async createKey(
    userId: string,
    name: string,
    permissions: string[] = [],
    expiresAt?: Date,
    rateLimit?: number
  ) {
    try {
      // Generate API key
      const keyString = `rck_${generateSecureToken()}`;
      const keyHash = crypto.createHash('sha256').update(keyString).digest('hex');
      const keyPrefix = keyString.substring(0, 12);

      // Create API key record
      const apiKey = await prisma.api_keys.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          keyHash,
          keyPrefix,
          name,
          permissions: permissions,
          expiresAt,
          isActive: true,
          updatedAt: new Date(),
        },
      });

      // Log API key creation
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'api_key_created',
          resource: 'api_key',
          resourceId: apiKey.id,
        },
      });

      // Return the full key only once
      return {
        apiKey: {
          id: apiKey.id,
          key: keyString, // Only returned once!
          keyPrefix: apiKey.keyPrefix,
          name: apiKey.name,
          permissions,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
        warning: 'Save this key securely. It will not be shown again.',
      };
    } catch (error) {
      logger.error('Create API key error', { error: String(error) });
      throw error;
    }
  }

  /**
   * List user's API keys
   */
  async listKeys(userId: string) {
    try {
      const keys = await prisma.api_keys.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          keyPrefix: true,
          name: true,
          permissions: true,
          isActive: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          usageCount: true,
        },
      });

      return {
        keys: keys.map((k) => ({
          ...k,
          masked: `${k.keyPrefix}...`,
        })),
      };
    } catch (error) {
      logger.error('List API keys error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get API key details
   */
  async getKey(id: string, userId: string) {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      return {
        key: {
          id: key.id,
          keyPrefix: key.keyPrefix,
          masked: `${key.keyPrefix}...`,
          name: key.name,
          scopes: key.permissions,
          isActive: key.isActive,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          usageCount: key.usageCount,
          rateLimit: key.rateLimit,
        },
      };
    } catch (error) {
      logger.error('Get API key error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Revoke an API key
   */
  async revokeKey(id: string, userId: string) {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      await prisma.api_keys.update({
        where: { id: key.id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Log revocation
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'api_key_revoked',
          resource: 'api_key',
          resourceId: key.id,
        },
      });

      return {
        message: 'API key revoked successfully',
      };
    } catch (error) {
      logger.error('Revoke API key error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Rotate an API key (create new, revoke old)
   */
  async rotateKey(id: string, userId: string) {
    try {
      const oldKey = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!oldKey) {
        throw new Error('API key not found');
      }

      // Create new key with same settings
      const newKey = await this.createKey(
        userId,
        oldKey.name,
        oldKey.permissions,
        oldKey.expiresAt || undefined
      );

      // Revoke old key
      await this.revokeKey(id, userId);

      // Log rotation
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'api_key_rotated',
          resource: 'api_key',
          metadata: { oldKeyId: id, newKeyId: newKey.apiKey.id },
        },
      });

      return {
        newKey: newKey.apiKey,
        message: 'API key rotated successfully. Old key has been revoked.',
      };
    } catch (error) {
      logger.error('Rotate API key error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Validate an API key
   */
  async validateKey(keyString: string) {
    try {
      const keyHash = crypto.createHash('sha256').update(keyString).digest('hex');

      const key = await prisma.api_keys.findFirst({
        where: { keyHash },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              subscriptionPlan: true,
              subscriptionStatus: true,
            },
          },
        },
      });

      if (!key) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (!key.isActive) {
        return { valid: false, error: 'API key has been revoked' };
      }

      if (key.expiresAt && key.expiresAt < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Update usage stats
      await prisma.api_keys.update({
        where: { id: key.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: key.usageCount + 1,
        },
      });

      return {
        valid: true,
        key: {
          id: key.id,
          userId: key.userId,
          scopes: key.permissions,
          rateLimit: key.rateLimit,
        },
        user: key.users,
      };
    } catch (error) {
      logger.error('Validate API key error', { error: String(error) });
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Get API key usage statistics
   */
  async getKeyUsage(id: string, userId: string, startDate: Date, endDate: Date) {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      // Get usage records for this key (would need to track keyId in UsageRecord)
      // For now, return basic stats
      const usage = {
        totalRequests: key.usageCount,
        lastUsed: key.lastUsedAt,
        createdAt: key.createdAt,
      };

      return {
        usage,
      };
    } catch (error) {
      logger.error('Get key usage error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Update API key permissions
   */
  async updateKeyPermissions(id: string, userId: string, permissions: string[]) {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      await prisma.api_keys.update({
        where: { id: key.id },
        data: {
          permissions: permissions,
        },
      });

      // Log permission update
      await prisma.audit_logs.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          action: 'api_key_permissions_updated',
          resource: 'api_key',
          resourceId: key.id,
          metadata: { permissions },
        },
      });

      return {
        message: 'Permissions updated successfully',
      };
    } catch (error) {
      logger.error('Update key permissions error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Set API key rate limit
   */
  async setKeyRateLimit(id: string, userId: string, limit: number) {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      await prisma.api_keys.update({
        where: { id: key.id },
        data: { rateLimit: limit },
      });

      return {
        message: 'Rate limit updated successfully',
      };
    } catch (error) {
      logger.error('Set key rate limit error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Update API key metadata
   */
  async updateKeyMetadata(
    id: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
    }
  ) {
    try {
      const key = await prisma.api_keys.findFirst({
        where: {
          id: id,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      await prisma.api_keys.update({
        where: { id: key.id },
        data,
      });

      return {
        message: 'API key updated successfully',
      };
    } catch (error) {
      logger.error('Update key metadata error', { error: String(error) });
      throw error;
    }
  }
}

// Export singleton instance
export const apiKeyService = new ApiKeyService();
