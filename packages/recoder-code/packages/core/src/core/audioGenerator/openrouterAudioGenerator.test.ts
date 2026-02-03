/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterAudioGenerator } from './openrouterAudioGenerator.js';
import type { TranscriptionOptions, TextToSpeechOptions } from './types.js';

describe('OpenRouterAudioGenerator', () => {
  beforeEach(() => {
    process.env['OPENROUTER_API_KEY'] = 'test-api-key';
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with environment variables', () => {
      const generator = new OpenRouterAudioGenerator();
      expect(generator).toBeInstanceOf(OpenRouterAudioGenerator);
    });

    it('should throw error if no API key is provided', () => {
      delete process.env['OPENROUTER_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      
      expect(() => new OpenRouterAudioGenerator()).toThrow(
        'API key is required'
      );
    });
  });

  describe('transcribe', () => {
    it('should require an audio file', async () => {
      const generator = new OpenRouterAudioGenerator();
      const options: TranscriptionOptions = { audioFile: '' };
      
      await expect(generator.transcribe(options)).rejects.toThrow();
    });

    it('should transcribe audio file', async () => {
      const generator = new OpenRouterAudioGenerator();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-openrouter-generation-id') return 'gen-123';
            if (name === 'x-openrouter-cost') return '0.01';
            return null;
          },
        },
        json: async () => ({
          text: 'Transcribed text',
          language: 'en',
        }),
      } as Response);

      const options: TranscriptionOptions = {
        audioFile: Buffer.from('fake audio data'),
      };

      const result = await generator.transcribe(options);
      expect(result.text).toBe('Transcribed text');
      expect(result.language).toBe('en');
    });
  });

  describe('textToSpeech', () => {
    it('should require text input', async () => {
      const generator = new OpenRouterAudioGenerator();
      const options: TextToSpeechOptions = { text: '' };
      
      await expect(generator.textToSpeech(options)).rejects.toThrow();
    });

    it('should generate speech from text', async () => {
      const generator = new OpenRouterAudioGenerator();
      const mockAudio = Buffer.from('fake audio data');
      
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-openrouter-generation-id') return 'gen-tts-1';
            if (name === 'x-openrouter-cost') return '0.02';
            return null;
          },
        },
        arrayBuffer: async () => mockAudio.buffer,
      } as Response);

      const options: TextToSpeechOptions = {
        text: 'Hello world',
      };

      const result = await generator.textToSpeech(options);
      expect(result.audio).toBeInstanceOf(Buffer);
    });
  });

  describe('translate', () => {
    it('should translate audio to English', async () => {
      const generator = new OpenRouterAudioGenerator();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-openrouter-generation-id') return 'gen-translate-1';
            if (name === 'x-openrouter-cost') return '0.01';
            return null;
          },
        },
        json: async () => ({
          text: 'Translated to English',
        }),
      } as Response);

      const result = await generator.translate({
        audioFile: Buffer.from('fake audio data'),
      });

      expect(result.text).toBe('Translated to English');
    });
  });

  describe('listModels', () => {
    it('should return available audio models', () => {
      const models = OpenRouterAudioGenerator.listModels();
      
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include transcription models', () => {
      const models = OpenRouterAudioGenerator.listModels();
      const transcriptionModels = models.filter(m => m.type === 'transcription');
      
      expect(transcriptionModels.length).toBeGreaterThan(0);
    });

    it('should include TTS models', () => {
      const models = OpenRouterAudioGenerator.listModels();
      const ttsModels = models.filter(m => m.type === 'tts');
      
      expect(ttsModels.length).toBeGreaterThan(0);
    });
  });
});
