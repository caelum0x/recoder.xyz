// @vitest-environment node
/**
 * UserService Unit Tests
 * Tests profile CRUD, preferences, sessions, account deletion, GDPR export, email change.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user_preferences: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    sessions: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    api_keys: {
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    usage_records: {
      aggregate: vi.fn(),
    },
    audit_logs: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock bcryptjs (used in changeEmail)
vi.mock('bcryptjs', () => ({
  compare: vi.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
}));

import { prisma } from '@/lib/prisma';
import { UserService } from '../user.service';

const mockPrisma = vi.mocked(prisma);

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService();
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://avatar.url',
        organization: 'Acme',
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      } as any);

      const result = await service.getProfile('user-1');

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.user.avatar).toBe('https://avatar.url');
      expect(result.user.organization).toBe('Acme');
    });

    it('should throw for nonexistent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('should update profile and log audit', async () => {
      mockPrisma.users.update.mockResolvedValue({
        id: 'user-1',
        name: 'Updated Name',
        organization: 'NewOrg',
        image: null,
      } as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.updateProfile('user-1', {
        name: 'Updated Name',
        organization: 'NewOrg',
      });

      expect(result.user.name).toBe('Updated Name');
      expect(result.user.organization).toBe('NewOrg');
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ name: 'Updated Name' }),
        })
      );
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'profile_updated' }),
        })
      );
    });
  });

  describe('uploadAvatar', () => {
    it('should update avatar and log audit', async () => {
      mockPrisma.users.update.mockResolvedValue({
        image: 'https://new-avatar.url',
      } as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.uploadAvatar('user-1', 'https://new-avatar.url');

      expect(result.avatar).toBe('https://new-avatar.url');
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'avatar_updated' }),
        })
      );
    });
  });

  describe('deleteAvatar', () => {
    it('should set image to null and log audit', async () => {
      mockPrisma.users.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      await service.deleteAvatar('user-1');

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { image: null },
        })
      );
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'avatar_deleted' }),
        })
      );
    });
  });

  describe('getPreferences', () => {
    it('should return existing preferences', async () => {
      const prefs = { userId: 'user-1', theme: 'dark' };
      mockPrisma.user_preferences.findUnique.mockResolvedValue(prefs as any);

      const result = await service.getPreferences('user-1');

      expect(result.preferences).toEqual(prefs);
      expect(mockPrisma.user_preferences.create).not.toHaveBeenCalled();
    });

    it('should create defaults when no preferences exist', async () => {
      mockPrisma.user_preferences.findUnique.mockResolvedValue(null);
      const defaultPrefs = { userId: 'user-1' };
      mockPrisma.user_preferences.create.mockResolvedValue(defaultPrefs as any);

      const result = await service.getPreferences('user-1');

      expect(result.preferences).toEqual(defaultPrefs);
      expect(mockPrisma.user_preferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        })
      );
    });
  });

  describe('updatePreferences', () => {
    it('should upsert preferences and log audit', async () => {
      const updatedPrefs = { userId: 'user-1' };
      mockPrisma.user_preferences.upsert.mockResolvedValue(updatedPrefs as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.updatePreferences('user-1', {
        theme: 'dark',
        emailNotifications: true,
      });

      expect(result.preferences).toEqual(updatedPrefs);
      expect(mockPrisma.user_preferences.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      );
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'preferences_updated' }),
        })
      );
    });
  });

  describe('deleteAccount', () => {
    it('should soft-delete user, revoke sessions and API keys', async () => {
      mockPrisma.users.update.mockResolvedValue({} as any);
      mockPrisma.sessions.updateMany.mockResolvedValue({ count: 3 } as any);
      mockPrisma.api_keys.updateMany.mockResolvedValue({ count: 2 } as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      await service.deleteAccount('user-1');

      // Verify user anonymized
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'deleted_user-1@recoder.xyz',
            isActive: false,
          }),
        })
      );

      // Verify sessions revoked
      expect(mockPrisma.sessions.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({ isActive: false }),
        })
      );

      // Verify API keys revoked
      expect(mockPrisma.api_keys.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({ isActive: false }),
        })
      );

      // Verify audit log
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'account_deleted' }),
        })
      );
    });
  });

  describe('exportUserData', () => {
    it('should return full user data and log export', async () => {
      const userData = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        api_keys: [{ name: 'Key 1', createdAt: new Date() }],
        usage_records: [{ requestType: 'chat', tokensUsed: 100 }],
        audit_logs: [{ action: 'login' }],
      };
      mockPrisma.users.findUnique.mockResolvedValue(userData as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.exportUserData('user-1');

      expect(result.data).toEqual(userData);
      expect(mockPrisma.users.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            api_keys: expect.any(Object),
            usage_records: expect.any(Object),
            audit_logs: expect.any(Object),
          }),
        })
      );
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'data_exported' }),
        })
      );
    });

    it('should throw for nonexistent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(service.exportUserData('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('getUserStats', () => {
    it('should aggregate usage stats', async () => {
      mockPrisma.usage_records.aggregate
        .mockResolvedValueOnce({
          _sum: { tokensUsed: 50000, cost: 1.5, requestCount: 200 },
          _count: 50,
        } as any)
        .mockResolvedValueOnce({
          _sum: { tokensUsed: 5000, cost: 0.3, requestCount: 20 },
        } as any);
      mockPrisma.api_keys.count.mockResolvedValue(2);
      mockPrisma.sessions.count.mockResolvedValue(1);

      const result = await service.getUserStats('user-1');

      expect(result.stats.totalUsage.tokens).toBe(50000);
      expect(result.stats.totalUsage.cost).toBe(1.5);
      expect(result.stats.monthlyUsage.tokens).toBe(5000);
      expect(result.stats.apiKeys).toBe(2);
      expect(result.stats.activeSessions).toBe(1);
    });

    it('should handle zero usage gracefully', async () => {
      mockPrisma.usage_records.aggregate
        .mockResolvedValueOnce({
          _sum: { tokensUsed: null, cost: null, requestCount: null },
          _count: 0,
        } as any)
        .mockResolvedValueOnce({
          _sum: { tokensUsed: null, cost: null, requestCount: null },
        } as any);
      mockPrisma.api_keys.count.mockResolvedValue(0);
      mockPrisma.sessions.count.mockResolvedValue(0);

      const result = await service.getUserStats('user-1');

      expect(result.stats.totalUsage.tokens).toBe(0);
      expect(result.stats.totalUsage.cost).toBe(0);
      expect(result.stats.apiKeys).toBe(0);
      expect(result.stats.activeSessions).toBe(0);
    });
  });

  describe('listSessions', () => {
    it('should return mapped sessions', async () => {
      const sessions = [
        {
          id: 'sess-1',
          device: 'Chrome',
          browser: 'Chrome 120',
          os: 'macOS',
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          location: 'Berlin',
          isActive: true,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ];
      mockPrisma.sessions.findMany.mockResolvedValue(sessions as any);

      const result = await service.listSessions('user-1');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('sess-1');
      expect(result.sessions[0].device).toBe('Chrome');
      expect(mockPrisma.sessions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      );
    });

    it('should return empty array when no sessions', async () => {
      mockPrisma.sessions.findMany.mockResolvedValue([]);

      const result = await service.listSessions('user-1');
      expect(result.sessions).toHaveLength(0);
    });
  });

  describe('revokeSession', () => {
    it('should deactivate session and log audit', async () => {
      mockPrisma.sessions.findFirst.mockResolvedValue({ id: 'sess-1', userId: 'user-1' } as any);
      mockPrisma.sessions.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      await service.revokeSession('user-1', 'sess-1');

      expect(mockPrisma.sessions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-1' },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'session_revoked',
            resourceId: 'sess-1',
          }),
        })
      );
    });

    it('should throw when session not found', async () => {
      mockPrisma.sessions.findFirst.mockResolvedValue(null);

      await expect(service.revokeSession('user-1', 'nonexistent')).rejects.toThrow('Session not found');
    });

    it('should enforce ownership check', async () => {
      mockPrisma.sessions.findFirst.mockResolvedValue(null);

      await expect(service.revokeSession('wrong-user', 'sess-1')).rejects.toThrow('Session not found');

      expect(mockPrisma.sessions.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-1', userId: 'wrong-user' },
        })
      );
    });
  });

  describe('changeEmail', () => {
    it('should change email with valid password', async () => {
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'old@example.com',
          password: 'hashed:correct-pw',
        } as any)
        .mockResolvedValueOnce(null); // new email not taken
      mockPrisma.users.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.changeEmail('user-1', 'new@example.com', 'correct-pw');

      expect(result.message).toContain('Email changed');
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            emailVerified: false,
          }),
        })
      );
    });

    it('should reject incorrect password', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hashed:real-pw',
      } as any);

      await expect(
        service.changeEmail('user-1', 'new@example.com', 'wrong-pw')
      ).rejects.toThrow('Password is incorrect');
    });

    it('should reject if new email is taken', async () => {
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({
          id: 'user-1',
          password: 'hashed:correct-pw',
        } as any)
        .mockResolvedValueOnce({ id: 'other-user' } as any); // email taken

      await expect(
        service.changeEmail('user-1', 'taken@example.com', 'correct-pw')
      ).rejects.toThrow('Email already in use');
    });

    it('should throw for nonexistent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(
        service.changeEmail('nonexistent', 'new@example.com', 'pw')
      ).rejects.toThrow('User not found');
    });
  });
});
