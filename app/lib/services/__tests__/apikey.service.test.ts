// @vitest-environment node
/**
 * ApiKeyService Unit Tests
 * Tests API key CRUD operations, validation, rotation, and permissions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    api_keys: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    audit_logs: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({
  generateSecureToken: vi.fn(() => 'mock-secure-token-32chars-long'),
  encryptApiKey: vi.fn((key: string) => `encrypted:${key}`),
  decryptApiKey: vi.fn((key: string) => key.replace('encrypted:', '')),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { ApiKeyService } from '../apikey.service';

const mockPrisma = vi.mocked(prisma);

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ApiKeyService();
  });

  describe('createKey', () => {
    it('should create an API key with correct prefix and hash', async () => {
      const mockKey = {
        id: 'key-1',
        keyHash: 'hash',
        keyPrefix: 'rck_mock-sec',
        name: 'Test Key',
        permissions: ['read'],
        expiresAt: null,
        createdAt: new Date(),
      };

      mockPrisma.api_keys.create.mockResolvedValue(mockKey as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.createKey('user-1', 'Test Key', ['read']);

      expect(result.apiKey.key).toMatch(/^rck_/);
      expect(result.apiKey.name).toBe('Test Key');
      expect(result.warning).toContain('not be shown again');
      expect(mockPrisma.api_keys.create).toHaveBeenCalledOnce();
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'api_key_created',
            resource: 'api_key',
            userId: 'user-1',
          }),
        })
      );
    });

    it('should pass expiration date through', async () => {
      const expiresAt = new Date('2030-01-01');
      mockPrisma.api_keys.create.mockResolvedValue({
        id: 'key-2',
        keyPrefix: 'rck_mock-sec',
        name: 'Expiring Key',
        permissions: [],
        expiresAt,
        createdAt: new Date(),
      } as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.createKey('user-1', 'Expiring Key', [], expiresAt);
      expect(result.apiKey.expiresAt).toEqual(expiresAt);
    });
  });

  describe('listKeys', () => {
    it('should return masked keys for user', async () => {
      mockPrisma.api_keys.findMany.mockResolvedValue([
        {
          id: 'key-1',
          keyPrefix: 'rck_abc123',
          name: 'Key 1',
          permissions: ['read'],
          isActive: true,
          createdAt: new Date(),
          lastUsedAt: null,
          expiresAt: null,
          usageCount: 5,
        },
      ] as any);

      const result = await service.listKeys('user-1');

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0].masked).toBe('rck_abc123...');
      expect(mockPrisma.api_keys.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      );
    });

    it('should return empty array when no keys exist', async () => {
      mockPrisma.api_keys.findMany.mockResolvedValue([]);

      const result = await service.listKeys('user-no-keys');
      expect(result.keys).toHaveLength(0);
    });
  });

  describe('getKey', () => {
    it('should return key details for owner', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        keyPrefix: 'rck_abc123',
        name: 'My Key',
        permissions: ['read', 'write'],
        isActive: true,
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt: null,
        usageCount: 10,
        rateLimit: 100,
      } as any);

      const result = await service.getKey('key-1', 'user-1');

      expect(result.key.id).toBe('key-1');
      expect(result.key.masked).toBe('rck_abc123...');
      expect(result.key.scopes).toEqual(['read', 'write']);
    });

    it('should throw when key not found', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue(null);

      await expect(service.getKey('nonexistent', 'user-1')).rejects.toThrow('API key not found');
    });
  });

  describe('revokeKey', () => {
    it('should deactivate key and log audit', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({ id: 'key-1', userId: 'user-1' } as any);
      mockPrisma.api_keys.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.revokeKey('key-1', 'user-1');

      expect(result.message).toContain('revoked');
      expect(mockPrisma.api_keys.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'api_key_revoked' }),
        })
      );
    });

    it('should throw when key not found', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue(null);

      await expect(service.revokeKey('nonexistent', 'user-1')).rejects.toThrow('API key not found');
    });
  });

  describe('validateKey', () => {
    it('should validate active, non-expired key', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        isActive: true,
        expiresAt: new Date(Date.now() + 86400000),
        permissions: ['read'],
        rateLimit: 100,
        usageCount: 5,
        users: { id: 'user-1', email: 'test@example.com' },
      } as any);
      mockPrisma.api_keys.update.mockResolvedValue({} as any);

      const result = await service.validateKey('rck_test-key');

      expect(result.valid).toBe(true);
      expect(result.key?.userId).toBe('user-1');
      // Usage count should be incremented
      expect(mockPrisma.api_keys.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usageCount: 6 }),
        })
      );
    });

    it('should reject invalid key', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue(null);

      const result = await service.validateKey('rck_invalid');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should reject revoked key', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        isActive: false,
      } as any);

      const result = await service.validateKey('rck_revoked');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should reject expired key', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        isActive: true,
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
      } as any);

      const result = await service.validateKey('rck_expired');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('rotateKey', () => {
    it('should create new key and revoke old', async () => {
      const oldKey = {
        id: 'key-old',
        userId: 'user-1',
        name: 'Rotatable Key',
        permissions: ['read'],
        expiresAt: null,
      };

      // First call: rotateKey looks up old key
      // Second call: createKey looks up (via create)
      // Third call: revokeKey looks up old key
      mockPrisma.api_keys.findFirst
        .mockResolvedValueOnce(oldKey as any) // rotateKey lookup
        .mockResolvedValueOnce(oldKey as any); // revokeKey lookup

      mockPrisma.api_keys.create.mockResolvedValue({
        id: 'key-new',
        keyPrefix: 'rck_new-token',
        name: 'Rotatable Key',
        permissions: ['read'],
        expiresAt: null,
        createdAt: new Date(),
      } as any);
      mockPrisma.api_keys.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.rotateKey('key-old', 'user-1');

      expect(result.message).toContain('rotated');
      expect(result.newKey.name).toBe('Rotatable Key');
    });
  });

  describe('updateKeyPermissions', () => {
    it('should update permissions and log audit', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({ id: 'key-1' } as any);
      mockPrisma.api_keys.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.updateKeyPermissions('key-1', 'user-1', ['read', 'write', 'admin']);

      expect(result.message).toContain('updated');
      expect(mockPrisma.api_keys.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { permissions: ['read', 'write', 'admin'] },
        })
      );
    });
  });

  describe('setKeyRateLimit', () => {
    it('should update rate limit', async () => {
      mockPrisma.api_keys.findFirst.mockResolvedValue({ id: 'key-1' } as any);
      mockPrisma.api_keys.update.mockResolvedValue({} as any);

      const result = await service.setKeyRateLimit('key-1', 'user-1', 500);

      expect(result.message).toContain('Rate limit');
      expect(mockPrisma.api_keys.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rateLimit: 500 },
        })
      );
    });
  });
});
