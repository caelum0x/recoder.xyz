/**
 * Tests for AI Hub Service
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AIHubService } from '../ai-hub';

describe('AIHubService', () => {
  let aiHub: AIHubService;

  beforeEach(() => {
    aiHub = new AIHubService();
  });

  describe('initialization', () => {
    it('should create an instance', () => {
      expect(aiHub).toBeInstanceOf(AIHubService);
    });

    it('should have required methods', () => {
      expect(typeof aiHub.generateWithBestModel).toBe('function');
      expect(typeof aiHub.getAvailableProviders).toBe('function');
    });
  });

  describe('generateWithBestModel', () => {
    it('should generate code with default options', async () => {
      const prompt = 'Create a simple React component';
      const result = await aiHub.generateWithBestModel(prompt);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle complex prompts', async () => {
      const prompt = 'Create a full-stack React app with authentication';
      const options = {
        type: 'web' as const,
        complexity: 'high' as const,
        maxTokens: 4000,
        temperature: 0.3
      };

      const result = await aiHub.generateWithBestModel(prompt, options);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle blockchain prompts', async () => {
      const prompt = 'Create a Solana DEX smart contract';
      const options = {
        type: 'blockchain' as const,
        complexity: 'high' as const,
      };

      const result = await aiHub.generateWithBestModel(prompt, options);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return available providers', async () => {
      const providers = await aiHub.getAvailableProviders();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should include expected providers', async () => {
      const providers = await aiHub.getAvailableProviders();

      // Should include at least one of the major providers
      const hasProvider = providers.some(p => 
        ['anthropic', 'openai', 'groq', 'gemini'].includes(p)
      );
      expect(hasProvider).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle empty prompts gracefully', async () => {
      await expect(aiHub.generateWithBestModel('')).rejects.toThrow();
    });

    it('should handle invalid options gracefully', async () => {
      const prompt = 'Create a React component';
      const invalidOptions = {
        type: 'invalid' as any,
        maxTokens: -1,
      };

      // Should either handle gracefully or throw a descriptive error
      await expect(async () => {
        await aiHub.generateWithBestModel(prompt, invalidOptions);
      }).not.toThrow('Unexpected error');
    });
  });
});