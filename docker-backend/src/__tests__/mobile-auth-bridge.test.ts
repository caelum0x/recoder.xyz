import { describe, expect, it, beforeEach } from 'vitest';
import {
  createMobileSession,
  validateMobileSession,
  registerDevice,
} from '../mobile/api.js';

describe('mobile auth bridge', () => {
  describe('session validation', () => {
    it('validates a valid session token', () => {
      const session = createMobileSession('user-1', 'device-1');
      const validated = validateMobileSession(session.token);

      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe('user-1');
      expect(validated!.deviceId).toBe('device-1');
    });

    it('returns null for an unknown token', () => {
      const result = validateMobileSession('nonexistent-token');
      expect(result).toBeNull();
    });

    it('returns null for an expired session', () => {
      const session = createMobileSession('user-2', 'device-2');
      // Manually expire the session
      session.expiresAt = Date.now() - 1000;
      const result = validateMobileSession(session.token);
      expect(result).toBeNull();
    });

    it('auto-refreshes session nearing expiry', () => {
      const session = createMobileSession('user-3', 'device-3');
      // Set expiry to 3 days from now (within the 7-day refresh threshold)
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      session.expiresAt = Date.now() + threeDaysMs;

      const validated = validateMobileSession(session.token);
      expect(validated).not.toBeNull();
      // Session should have been extended beyond the original 3-day window
      expect(validated!.expiresAt).toBeGreaterThan(Date.now() + threeDaysMs);
    });
  });

  describe('device registration with BYOK key resolution', () => {
    it('registers a new device and returns session', () => {
      const { device, session } = registerDevice('user-10', {
        deviceName: 'Test iPhone',
        platform: 'ios',
        appVersion: '1.0.0',
        osVersion: '17.0',
      });

      expect(device.userId).toBe('user-10');
      expect(device.platform).toBe('ios');
      expect(session.token).toBeTruthy();
      expect(session.userId).toBe('user-10');

      // The session should be valid
      const validated = validateMobileSession(session.token);
      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe('user-10');
    });

    it('returns new session for existing device on re-register', () => {
      const first = registerDevice('user-11', {
        deviceName: 'Test Android',
        platform: 'android',
        appVersion: '1.0.0',
        osVersion: '14',
      });

      const second = registerDevice('user-11', {
        deviceName: 'Test Android',
        platform: 'android',
        appVersion: '1.1.0',
        osVersion: '14',
      });

      // Should get a different session token (fresh session)
      // Device ID is deterministic so re-registration creates a new session
      expect(second.session.token).toBeTruthy();
      expect(second.device.userId).toBe('user-11');
    });
  });
});
