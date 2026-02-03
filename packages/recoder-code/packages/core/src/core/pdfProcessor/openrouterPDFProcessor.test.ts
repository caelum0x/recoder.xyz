/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterPDFProcessor } from './openrouterPDFProcessor.js';
import type { PDFProcessOptions, PDFChatOptions } from './types.js';

describe('OpenRouterPDFProcessor', () => {
  beforeEach(() => {
    process.env['OPENROUTER_API_KEY'] = 'test-api-key';
    delete process.env['OPENAI_API_KEY'];
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with environment variables', () => {
      const processor = new OpenRouterPDFProcessor();
      expect(processor).toBeInstanceOf(OpenRouterPDFProcessor);
    });

    it('should throw error if no API key is provided', () => {
      delete process.env['OPENROUTER_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      
      expect(() => new OpenRouterPDFProcessor()).toThrow(
        'API key is required'
      );
    });
  });

  describe('process', () => {
    it('should require a PDF file', async () => {
      const processor = new OpenRouterPDFProcessor();
      const options: PDFProcessOptions = { pdfFile: '' };
      
      await expect(processor.process(options)).rejects.toThrow();
    });

    it('should extract text from PDF', async () => {
      const processor = new OpenRouterPDFProcessor();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-openrouter-generation-id') return 'gen-pdf-1';
            if (name === 'x-openrouter-cost') return '0.05';
            return null;
          },
        },
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  text: 'Extracted PDF content',
                  metadata: {
                    pageCount: 5,
                  },
                }),
              },
            },
          ],
        }),
      } as Response);

      const options: PDFProcessOptions = {
        pdfFile: Buffer.from('%PDF-1.4 fake pdf data'),
        outputFormat: 'json',
      };

      const result = await processor.process(options);
      expect(result.text).toBe('Extracted PDF content');
      expect(result.metadata.pageCount).toBe(5);
    });
  });

  describe('chat', () => {
    it('should require PDF file and instruction', async () => {
      const processor = new OpenRouterPDFProcessor();
      const options: PDFChatOptions = { pdfFile: '', instruction: '' };
      
      await expect(processor.chat(options)).rejects.toThrow();
    });

    it('should answer questions about PDF', async () => {
      const processor = new OpenRouterPDFProcessor();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-openrouter-cost') return '0.02';
            return null;
          },
        },
        json: async () => ({
          choices: [
            {
              message: {
                content: 'The document is about testing',
              },
            },
          ],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 50,
          },
        }),
      } as Response);

      const options: PDFChatOptions = {
        pdfFile: Buffer.from('%PDF-1.4 fake pdf data'),
        instruction: 'What is this document about?',
      };

      const result = await processor.chat(options);
      expect(result.response).toBe('The document is about testing');
    });
  });

  describe('listModels', () => {
    it('should return PDF-capable models', () => {
      const models = OpenRouterPDFProcessor.listModels();
      
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('maxFileSize');
      expect(models[0]).toHaveProperty('maxPages');
    });
  });
});
