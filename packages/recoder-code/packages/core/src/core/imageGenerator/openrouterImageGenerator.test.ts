/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterImageGenerator } from './openrouterImageGenerator.js';
import type { ImageGenerationOptions } from './types.js';

describe('OpenRouterImageGenerator', () => {
  beforeEach(() => {
    // Set environment variables for testing
    process.env['OPENROUTER_API_KEY'] = 'test-api-key';
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with environment variables', () => {
      const generator = new OpenRouterImageGenerator();
      expect(generator).toBeInstanceOf(OpenRouterImageGenerator);
    });

    it('should throw error if no API key is provided', () => {
      delete process.env['OPENROUTER_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      
      expect(() => new OpenRouterImageGenerator()).toThrow(
        'API key is required'
      );
    });

    it('should accept custom API key', () => {
      const generator = new OpenRouterImageGenerator('custom-key');
      expect(generator).toBeInstanceOf(OpenRouterImageGenerator);
    });
  });

  describe('generate', () => {
    it('should require a prompt', async () => {
      const generator = new OpenRouterImageGenerator();
      const options: ImageGenerationOptions = { prompt: '' };
      
      await expect(generator.generate(options)).rejects.toThrow();
    });

    it('should use default model if not specified', async () => {
      const generator = new OpenRouterImageGenerator();
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-openrouter-generation-id') return 'gen-img-1';
            if (name === 'x-openrouter-cost') return '0.03';
            return null;
          },
        },
        json: async () => ({
          data: [{ url: 'https://example.com/image.png' }],
        }),
      } as Response);

      const options: ImageGenerationOptions = {
        prompt: 'a beautiful sunset',
      };

      await generator.generate(options);
      
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('listModels', () => {
    it('should return available image generation models', () => {
      const models = OpenRouterImageGenerator.listModels();
      
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('provider');
    });

    it('should include DALL-E models', () => {
      const models = OpenRouterImageGenerator.listModels();
      const dalleModels = models.filter(m => m.id.includes('dall-e'));
      
      expect(dalleModels.length).toBeGreaterThan(0);
    });

    it('should include Gemini image models', () => {
      const models = OpenRouterImageGenerator.listModels();
      const geminiModels = models.filter(m => m.id.includes('gemini-2.5-flash-image'));
      
      expect(geminiModels.length).toBeGreaterThan(0);
    });
  });

  describe('model capabilities', () => {
    it('should list models with different capabilities', () => {
      const models = OpenRouterImageGenerator.listModels();
      
      // Check for models with known capability flags
      const hasQuality = models.some(m =>
        m.capabilities.some(c => c.includes('quality'))
      );
      const hasStyle = models.some(m =>
        m.capabilities.some(c => c.includes('style'))
      );

      expect(hasQuality || hasStyle).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const generator = new OpenRouterImageGenerator();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid parameters' } }),
      } as Response);

      const options: ImageGenerationOptions = {
        prompt: 'test',
      };

      await expect(generator.generate(options)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const generator = new OpenRouterImageGenerator();
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const options: ImageGenerationOptions = {
        prompt: 'test',
      };

      await expect(generator.generate(options)).rejects.toThrow('Network error');
    });
  });
});
