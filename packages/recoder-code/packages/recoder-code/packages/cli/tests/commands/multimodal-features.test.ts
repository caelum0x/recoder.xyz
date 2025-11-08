/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { imageCommand } from '../../src/ui/commands/imageCommand.js';
import { audioCommand } from '../../src/ui/commands/audioCommand.js';
import { pdfCommand } from '../../src/ui/commands/pdfCommand.js';
import { byokCommand } from '../../src/ui/commands/byokCommand.js';

describe('Multimodal Features Tests', () => {
  describe('Image Generation Command', () => {
    it('should have correct structure and properties', () => {
      expect(imageCommand.name).toBe('image');
      expect(imageCommand.description).toContain('Generate images');
      expect(imageCommand.action).toBeDefined();
    });

    it('should have subcommands', () => {
      expect(imageCommand.subCommands).toBeDefined();
      expect(imageCommand.subCommands?.length).toBeGreaterThan(0);
      
      const modelsCmd = imageCommand.subCommands?.find(cmd => cmd.name === 'models');
      expect(modelsCmd).toBeDefined();
      expect(modelsCmd?.action).toBeDefined();
      
      const helpCmd = imageCommand.subCommands?.find(cmd => cmd.name === 'help');
      expect(helpCmd).toBeDefined();
      expect(helpCmd?.action).toBeDefined();
    });

    it('should show help when called without arguments', async () => {
      const mockContext: any = {
        invocation: {
          args: '',
        },
      };

      const result = await imageCommand.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('Image Generation');
      expect(result?.content).toContain('Usage:');
    });

    it('should list available models', async () => {
      const modelsCmd = imageCommand.subCommands?.find(cmd => cmd.name === 'models');
      const result = await modelsCmd?.action?.();
      
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('Available Image Generation Models');
    });
  });

  describe('Audio Command', () => {
    it('should have correct structure and properties', () => {
      expect(audioCommand.name).toBe('audio');
      expect(audioCommand.description).toContain('Audio');
      expect(audioCommand.action).toBeDefined();
    });

    it('should have transcribe, tts, translate subcommands', () => {
      expect(audioCommand.subCommands).toBeDefined();
      
      const transcribeCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'transcribe');
      expect(transcribeCmd).toBeDefined();
      expect(transcribeCmd?.description).toContain('Transcribe');
      
      const ttsCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'tts');
      expect(ttsCmd).toBeDefined();
      expect(ttsCmd?.description).toContain('text to speech');
      
      const translateCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'translate');
      expect(translateCmd).toBeDefined();
      expect(translateCmd?.description).toContain('Translate');
      
      const modelsCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'models');
      expect(modelsCmd).toBeDefined();
    });

    it('should show help when called without arguments', async () => {
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await audioCommand.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('Audio Features');
    });

    it('should list available audio models', async () => {
      const modelsCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'models');
      const result = await modelsCmd?.action?.();
      
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('Available Audio Models');
    });
  });

  describe('PDF Processing Command', () => {
    it('should have correct structure and properties', () => {
      expect(pdfCommand.name).toBe('pdf');
      expect(pdfCommand.description).toContain('PDF');
      expect(pdfCommand.action).toBeDefined();
    });

    it('should have extract, chat, models subcommands', () => {
      expect(pdfCommand.subCommands).toBeDefined();
      
      const extractCmd = pdfCommand.subCommands?.find(cmd => cmd.name === 'extract');
      expect(extractCmd).toBeDefined();
      expect(extractCmd?.description).toContain('Extract');
      
      const chatCmd = pdfCommand.subCommands?.find(cmd => cmd.name === 'chat');
      expect(chatCmd).toBeDefined();
      expect(chatCmd?.description).toContain('questions');
      
      const modelsCmd = pdfCommand.subCommands?.find(cmd => cmd.name === 'models');
      expect(modelsCmd).toBeDefined();
    });

    it('should show help when called without arguments', async () => {
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await pdfCommand.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('PDF Processing');
    });

    it('should list PDF-capable models', async () => {
      const modelsCmd = pdfCommand.subCommands?.find(cmd => cmd.name === 'models');
      const result = await modelsCmd?.action?.();
      
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('PDF-Capable Models');
    });
  });

  describe('BYOK (Bring Your Own Key) Command', () => {
    it('should have correct structure and properties', () => {
      expect(byokCommand.name).toBe('byok');
      expect(byokCommand.description).toContain('Bring Your Own Keys');
      expect(byokCommand.action).toBeDefined();
    });

    it('should have add, remove, test, oauth subcommands', () => {
      expect(byokCommand.subCommands).toBeDefined();
      
      const addCmd = byokCommand.subCommands?.find(cmd => cmd.name === 'add');
      expect(addCmd).toBeDefined();
      expect(addCmd?.description).toContain('Add');
      
      const removeCmd = byokCommand.subCommands?.find(cmd => cmd.name === 'remove');
      expect(removeCmd).toBeDefined();
      expect(removeCmd?.description).toContain('Remove');
      
      const testCmd = byokCommand.subCommands?.find(cmd => cmd.name === 'test');
      expect(testCmd).toBeDefined();
      expect(testCmd?.description).toContain('Test');
      
      const oauthCmd = byokCommand.subCommands?.find(cmd => cmd.name === 'oauth');
      expect(oauthCmd).toBeDefined();
      expect(oauthCmd?.description).toContain('OAuth');
    });

    it('should show configured providers when called', async () => {
      const result = await byokCommand.action?.();
      expect(result).toBeDefined();
      expect(result?.type).toBe('message');
      expect(result?.content).toContain('BYOK');
      expect(result?.content).toContain('Configured Providers');
    });
  });

  describe('Feature Integration', () => {
    it('should have all multimodal commands registered', () => {
      const commands = [imageCommand, audioCommand, pdfCommand, byokCommand];
      
      commands.forEach(cmd => {
        expect(cmd.name).toBeDefined();
        expect(cmd.description).toBeDefined();
        expect(cmd.action).toBeDefined();
      });
    });

    it('should have consistent command structure', () => {
      const commands = [imageCommand, audioCommand, pdfCommand, byokCommand];
      
      commands.forEach(cmd => {
        expect(cmd).toHaveProperty('name');
        expect(cmd).toHaveProperty('description');
        expect(cmd).toHaveProperty('action');
        expect(cmd).toHaveProperty('kind');
      });
    });

    it('should have help documentation for all commands', async () => {
      const commands = [
        { cmd: imageCommand, context: { invocation: { args: '' } }, keyword: 'Usage:' },
        { cmd: audioCommand, context: { invocation: { args: '' } }, keyword: 'Commands' },
        { cmd: pdfCommand, context: { invocation: { args: '' } }, keyword: 'Commands' },
      ];

      for (const { cmd, context, keyword } of commands) {
        const result = await cmd.action?.(context as any);
        expect(result).toBeDefined();
        expect(result?.content).toBeTruthy();
        expect(result?.content).toContain(keyword);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing arguments gracefully in transcribe', async () => {
      const transcribeCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'transcribe');
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await transcribeCmd?.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Usage:');
    });

    it('should handle missing arguments gracefully in tts', async () => {
      const ttsCmd = audioCommand.subCommands?.find(cmd => cmd.name === 'tts');
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await ttsCmd?.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Usage:');
    });

    it('should handle missing arguments gracefully in PDF extract', async () => {
      const extractCmd = pdfCommand.subCommands?.find(cmd => cmd.name === 'extract');
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await extractCmd?.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Usage:');
    });

    it('should handle missing arguments gracefully in PDF chat', async () => {
      const chatCmd = pdfCommand.subCommands?.find(cmd => cmd.name === 'chat');
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await chatCmd?.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Usage:');
    });

    it('should handle missing arguments gracefully in BYOK add', async () => {
      const addCmd = byokCommand.subCommands?.find(cmd => cmd.name === 'add');
      const mockContext: any = {
        invocation: { args: '' },
      };

      const result = await addCmd?.action?.(mockContext);
      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Usage:');
    });
  });
});
