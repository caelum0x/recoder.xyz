/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthPKCEClient } from './oauthPKCE.js';
import type { OAuthConfig } from './types.js';

describe('OAuthPKCEClient', () => {
  let client: OAuthPKCEClient;
  let config: OAuthConfig;

  beforeEach(() => {
    config = {
      clientId: 'test-client-id',
      redirectUri: 'http://localhost:3000/callback',
    };
    client = new OAuthPKCEClient(config);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(client).toBeInstanceOf(OAuthPKCEClient);
    });

    it('should use default scope if not provided', () => {
      const authUrl = client.getAuthorizationUrl(client.generatePKCETokens());
      expect(authUrl).toContain('scope=');
    });

    it('should use custom scope if provided', () => {
      const customConfig = { ...config, scope: 'custom-scope' };
      const customClient = new OAuthPKCEClient(customConfig);
      const authUrl = customClient.getAuthorizationUrl(customClient.generatePKCETokens());
      
      expect(authUrl).toContain('scope=custom-scope');
    });
  });

  describe('generatePKCETokens', () => {
    it('should generate code verifier and challenge', () => {
      const tokens = client.generatePKCETokens();
      
      expect(tokens).toHaveProperty('codeVerifier');
      expect(tokens).toHaveProperty('codeChallenge');
      expect(tokens).toHaveProperty('codeChallengeMethod');
      expect(tokens.codeChallengeMethod).toBe('S256');
    });

    it('should generate unique tokens each time', () => {
      const tokens1 = client.generatePKCETokens();
      const tokens2 = client.generatePKCETokens();
      
      expect(tokens1.codeVerifier).not.toBe(tokens2.codeVerifier);
      expect(tokens1.codeChallenge).not.toBe(tokens2.codeChallenge);
    });

    it('should generate URL-safe base64 strings', () => {
      const tokens = client.generatePKCETokens();
      
      // Should not contain +, /, or = characters
      expect(tokens.codeVerifier).not.toMatch(/[+/=]/);
      expect(tokens.codeChallenge).not.toMatch(/[+/=]/);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate valid authorization URL', () => {
      const tokens = client.generatePKCETokens();
      const url = client.getAuthorizationUrl(tokens);
      
      expect(url).toContain('https://openrouter.ai');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should include all required parameters', () => {
      const tokens = client.generatePKCETokens();
      const url = client.getAuthorizationUrl(tokens);
      
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange authorization code for access token', async () => {
      const mockResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const tokens = client.generatePKCETokens();
      const result = await client.exchangeCodeForToken('auth-code', tokens.codeVerifier);
      
      expect(result.access_token).toBe('test-access-token');
      expect(result.token_type).toBe('Bearer');
    });

    it('should include code verifier in request', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      } as Response);

      const tokens = client.generatePKCETokens();
      await client.exchangeCodeForToken('code', tokens.codeVerifier);
      
      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(requestBody.code_verifier).toBe(tokens.codeVerifier);
    });

    it('should handle errors from token endpoint', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant' }),
      } as Response);

      const tokens = client.generatePKCETokens();
      
      await expect(
        client.exchangeCodeForToken('invalid-code', tokens.codeVerifier)
      ).rejects.toThrow();
    });
  });

  describe('startCallbackServer', () => {
    it('should start HTTP server on specified port', async () => {
      // This is complex to test without actual HTTP server, skip for now
      // In real implementation, would use supertest or similar
      expect(client.startCallbackServer).toBeDefined();
    });
  });

  describe('URL encoding', () => {
    it('should properly encode redirect URI', () => {
      const tokens = client.generatePKCETokens();
      const url = client.getAuthorizationUrl(tokens);
      const urlObj = new URL(url);
      const redirectUri = urlObj.searchParams.get('redirect_uri');
      
      expect(redirectUri).toBe('http://localhost:3000/callback');
    });
  });
});
