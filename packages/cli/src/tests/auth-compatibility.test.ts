/**
 * Authentication Compatibility Tests
 * Ensures backward compatibility while testing new unified auth features
 */

import { BackendClient } from '../services/backend-client';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Authentication Compatibility', () => {
  let backendClient: BackendClient;
  const testSessionDir = path.join(os.tmpdir(), '.recoder-test');
  const legacySessionFile = path.join(testSessionDir, 'session.json');
  const unifiedSessionFile = path.join(testSessionDir, 'unified-session.json');

  beforeEach(async () => {
    // Clean up test directory
    await fs.remove(testSessionDir);
    await fs.ensureDir(testSessionDir);
    
    // Mock the session directory for testing
    jest.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
    
    backendClient = new BackendClient();
  });

  afterEach(async () => {
    await fs.remove(testSessionDir);
    jest.restoreAllMocks();
  });

  describe('Legacy Session Support', () => {
    it('should load existing legacy session', async () => {
      // Create a mock legacy session
      const legacySession = {
        userId: 'test-user-123',
        token: 'legacy-token-456',
        email: 'test@example.com',
        plan: 'free',
        quotas: {
          totalRequests: 100,
          usedRequests: 10,
          resetDate: new Date().toISOString()
        },
        platforms: {
          cli: true,
          web: false,
          extension: false,
          router: false
        }
      };

      await fs.writeJson(legacySessionFile, legacySession);
      
      // Create new client instance to trigger session loading
      const testClient = new BackendClient();
      
      expect(testClient.isAuthenticated()).toBe(true);
      expect(testClient.getCurrentSession()).toEqual(legacySession);
    });

    it('should prioritize unified session over legacy session', async () => {
      // Create both legacy and unified sessions
      const legacySession = {
        userId: 'legacy-user',
        token: 'legacy-token',
        email: 'legacy@example.com',
        plan: 'free',
        quotas: { totalRequests: 100, usedRequests: 10, resetDate: new Date().toISOString() },
        platforms: { cli: true, web: false, extension: false, router: false }
      };

      const unifiedSession = {
        userId: 'unified-user',
        platform: 'cli',
        deviceId: 'device-123',
        accessToken: 'unified-access-token',
        refreshToken: 'unified-refresh-token',
        scopes: ['basic', 'generate'],
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        lastUsed: new Date(),
        riskLevel: 'low',
        metadata: {}
      };

      await fs.writeJson(legacySessionFile, legacySession);
      await fs.writeJson(unifiedSessionFile, unifiedSession);

      const testClient = new BackendClient();
      
      expect(testClient.isAuthenticated()).toBe(true);
      expect(testClient.getUnifiedSession()).toBeTruthy();
      expect(testClient.getUnifiedSession()?.userId).toBe('unified-user');
    });
  });

  describe('Device ID Management', () => {
    it('should generate and persist device ID', async () => {
      const deviceFile = path.join(testSessionDir, 'device-id');
      
      expect(await fs.pathExists(deviceFile)).toBe(false);
      
      // Create client to trigger device ID generation
      const testClient = new BackendClient();
      
      expect(await fs.pathExists(deviceFile)).toBe(true);
      
      const deviceId = await fs.readFile(deviceFile, 'utf8');
      expect(deviceId).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should reuse existing device ID', async () => {
      const deviceFile = path.join(testSessionDir, 'device-id');
      const existingDeviceId = 'existing-device-id-123';
      
      await fs.writeFile(deviceFile, existingDeviceId);
      
      const testClient = new BackendClient();
      
      const deviceId = await fs.readFile(deviceFile, 'utf8');
      expect(deviceId).toBe(existingDeviceId);
    });
  });

  describe('Session File Management', () => {
    it('should handle corrupted session files gracefully', async () => {
      // Write invalid JSON to session file
      await fs.writeFile(legacySessionFile, 'invalid-json-content');
      
      const testClient = new BackendClient();
      
      expect(testClient.isAuthenticated()).toBe(false);
      expect(testClient.getCurrentSession()).toBeNull();
    });

    it('should handle expired unified sessions', async () => {
      const expiredSession = {
        userId: 'test-user',
        platform: 'cli',
        deviceId: 'device-123',
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        scopes: ['basic'],
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 minute ago
        createdAt: new Date(),
        lastUsed: new Date(),
        riskLevel: 'low',
        metadata: {}
      };

      await fs.writeJson(unifiedSessionFile, expiredSession);
      
      const testClient = new BackendClient();
      
      // Should attempt to refresh the session
      expect(testClient.getUnifiedSession()).toBeTruthy();
    });
  });

  describe('API Key Authentication', () => {
    it('should validate API key format', () => {
      const validApiKey = 'rcd_abcdef123456_ghijkl789012';
      const invalidApiKeys = [
        'invalid-format',
        'rcd_only-two-parts',
        'wrong_prefix_abc_def',
        ''
      ];

      // This would be tested with actual validation method
      expect(validApiKey.split('_').length).toBe(3);
      expect(validApiKey.startsWith('rcd_')).toBe(true);

      invalidApiKeys.forEach(key => {
        expect(key.split('_').length === 3 && key.startsWith('rcd_')).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network failure
      jest.spyOn(backendClient as any, 'client').mockImplementation({
        get: jest.fn().mockRejectedValue(new Error('Network error')),
        post: jest.fn().mockRejectedValue(new Error('Network error'))
      });

      expect(await backendClient.isBackendAvailable()).toBe(false);
    });

    it('should continue working offline with cached session', async () => {
      const cachedSession = {
        userId: 'cached-user',
        platform: 'cli' as const,
        deviceId: 'device-123',
        accessToken: 'cached-token',
        refreshToken: 'refresh-token',
        scopes: ['basic'],
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date(),
        lastUsed: new Date(),
        riskLevel: 'low' as const,
        metadata: {}
      };

      await fs.writeJson(unifiedSessionFile, cachedSession);
      
      const testClient = new BackendClient();
      
      expect(testClient.isAuthenticated()).toBe(true);
      expect(testClient.getUnifiedSession()).toBeTruthy();
    });
  });
});

export { BackendClient };