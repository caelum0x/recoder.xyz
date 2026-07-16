/**
 * Contract schema validation tests
 *
 * These tests verify that the Zod schemas used by API routes correctly
 * validate response shapes. They serve as the Phase 2 contract boundary
 * for auth/session, account, and security APIs consumed by
 * recoder-web, frontend, mobile, and desktop clients.
 */
import { describe, expect, it } from 'vitest';
import {
  assertAuthSessionGetResponse,
  assertAuthSessionsListResponse,
  authSessionGetResponseSchema,
  authSessionsListResponseSchema,
} from './auth-session-contracts';
import {
  assertAccountGetResponse,
  assertAccountPutResponse,
  assertAccountDeleteResponse,
  accountGetResponseSchema,
  accountPutResponseSchema,
  accountDeleteResponseSchema,
} from './account-contracts';
import {
  assertSecuritySettingsGetResponse,
  assertSecuritySettingsPutResponse,
  assertTwoFactorSetupResponse,
  assertTwoFactorVerifyResponse,
  assertTwoFactorEnableResponse,
  assertTwoFactorDisableResponse,
  securitySettingsGetResponseSchema,
  twoFactorSetupResponseSchema,
  twoFactorEnableResponseSchema,
} from './security-contracts';
import {
  APP_CLI_SESSION_CONTRACT,
  assertCliSessionActionResponse,
  assertCliSessionErrorResponse,
  assertCliSessionsListResponse,
  cliSessionActionResponseSchema,
  cliSessionErrorResponseSchema,
  cliSessionsListResponseSchema,
} from './cli-session-contracts';

// ---------------------------------------------------------------------------
// Auth Session Contracts
// ---------------------------------------------------------------------------
describe('auth-session contracts', () => {
  describe('GET /api/auth/session', () => {
    it('accepts unauthenticated response', () => {
      const payload = { user: null };
      expect(() => assertAuthSessionGetResponse(payload)).not.toThrow();
      expect(authSessionGetResponseSchema.parse(payload)).toEqual(payload);
    });

    it('accepts authenticated session', () => {
      const payload = {
        user: {
          id: 'u1',
          email: 'user@example.com',
          name: 'User',
          image: null,
          subscriptionPlan: 'pro',
          subscriptionStatus: 'active',
        },
        session: {
          id: 'sess_1',
          expiresAt: '2026-03-01T00:00:00Z',
        },
      };
      expect(() => assertAuthSessionGetResponse(payload)).not.toThrow();
    });

    it('accepts session with minimal user fields', () => {
      const payload = {
        user: { id: 'u2' },
        session: { id: 'sess_2' },
      };
      expect(() => assertAuthSessionGetResponse(payload)).not.toThrow();
    });

    it('rejects missing user.id', () => {
      const payload = {
        user: { email: 'test@example.com' },
        session: { id: 'sess_3' },
      };
      expect(() => assertAuthSessionGetResponse(payload)).toThrow();
    });

    it('rejects missing session when user is present', () => {
      const payload = { user: { id: 'u3', email: 'test@example.com' } };
      expect(() => assertAuthSessionGetResponse(payload)).toThrow();
    });
  });

  describe('GET /api/auth/sessions (list)', () => {
    it('accepts session list with full fields', () => {
      const payload = {
        success: true as const,
        sessions: [
          {
            id: 'sess_1',
            device: 'Chrome on macOS',
            browser: 'Chrome',
            os: 'macOS',
            deviceType: 'desktop',
            ipAddress: '127.0.0.1',
            location: 'Unknown',
            lastActive: '2026-02-15T00:00:00Z',
            createdAt: '2026-02-14T00:00:00Z',
            current: true,
          },
        ],
      };
      expect(() => assertAuthSessionsListResponse(payload)).not.toThrow();
    });

    it('accepts success message response (session revoked)', () => {
      const payload = { success: true as const, message: 'Session revoked successfully' };
      expect(() => assertAuthSessionsListResponse(payload)).not.toThrow();
    });

    it('accepts error response', () => {
      const payload = { success: false as const, error: 'Unauthorized' };
      expect(() => assertAuthSessionsListResponse(payload)).not.toThrow();
    });

    it('rejects session entry missing required fields', () => {
      const payload = {
        success: true as const,
        sessions: [{ id: 'sess_1' }],  // missing device, browser, os, etc.
      };
      expect(() => assertAuthSessionsListResponse(payload)).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Account Contracts
// ---------------------------------------------------------------------------
describe('account contracts', () => {
  const validUser = {
    id: 'u1',
    email: 'user@example.com',
    name: 'Test User',
    image: null,
    organization: 'Recoder',
    createdAt: '2026-01-01T00:00:00Z',
    emailVerified: '2026-01-01T00:00:00Z',
    role: 'user',
    isActive: true,
    twoFactorEnabled: false,
    timezone: 'America/New_York',
    language: 'en',
  };

  describe('GET /api/user/account', () => {
    it('accepts valid account response', () => {
      const payload = { success: true as const, data: { user: validUser } };
      expect(() => assertAccountGetResponse(payload)).not.toThrow();
    });

    it('accepts account with minimal fields', () => {
      const payload = {
        success: true as const,
        data: { user: { id: 'u2', email: 'min@example.com' } },
      };
      expect(() => assertAccountGetResponse(payload)).not.toThrow();
    });

    it('accepts account with extra fields (passthrough)', () => {
      const payload = {
        success: true as const,
        data: { user: { ...validUser, subscription: 'pro' } },
      };
      expect(() => assertAccountGetResponse(payload)).not.toThrow();
    });

    it('rejects missing email', () => {
      const payload = {
        success: true as const,
        data: { user: { id: 'u3' } },
      };
      expect(() => assertAccountGetResponse(payload)).toThrow();
    });

    it('rejects wrong success value', () => {
      const payload = {
        success: false,
        data: { user: validUser },
      };
      expect(() => assertAccountGetResponse(payload)).toThrow();
    });
  });

  describe('PUT /api/user/account', () => {
    it('accepts email change pending response', () => {
      const payload = {
        success: true as const,
        message: 'Verification email sent',
        emailChangePending: true as const,
        newEmail: 'new@example.com',
      };
      expect(() => assertAccountPutResponse(payload)).not.toThrow();
    });

    it('accepts profile update response', () => {
      const payload = {
        success: true as const,
        message: 'Account updated successfully',
        data: { user: validUser },
      };
      expect(() => assertAccountPutResponse(payload)).not.toThrow();
    });

    it('rejects missing message', () => {
      const payload = { success: true as const, data: { user: validUser } };
      expect(() => assertAccountPutResponse(payload)).toThrow();
    });
  });

  describe('DELETE /api/user/account', () => {
    it('accepts delete confirmation', () => {
      const payload = { success: true as const, message: 'Account deleted successfully' };
      expect(() => assertAccountDeleteResponse(payload)).not.toThrow();
    });

    it('rejects missing message', () => {
      const payload = { success: true as const };
      expect(() => assertAccountDeleteResponse(payload)).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Security Contracts
// ---------------------------------------------------------------------------
describe('security contracts', () => {
  const validSettings = {
    two_factor_enabled: false,
    session_timeout: 30,
    require_password_change: false,
    password_change_days: 90,
    allowed_ip_addresses: [] as string[],
    block_unknown_devices: false,
  };

  describe('GET /api/settings/security', () => {
    it('accepts valid security settings', () => {
      const payload = { success: true as const, settings: validSettings };
      expect(() => assertSecuritySettingsGetResponse(payload)).not.toThrow();
    });

    it('accepts settings with IP allowlist', () => {
      const payload = {
        success: true as const,
        settings: { ...validSettings, allowed_ip_addresses: ['10.0.0.1', '192.168.1.0/24'] },
      };
      expect(() => assertSecuritySettingsGetResponse(payload)).not.toThrow();
    });

    it('rejects non-boolean two_factor_enabled', () => {
      const payload = {
        success: true as const,
        settings: { ...validSettings, two_factor_enabled: 'yes' },
      };
      expect(() => assertSecuritySettingsGetResponse(payload)).toThrow();
    });

    it('rejects non-numeric session_timeout', () => {
      const payload = {
        success: true as const,
        settings: { ...validSettings, session_timeout: '30' },
      };
      expect(() => assertSecuritySettingsGetResponse(payload)).toThrow();
    });
  });

  describe('PUT /api/settings/security', () => {
    it('accepts update confirmation', () => {
      const payload = { success: true as const, message: 'Security settings updated successfully' };
      expect(() => assertSecuritySettingsPutResponse(payload)).not.toThrow();
    });
  });

  describe('2FA setup', () => {
    it('accepts setup response with secret and QR', () => {
      const payload = {
        success: true as const,
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeURL: 'otpauth://totp/Recoder:user@example.com?secret=JBSWY3DPEHPK3PXP',
        message: '2FA setup initiated',
      };
      expect(() => assertTwoFactorSetupResponse(payload)).not.toThrow();
    });

    it('rejects missing secret', () => {
      const payload = {
        success: true as const,
        qrCodeURL: 'otpauth://...',
        message: '2FA setup initiated',
      };
      expect(() => assertTwoFactorSetupResponse(payload)).toThrow();
    });
  });

  describe('2FA verify', () => {
    it('accepts verification response', () => {
      const payload = { success: true as const, message: 'Token verified' };
      expect(() => assertTwoFactorVerifyResponse(payload)).not.toThrow();
    });
  });

  describe('2FA enable', () => {
    it('accepts enable response with backup codes', () => {
      const payload = {
        success: true as const,
        backupCodes: ['code1', 'code2', 'code3'],
        message: '2FA enabled',
      };
      expect(() => assertTwoFactorEnableResponse(payload)).not.toThrow();
    });

    it('accepts enable response without backup codes', () => {
      const payload = { success: true as const, message: '2FA enabled' };
      expect(() => assertTwoFactorEnableResponse(payload)).not.toThrow();
    });
  });

  describe('2FA disable', () => {
    it('accepts disable confirmation', () => {
      const payload = { success: true as const, message: '2FA disabled' };
      expect(() => assertTwoFactorDisableResponse(payload)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// CLI Session Contracts
// ---------------------------------------------------------------------------
describe('cli session contracts', () => {
  describe('GET /api/auth/cli/sessions', () => {
    it('accepts sessions list with contract marker', () => {
      const payload = {
        contract: APP_CLI_SESSION_CONTRACT,
        sessions: [
          {
            id: 'sess_1',
            deviceName: 'CLI',
            deviceType: 'cli',
            createdAt: '2026-02-15T00:00:00Z',
          },
        ],
      };
      expect(() => assertCliSessionsListResponse(payload)).not.toThrow();
      expect(cliSessionsListResponseSchema.parse(payload).contract).toBe(APP_CLI_SESSION_CONTRACT);
    });

    it('rejects missing contract marker', () => {
      const payload = {
        sessions: [{ id: 'sess_1' }],
      };
      expect(() => assertCliSessionsListResponse(payload)).toThrow();
    });
  });

  describe('DELETE /api/auth/cli/sessions + /api/cli/sessions/all', () => {
    it('accepts action response with contract marker', () => {
      const payload = {
        contract: APP_CLI_SESSION_CONTRACT,
        success: true,
        message: 'Session revoked',
        revokedCount: 1,
      };
      expect(() => assertCliSessionActionResponse(payload)).not.toThrow();
      expect(cliSessionActionResponseSchema.parse(payload).contract).toBe(APP_CLI_SESSION_CONTRACT);
    });

    it('accepts error response with contract marker', () => {
      const payload = {
        contract: APP_CLI_SESSION_CONTRACT,
        error: 'Failed to revoke all CLI sessions',
        message: 'Backend request failed',
      };
      expect(() => assertCliSessionErrorResponse(payload)).not.toThrow();
      expect(cliSessionErrorResponseSchema.parse(payload).contract).toBe(APP_CLI_SESSION_CONTRACT);
    });

    it('rejects error response with missing contract marker', () => {
      const payload = {
        error: 'Unauthorized',
      };
      expect(() => assertCliSessionErrorResponse(payload)).toThrow();
    });
  });
});
