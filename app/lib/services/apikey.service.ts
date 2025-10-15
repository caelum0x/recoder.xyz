/**
 * ApiKeyService
 * API key management service
 */

import { PrismaClient } from '@prisma/client';
import { generateSecureToken, encryptApiKey, decryptApiKey } from '../crypto';
import crypto from 'crypto';

const prisma = new PrismaClient();

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
      const keyId = `key_${Date.now()}`;

      // Create API key record
      const apiKey = await prisma.apiKey.create({
        data: {
          userId,
          keyId,
          keyHash,
          keyPrefix,
          name,
          scopes: permissions,
          permissions: permissions.length > 0 ? { scopes: permissions } : null,
          expiresAt,
          rateLimit,
          isActive: true,
        },
      });

      // Log API key creation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'api_key_created',
          resource: 'api_key',
          resourceId: apiKey.id,
          success: true,
        },
      });

      // Return the full key only once
      return {
        success: true,
        apiKey: {
          id: apiKey.id,
          keyId: apiKey.keyId,
          key: keyString, // Only returned once!
          keyPrefix: apiKey.keyPrefix,
          name: apiKey.name,
          permissions,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
        warning: 'Save this key securely. It will not be shown again.',
      };
    } catch (error: any) {
      console.error('Create API key error:', error);
      throw error;
    }
  }

  /**
   * List user's API keys
   */
  async listKeys(userId: string) {
    try {
      const keys = await prisma.apiKey.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          keyId: true,
          keyPrefix: true,
          name: true,
          description: true,
          scopes: true,
          isActive: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          usageCount: true,
          rateLimit: true,
        },
      });

      return {
        success: true,
        keys: keys.map((k) => ({
          ...k,
          masked: `${k.keyPrefix}...`,
        })),
      };
    } catch (error: any) {
      console.error('List API keys error:', error);
      throw error;
    }
  }

  /**
   * Get API key details
   */
  async getKey(keyId: string, userId: string) {
    try {
      const key = await prisma.apiKey.findFirst({
        where: {
          keyId,
          userId,
        },
      });

      if (!key) {
        throw new Error('API key not found');
      }

      return {
        success: true,
        key: {
          id: key.id,
          keyId: key.keyId,
          keyPrefix: key.keyPrefix,
          masked: `${key.keyPrefix}...`,
          name: key.name,
          description: key.description,
          scopes: key.scopes,
          isActive: key.isActive,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          usageCount: key.usageCount,
          rateLimit: key.rateLimit,
        },
      };
    } catch (error: any) {
      console.error('Get API key error:', error);
      throw error;
    }
  }

  /**
   * Revoke an API key
   */
  async revokeKey(keyId: string, userId: string) {
    try {
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

      // Log revocation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'api_key_revoked',
          resource: 'api_key',
          resourceId: key.id,
          success: true,
        },
      });

      return {
        success: true,
        message: 'API key revoked successfully',
      };
    } catch (error: any) {
      console.error('Revoke API key error:', error);
      throw error;
    }
  }

  /**
   * Rotate an API key (create new, revoke old)
   */
  async rotateKey(keyId: string, userId: string) {
    try {
      const oldKey = await prisma.apiKey.findFirst({
        where: {
          keyId,
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
        oldKey.scopes,
        oldKey.expiresAt || undefined,
        oldKey.rateLimit || undefined
      );

      // Revoke old key
      await this.revokeKey(keyId, userId);

      // Log rotation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'api_key_rotated',
          metadata: { oldKeyId: keyId, newKeyId: newKey.apiKey.keyId },
          success: true,
        },
      });

      return {
        success: true,
        newKey: newKey.apiKey,
        message: 'API key rotated successfully. Old key has been revoked.',
      };
    } catch (error: any) {
      console.error('Rotate API key error:', error);
      throw error;
    }
  }

  /**
   * Validate an API key
   */
  async validateKey(keyString: string) {
    try {
      const keyHash = crypto.createHash('sha256').update(keyString).digest('hex');

      const key = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: {
          user: {
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
      await prisma.apiKey.update({
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
          keyId: key.keyId,
          userId: key.userId,
          scopes: key.scopes,
          rateLimit: key.rateLimit,
        },
        user: key.user,
      };
    } catch (error: any) {
      console.error('Validate API key error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Get API key usage statistics
   */
  async getKeyUsage(keyId: string, userId: string, startDate: Date, endDate: Date) {
    try {
      const key = await prisma.apiKey.findFirst({
        where: {
          keyId,
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
        success: true,
        usage,
      };
    } catch (error: any) {
      console.error('Get key usage error:', error);
      throw error;
    }
  }

  /**
   * Update API key permissions
   */
  async updateKeyPermissions(keyId: string, userId: string, permissions: string[]) {
    try {
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
          scopes: permissions,
          permissions: { scopes: permissions },
        },
      });

      // Log permission update
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'api_key_permissions_updated',
          resource: 'api_key',
          resourceId: key.id,
          metadata: { permissions },
          success: true,
        },
      });

      return {
        success: true,
        message: 'Permissions updated successfully',
      };
    } catch (error: any) {
      console.error('Update key permissions error:', error);
      throw error;
    }
  }

  /**
   * Set API key rate limit
   */
  async setKeyRateLimit(keyId: string, userId: string, limit: number) {
    try {
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
        data: { rateLimit: limit },
      });

      return {
        success: true,
        message: 'Rate limit updated successfully',
      };
    } catch (error: any) {
      console.error('Set key rate limit error:', error);
      throw error;
    }
  }

  /**
   * Update API key metadata
   */
  async updateKeyMetadata(
    keyId: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
    }
  ) {
    try {
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
        data,
      });

      return {
        success: true,
        message: 'API key updated successfully',
      };
    } catch (error: any) {
      console.error('Update key metadata error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiKeyService = new ApiKeyService();
