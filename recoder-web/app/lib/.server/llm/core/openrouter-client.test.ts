/**
 * OpenRouter Client Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getOpenRouterClient } from './openrouter-client.js';

describe('OpenRouterClient', () => {
  let client: ReturnType<typeof getOpenRouterClient>;

  beforeAll(() => {
    // Set a test API key if not already set
    if (!process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = 'test-key-for-unit-tests';
    }
    client = getOpenRouterClient();
  });

  describe('Client Initialization', () => {
    it('should create a client instance', () => {
      expect(client).toBeDefined();
    });

    it('should have listModels method', () => {
      expect(client.listModels).toBeDefined();
      expect(typeof client.listModels).toBe('function');
    });

    it('should have listModelEndpoints method', () => {
      expect(client.listModelEndpoints).toBeDefined();
      expect(typeof client.listModelEndpoints).toBe('function');
    });

    it('should have getModelsWithFeature method', () => {
      expect(client.getModelsWithFeature).toBeDefined();
      expect(typeof client.getModelsWithFeature).toBe('function');
    });
  });

  describe('Model Listing', () => {
    it('should list models without filters', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const models = await client.listModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it('should filter models by category', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const models = await client.listModels({ category: 'programming' });
      expect(Array.isArray(models)).toBe(true);
    });

    it('should filter models by supported parameters', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const models = await client.listModels({ supported_parameters: 'tools' });
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe('Feature-based Model Discovery', () => {
    it('should get models with tool support', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const models = await client.getModelsWithFeature('tools');
      expect(Array.isArray(models)).toBe(true);
    });

    it('should get models with vision support', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const models = await client.getModelsWithFeature('vision');
      expect(Array.isArray(models)).toBe(true);
    });

    it('should get models with streaming support', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const models = await client.getModelsWithFeature('streaming');
      expect(Array.isArray(models)).toBe(true);
    });

    it('should throw error for unknown feature', async () => {
      await expect(
        // @ts-expect-error - testing invalid input
        client.getModelsWithFeature('invalid-feature')
      ).rejects.toThrow('Unknown feature');
    });
  });

  describe('Endpoint Discovery', () => {
    it('should validate model ID format', async () => {
      await expect(
        client.listModelEndpoints('invalid-model-id')
      ).rejects.toThrow('Invalid model ID format');
    });

    it('should list endpoints for valid model', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const endpoints = await client.listModelEndpoints('anthropic/claude-3.5-sonnet');
      expect(endpoints).toBeDefined();
      expect(endpoints.id).toBeDefined();
      expect(endpoints.name).toBeDefined();
      expect(Array.isArray(endpoints.endpoints)).toBe(true);
    });
  });

  describe('Content Generation', () => {
    it('should generate content with basic parameters', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const result = await client.generateContent({
        messages: [
          { role: 'user', content: 'Say hello' }
        ],
        temperature: 0.7,
        maxTokens: 50
      });

      // Type guard to check if it's a non-streaming response
      if ('response' in result) {
        expect(result.response).toBeDefined();
        expect(typeof result.response.text()).toBe('string');
      }
    });

    it('should handle custom model parameter', async () => {
      // Skip if no real API key
      if (process.env.OPENROUTER_API_KEY === 'test-key-for-unit-tests') {
        return;
      }

      const result = await client.generateContent({
        model: 'deepseek/deepseek-chat-v3.1:free',
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      });

      // Type guard to check if it's a non-streaming response
      if ('response' in result) {
        expect(result.response).toBeDefined();
      }
    });
  });

  describe('Model Info', () => {
    it('should get model info', () => {
      const info = client.getModel('test-model');
      expect(info).toBeDefined();
      expect(info.model).toBeDefined();
      expect(info.displayName).toBeDefined();
    });

    it('should use default model if none specified', () => {
      const info = client.getModel();
      expect(info.model).toBeDefined();
    });
  });
});
