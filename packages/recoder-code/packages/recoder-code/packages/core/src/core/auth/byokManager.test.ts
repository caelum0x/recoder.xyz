/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BYOKManager, getBYOKManager } from './byokManager.js';

describe('BYOKManager', () => {
  let manager: BYOKManager;

  beforeEach(() => {
    manager = new BYOKManager();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize successfully', () => {
      expect(manager).toBeInstanceOf(BYOKManager);
    });

    it('should load credentials from environment variables', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test';
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      
      const newManager = new BYOKManager();
      const providers = newManager.listAvailableProviders();
      
      const openai = providers.find(p => p.id === 'openai');
      const anthropic = providers.find(p => p.id === 'anthropic');
      
      expect(openai?.configured).toBe(true);
      expect(anthropic?.configured).toBe(true);
    });
  });

  describe('addProvider', () => {
    it('should add a new provider', () => {
      manager.addProvider('openai', 'sk-test-key');
      
      const providers = manager.listAvailableProviders();
      const openai = providers.find(p => p.id === 'openai');
      
      expect(openai?.configured).toBe(true);
    });

    it('should support custom base URL', () => {
      manager.addProvider('openai', 'sk-test', 'https://custom.api.com');
      
      const providers = manager.listAvailableProviders();
      const openai = providers.find(p => p.id === 'openai');
      
      expect(openai?.hasBaseUrl).toBe(true);
    });

    it('should validate provider type', () => {
      expect(() => {
        manager.addProvider('invalid-provider' as any, 'key');
      }).toThrow();
    });
  });

  describe('removeProvider', () => {
    it('should remove a provider', () => {
      manager.addProvider('openai', 'sk-test');
      manager.removeProvider('openai');
      
      const providers = manager.listAvailableProviders();
      const openai = providers.find(p => p.id === 'openai');
      
      expect(openai?.configured).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('should return provider credentials', () => {
      manager.addProvider('anthropic', 'sk-ant-test');
      
      const creds = manager.getProvider('anthropic');
      expect(creds).toHaveProperty('apiKey', 'sk-ant-test');
    });

    it('should return null for unconfigured provider', () => {
      const creds = manager.getProvider('openai');
      expect(creds).toBeNull();
    });
  });

  describe('validateProvider', () => {
    it('should validate configured provider', async () => {
      manager.addProvider('openai', 'sk-test');
      
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const result = await manager.validateProvider('openai');
      expect(result.valid).toBe(true);
    });

    it('should return error for invalid key', async () => {
      manager.addProvider('openai', 'invalid-key');
      
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const result = await manager.validateProvider('openai');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('listAvailableProviders', () => {
    it('should list all supported providers', () => {
      const providers = manager.listAvailableProviders();
      
      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0]).toHaveProperty('id');
      expect(providers[0]).toHaveProperty('name');
      expect(providers[0]).toHaveProperty('configured');
    });

    it('should include common providers', () => {
      const providers = manager.listAvailableProviders();
      const ids = providers.map(p => p.id);
      
      expect(ids).toContain('openai');
      expect(ids).toContain('anthropic');
      expect(ids).toContain('google');
    });
  });

  describe('getBYOKManager singleton', () => {
    it('should return the same instance', () => {
      const manager1 = getBYOKManager();
      const manager2 = getBYOKManager();
      
      expect(manager1).toBe(manager2);
    });
  });
});
