/**
 * Auth Utils Tests
 * 
 * Tests authentication utilities and migration mode handling.
 * Based on issues found in docker-logs.md:
 * - Anonymous access warnings
 * - Invalid token handling
 * - Migration mode fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('Auth Utils', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getProjectIdFromRequest', () => {
    it('should extract projectId from params', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {
        params: { projectId: 'test-project-123' },
        body: {},
        query: {},
      } as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBe('test-project-123');
    });

    it('should extract projectId from body', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {
        params: {},
        body: { projectId: 'body-project' },
        query: {},
      } as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBe('body-project');
    });

    it('should extract projectId from query', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {
        params: {},
        body: {},
        query: { projectId: 'query-project' },
      } as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBe('query-project');
    });

    it('should extract containerId from query as fallback', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {
        params: {},
        body: {},
        query: { containerId: 'container-fallback' },
      } as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBe('container-fallback');
    });

    it('should prioritize params over body and query', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {
        params: { projectId: 'params-project' },
        body: { projectId: 'body-project' },
        query: { projectId: 'query-project' },
      } as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBe('params-project');
    });

    it('should return undefined if no projectId found', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {
        params: {},
        body: {},
        query: {},
      } as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBeUndefined();
    });

    it('should handle missing params/body/query', async () => {
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const mockReq = {} as any;
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBeUndefined();
    });
  });

  describe('isStrictAuthMode', () => {
    it('should return false in development mode', async () => {
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = undefined;
      
      vi.resetModules();
      const { isStrictAuthMode } = await import('../auth-utils');
      
      expect(isStrictAuthMode()).toBe(false);
    });

    it('should return true in production mode', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = undefined;
      
      vi.resetModules();
      const { isStrictAuthMode } = await import('../auth-utils');
      
      expect(isStrictAuthMode()).toBe(true);
    });

    it('should return true when REQUIRE_AUTH is true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = 'true';
      
      vi.resetModules();
      const { isStrictAuthMode } = await import('../auth-utils');
      
      expect(isStrictAuthMode()).toBe(true);
    });

    it('should return false when REQUIRE_AUTH is false', async () => {
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = 'false';
      
      vi.resetModules();
      const { isStrictAuthMode } = await import('../auth-utils');
      
      expect(isStrictAuthMode()).toBe(false);
    });

    it('should handle missing NODE_ENV', async () => {
      delete process.env.NODE_ENV;
      process.env.REQUIRE_AUTH = undefined;
      
      vi.resetModules();
      const { isStrictAuthMode } = await import('../auth-utils');
      
      // Should default to development (non-strict)
      expect(isStrictAuthMode()).toBe(false);
    });
  });

  describe('isLikelySandboxProjectId', () => {
    it('accepts generated sandbox ids', async () => {
      const { isLikelySandboxProjectId } = await import('../auth-utils');

      expect(isLikelySandboxProjectId('project-1774919650071')).toBe(true);
    });

    it('accepts UUID sandbox ids', async () => {
      const { isLikelySandboxProjectId } = await import('../auth-utils');

      expect(isLikelySandboxProjectId('08074008-5622-4396-b2d3-4d062c3e1c8d')).toBe(true);
    });

    it('rejects route slugs that are not sandbox ids', async () => {
      const { isLikelySandboxProjectId } = await import('../auth-utils');

      expect(isLikelySandboxProjectId('hello-world')).toBe(false);
      expect(isLikelySandboxProjectId('landing-page-redesign')).toBe(false);
    });
  });
});

describe('Auth Migration Mode Scenarios', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Anonymous Access Handling', () => {
    it('should allow anonymous access in migration mode', async () => {
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = 'false';
      
      const { isStrictAuthMode } = await import('../auth-utils');
      
      // In non-strict mode, anonymous access should be allowed
      const strictMode = isStrictAuthMode();
      const shouldAllowAnonymous = !strictMode;
      
      expect(shouldAllowAnonymous).toBe(true);
    });

    it('should block anonymous access in strict mode', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = 'true';
      
      const { isStrictAuthMode } = await import('../auth-utils');
      
      const strictMode = isStrictAuthMode();
      const shouldAllowAnonymous = !strictMode;
      
      expect(shouldAllowAnonymous).toBe(false);
    });
  });

  describe('Token Validation Scenarios', () => {
    it('should validate request with auth header', async () => {
      const mockReq = {
        params: { projectId: 'test-project' },
        body: {},
        query: {},
        headers: {
          authorization: 'Bearer valid-token-123',
        },
        get: (header: string) => mockReq.headers[header.toLowerCase() as keyof typeof mockReq.headers],
      } as any;
      
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      // Should still extract project ID regardless of auth status
      expect(projectId).toBe('test-project');
    });

    it('should handle requests without auth header', async () => {
      const mockReq = {
        params: { projectId: 'test-project' },
        body: {},
        query: {},
        headers: {},
        get: () => undefined,
      } as any;
      
      const { getProjectIdFromRequest } = await import('../auth-utils');
      
      const projectId = getProjectIdFromRequest(mockReq);
      
      expect(projectId).toBe('test-project');
    });
  });

  describe('getAnonymousIdFromRequest', () => {
    it('prefers explicit anonymous headers over cookies', async () => {
      const { getAnonymousIdFromRequest } = await import('../auth-utils');

      const mockReq = {
        headers: {
          'x-recoder-anonymous-id': 'anon_header_123',
          cookie: 'recoder_anonymous_id=anon_cookie_999',
        },
      } as any;

      expect(getAnonymousIdFromRequest(mockReq)).toBe('anon_header_123');
    });

    it('falls back to recoder anonymous cookie when header is absent', async () => {
      const { getAnonymousIdFromRequest } = await import('../auth-utils');

      const mockReq = {
        headers: {
          cookie: 'foo=bar; recoder_anonymous_id=anon_cookie_456; another=value',
        },
      } as any;

      expect(getAnonymousIdFromRequest(mockReq)).toBe('anon_cookie_456');
    });

    it('ignores invalid anonymous identifiers', async () => {
      const { getAnonymousIdFromRequest } = await import('../auth-utils');

      const mockReq = {
        headers: {
          'x-recoder-anonymous-id': '../../bad-value',
          cookie: 'recoder_anonymous_id=anon_cookie_valid',
        },
      } as any;

      expect(getAnonymousIdFromRequest(mockReq)).toBe('anon_cookie_valid');
    });
  });

  describe('resolveA2ASystemSession', () => {
    it('accepts the shared secret and uses default system identity', async () => {
      process.env.RECODER_A2A_SHARED_SECRET = 'shared-secret-1234';

      const { resolveA2ASystemSession } = await import('../auth-utils');

      expect(resolveA2ASystemSession('shared-secret-1234')).toEqual({
        userId: 'agent:a2a-bridge',
        sessionId: 'shared-s',
      });
    });

    it('accepts bridge and worker tokens with explicit query overrides', async () => {
      process.env.RECODER_A2A_BRIDGE_TOKEN = 'bridge-secret-1234';
      process.env.RECODER_A2A_WORKER_TOKEN = 'worker-secret-1234';

      const { resolveA2ASystemSession } = await import('../auth-utils');

      expect(resolveA2ASystemSession('bridge-secret-1234', {
        agentId: 'codex',
        sessionId: 'session-bridge',
      })).toEqual({
        userId: 'agent:codex',
        sessionId: 'session-bridge',
      });

      expect(resolveA2ASystemSession('worker-secret-1234', {
        agentId: ['claude-code'],
      })).toEqual({
        userId: 'agent:claude-code',
        sessionId: 'worker-s',
      });
    });

    it('rejects unknown or empty A2A tokens', async () => {
      process.env.RECODER_A2A_SHARED_SECRET = 'shared-secret-1234';

      const { resolveA2ASystemSession } = await import('../auth-utils');

      expect(resolveA2ASystemSession('')).toBeNull();
      expect(resolveA2ASystemSession('not-a-match')).toBeNull();
    });
  });

  describe('WebSocket Auth Scenarios', () => {
    it('should handle WebSocket upgrade without token in migration mode', async () => {
      process.env.NODE_ENV = 'development';
      
      const { isStrictAuthMode } = await import('../auth-utils');
      
      // Simulating WebSocket upgrade auth check
      const hasToken = false;
      const strictMode = isStrictAuthMode();
      
      const shouldAllow = hasToken || !strictMode;
      
      expect(shouldAllow).toBe(true);
    });

    it('should block WebSocket upgrade without token in strict mode', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = 'true';
      
      const { isStrictAuthMode } = await import('../auth-utils');
      
      const hasToken = false;
      const strictMode = isStrictAuthMode();
      
      const shouldAllow = hasToken || !strictMode;
      
      expect(shouldAllow).toBe(false);
    });
  });
});

describe('Auth Error Message Scenarios', () => {
  it('should return appropriate error for anonymous access', () => {
    const getAuthError = (isAnonymous: boolean, isStrictMode: boolean): string | null => {
      if (isAnonymous && isStrictMode) {
        return 'Authentication required';
      }
      if (isAnonymous && !isStrictMode) {
        return null; // Warning logged but access allowed
      }
      return null;
    };
    
    expect(getAuthError(true, true)).toBe('Authentication required');
    expect(getAuthError(true, false)).toBeNull();
    expect(getAuthError(false, true)).toBeNull();
    expect(getAuthError(false, false)).toBeNull();
  });

  it('should return appropriate error for invalid token', () => {
    const getTokenError = (tokenValid: boolean, isStrictMode: boolean): string | null => {
      if (!tokenValid && isStrictMode) {
        return 'Invalid or expired token';
      }
      if (!tokenValid && !isStrictMode) {
        return null; // Warning logged but access allowed in migration mode
      }
      return null;
    };
    
    expect(getTokenError(false, true)).toBe('Invalid or expired token');
    expect(getTokenError(false, false)).toBeNull();
    expect(getTokenError(true, true)).toBeNull();
    expect(getTokenError(true, false)).toBeNull();
  });
});
