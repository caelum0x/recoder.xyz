// @vitest-environment node
/**
 * AuthService Unit Tests
 * Tests registration, login, logout, email verification, session management, OAuth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user_quota: {
      create: vi.fn(),
    },
    user_preferences: {
      create: vi.fn(),
    },
    verification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    sessions: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    integrations: {
      create: vi.fn(),
    },
    audit_logs: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
  generateSecureToken: vi.fn((prefix?: string) => `${prefix || 'tok'}_mock-token-value`),
}));

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: vi.fn(async () => {}),
  sendVerificationEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { AuthService } from '../auth.service';
import { verifyPassword } from '@/lib/crypto';

const mockPrisma = vi.mocked(prisma);

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
  });

  describe('register', () => {
    it('should create user with quota and preferences', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);
      mockPrisma.users.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: false,
      } as any);
      mockPrisma.user_quota.create.mockResolvedValue({} as any);
      mockPrisma.user_preferences.create.mockResolvedValue({} as any);
      mockPrisma.verification.create.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.register('test@example.com', 'SecurePassword123', 'Test User');

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('test@example.com');
      expect(mockPrisma.users.create).toHaveBeenCalledOnce();
      expect(mockPrisma.user_quota.create).toHaveBeenCalledOnce();
      expect(mockPrisma.user_preferences.create).toHaveBeenCalledOnce();
      expect(mockPrisma.verification.create).toHaveBeenCalledOnce();
    });

    it('should reject duplicate email', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({ id: 'existing' } as any);

      await expect(
        service.register('taken@example.com', 'password', 'User')
      ).rejects.toThrow('already exists');
    });

    it('should set correct quota for pro plan', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);
      mockPrisma.users.create.mockResolvedValue({
        id: 'user-2',
        email: 'pro@example.com',
        name: 'Pro User',
        emailVerified: false,
      } as any);
      mockPrisma.user_quota.create.mockResolvedValue({} as any);
      mockPrisma.user_preferences.create.mockResolvedValue({} as any);
      mockPrisma.verification.create.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      await service.register('pro@example.com', 'password', 'Pro User', 'pro');

      expect(mockPrisma.user_quota.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionsPerDay: 20,
            tokensPerSession: 100000,
          }),
        })
      );
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed:correct-password',
        emailVerified: true,
        image: null,
        subscriptionPlan: 'free',
      } as any);
      mockPrisma.users.update.mockResolvedValue({} as any);
      mockPrisma.sessions.create.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.login('test@example.com', 'correct-password');

      expect(result.success).toBe(true);
      expect(result.sessionToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should reject invalid password', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hashed:real-password',
        emailVerified: true,
      } as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      await expect(
        service.login('test@example.com', 'wrong-password')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject nonexistent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nonexistent@example.com', 'password')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject unverified email', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hashed:password',
        emailVerified: false,
      } as any);

      await expect(
        service.login('test@example.com', 'password')
      ).rejects.toThrow('verify your email');
    });

    it('should log failed login attempts', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hashed:real-password',
        emailVerified: true,
      } as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      await expect(service.login('test@example.com', 'wrong')).rejects.toThrow();

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'login_failed' }),
        })
      );
    });
  });

  describe('logout', () => {
    it('should delete session and log', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue({
        userId: 'user-1',
      } as any);
      mockPrisma.sessions.delete.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.logout('session-token');

      expect(result.success).toBe(true);
      expect(mockPrisma.sessions.delete).toHaveBeenCalledWith({
        where: { token: 'session-token' },
      });
    });

    it('should throw for invalid session', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue(null);

      await expect(service.logout('invalid')).rejects.toThrow('Session not found');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      mockPrisma.verification.findFirst.mockResolvedValue({
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'valid-token',
        expiresAt: new Date(Date.now() + 86400000),
      } as any);
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
      } as any);
      mockPrisma.users.update.mockResolvedValue({} as any);
      mockPrisma.verification.delete.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true }),
        })
      );
      // Token should be deleted after use
      expect(mockPrisma.verification.delete).toHaveBeenCalledOnce();
    });

    it('should reject expired token', async () => {
      mockPrisma.verification.findFirst.mockResolvedValue({
        id: 'ver-1',
        identifier: 'test@example.com',
        value: 'expired-token',
        expiresAt: new Date(Date.now() - 86400000), // Expired yesterday
      } as any);

      await expect(service.verifyEmail('expired-token')).rejects.toThrow('expired');
    });

    it('should reject invalid token', async () => {
      mockPrisma.verification.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid')).rejects.toThrow('Invalid verification token');
    });
  });

  describe('validateSession', () => {
    it('should validate active session', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86400000),
        users: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
        },
        createdAt: new Date(),
      } as any);
      mockPrisma.sessions.update.mockResolvedValue({} as any);

      const result = await service.validateSession('valid-session');

      expect(result.valid).toBe(true);
      expect(result.user?.email).toBe('test@example.com');
    });

    it('should reject expired session', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() - 86400000),
        users: { id: 'user-1' },
      } as any);

      const result = await service.validateSession('expired-session');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject nonexistent session', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('nonexistent');

      expect(result.valid).toBe(false);
    });
  });

  describe('handleOAuthCallback', () => {
    it('should create new user for first OAuth login', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);
      mockPrisma.users.create.mockResolvedValue({
        id: 'oauth-user',
        email: 'oauth@example.com',
        name: 'OAuth User',
        image: 'https://avatar.url',
      } as any);
      mockPrisma.user_quota.create.mockResolvedValue({} as any);
      mockPrisma.user_preferences.create.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.handleOAuthCallback(
        'github',
        'gh-123',
        'oauth@example.com',
        'OAuth User',
        'https://avatar.url'
      );

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('oauth@example.com');
      // Should create user with emailVerified: true for OAuth
      expect(mockPrisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true }),
        })
      );
    });

    it('should update last login for existing OAuth user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'oauth@example.com',
        name: 'Existing User',
        image: null,
      } as any);
      mockPrisma.users.update.mockResolvedValue({} as any);
      mockPrisma.audit_logs.create.mockResolvedValue({} as any);

      const result = await service.handleOAuthCallback(
        'github',
        'gh-123',
        'oauth@example.com',
        'Existing User'
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.users.create).not.toHaveBeenCalled();
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'oauth_login' }),
        })
      );
    });
  });

  describe('refreshSession', () => {
    it('should extend session expiration', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue({ id: 'session-1' } as any);
      mockPrisma.sessions.update.mockResolvedValue({} as any);

      const result = await service.refreshSession('session-token');

      expect(result.success).toBe(true);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw for invalid session', async () => {
      mockPrisma.sessions.findUnique.mockResolvedValue(null);

      await expect(service.refreshSession('invalid')).rejects.toThrow();
    });
  });
});
