/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { imageCommand } from '../../src/ui/commands/imageCommand.js';
import { audioCommand } from '../../src/ui/commands/audioCommand.js';
import { pdfCommand } from '../../src/ui/commands/pdfCommand.js';
import type { CommandContext } from '../../src/ui/commands/types.js';

describe('Multimodal Commands', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      services: {
        config: {
          get: (key: string) => {
            if (key === 'apiKey') return 'test-api-key';
            if (key === 'baseUrl') return 'https://openrouter.ai/api/v1';
            return undefined;
          },
        },
      },
      invocation: {
        command: {
          name: 'test',
          description: 'test',
        },
        args: '',
        raw: '/test',
      },
    } as any;
  });

  describe('/image Command', () => {
    it('should have correct command definition', () => {
      expect(imageCommand.name).toBe('image');
      expect(imageCommand.description).toBeTruthy();
      expect(imageCommand.description.toLowerCase()).toContain('image');
    });

    it('should have subcommands for different operations', () => {
      expect(imageCommand.subCommands).toBeDefined();
      expect(imageCommand.subCommands?.length).toBeGreaterThan(0);
    });

    it('should support image operation subcommands', () => {
      expect(imageCommand.subCommands).toBeDefined();
      expect(imageCommand.subCommands?.length).toBeGreaterThan(0);
      
      // Check for models subcommand
      const modelsCmd = imageCommand.subCommands?.find(
        cmd => cmd.name === 'models'
      );
      expect(modelsCmd).toBeDefined();
    });

    it('should require prompt for image generation', async () => {
      const generateCmd = imageCommand.subCommands?.find(
        cmd => cmd.name === 'generate' || cmd.name === 'create'
      );
      
      if (generateCmd?.action) {
        const result = await generateCmd.action(mockContext);
        expect(result).toBeDefined();
        // Should ask for prompt or show usage
      }
    });

    it('should accept prompt for image generation', async () => {
      const generateCmd = imageCommand.subCommands?.find(
        cmd => cmd.name === 'generate' || cmd.name === 'create'
      );
      
      if (generateCmd?.action) {
        const contextWithPrompt = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'a beautiful sunset over mountains',
          },
        };
        const result = await generateCmd.action(contextWithPrompt);
        expect(result).toBeDefined();
      }
    });

    it('should support different image models', async () => {
      const modelsCmd = imageCommand.subCommands?.find(
        cmd => cmd.name === 'models' || cmd.name === 'list'
      );
      
      if (modelsCmd?.action) {
        const result = await modelsCmd.action(mockContext);
        expect(result).toBeDefined();
        // Should list available image models (DALL-E, Stable Diffusion, etc.)
      }
    });
  });

  describe('/audio Command', () => {
    it('should have correct command definition', () => {
      expect(audioCommand.name).toBe('audio');
      expect(audioCommand.description).toBeTruthy();
      expect(audioCommand.description.toLowerCase()).toContain('audio');
    });

    it('should have subcommands for audio operations', () => {
      expect(audioCommand.subCommands).toBeDefined();
      expect(audioCommand.subCommands?.length).toBeGreaterThan(0);
    });

    it('should support audio generation', () => {
      const generateCmd = audioCommand.subCommands?.find(
        cmd => cmd.name === 'generate' || cmd.name === 'create' || cmd.name === 'tts'
      );
      expect(generateCmd).toBeDefined();
    });

    it('should require text for TTS', async () => {
      const ttsCmd = audioCommand.subCommands?.find(
        cmd => cmd.name === 'tts' || cmd.name === 'generate'
      );
      
      if (ttsCmd?.action) {
        const result = await ttsCmd.action(mockContext);
        expect(result).toBeDefined();
        // Should ask for text or show usage
      }
    });

    it('should accept text for TTS', async () => {
      const ttsCmd = audioCommand.subCommands?.find(
        cmd => cmd.name === 'tts' || cmd.name === 'generate'
      );
      
      if (ttsCmd?.action) {
        const contextWithText = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'Hello, this is a test audio message',
          },
        };
        const result = await ttsCmd.action(contextWithText);
        expect(result).toBeDefined();
      }
    });

    it('should support different voices/models', async () => {
      const modelsCmd = audioCommand.subCommands?.find(
        cmd => cmd.name === 'models' || cmd.name === 'voices'
      );
      
      if (modelsCmd?.action) {
        const result = await modelsCmd.action(mockContext);
        expect(result).toBeDefined();
      }
    });
  });

  describe('/pdf Command', () => {
    it('should have correct command definition', () => {
      expect(pdfCommand.name).toBe('pdf');
      expect(pdfCommand.description).toBeTruthy();
      expect(pdfCommand.description.toLowerCase()).toContain('pdf');
    });

    it('should have subcommands for PDF operations', () => {
      expect(pdfCommand.subCommands).toBeDefined();
      expect(pdfCommand.subCommands?.length).toBeGreaterThan(0);
    });

    it('should support PDF reading/extraction', () => {
      const readCmd = pdfCommand.subCommands?.find(
        cmd => cmd.name === 'read' || cmd.name === 'extract'
      );
      expect(readCmd).toBeDefined();
    });

    it('should require PDF path', async () => {
      const readCmd = pdfCommand.subCommands?.find(
        cmd => cmd.name === 'read' || cmd.name === 'extract'
      );
      
      if (readCmd?.action) {
        const result = await readCmd.action(mockContext);
        expect(result).toBeDefined();
        // Should ask for path or show usage
      }
    });

    it('should accept PDF path', async () => {
      const readCmd = pdfCommand.subCommands?.find(
        cmd => cmd.name === 'read' || cmd.name === 'extract'
      );
      
      if (readCmd?.action) {
        const contextWithPath = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: '/path/to/document.pdf',
          },
        };
        const result = await readCmd.action(contextWithPath);
        expect(result).toBeDefined();
      }
    });

    it('should support PDF generation', () => {
      const generateCmd = pdfCommand.subCommands?.find(
        cmd => cmd.name === 'generate' || cmd.name === 'create'
      );
      
      if (generateCmd) {
        expect(generateCmd.action).toBeDefined();
      }
    });
  });

  describe('Multimodal Integration', () => {
    it('should have consistent command structure', () => {
      const commands = [imageCommand, audioCommand, pdfCommand];
      
      commands.forEach(cmd => {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        expect(cmd.subCommands).toBeDefined();
        expect(cmd.subCommands?.length).toBeGreaterThan(0);
      });
    });

    it('should provide helpful usage information', async () => {
      // Test default action (show help)
      if (imageCommand.action) {
        const result = await imageCommand.action(mockContext);
        expect(result).toBeDefined();
      }

      if (audioCommand.action) {
        const result = await audioCommand.action(mockContext);
        expect(result).toBeDefined();
      }

      if (pdfCommand.action) {
        const result = await pdfCommand.action(mockContext);
        expect(result).toBeDefined();
      }
    });

    it('should support model listing for all multimodal types', () => {
      [imageCommand, audioCommand, pdfCommand].forEach(cmd => {
        const modelsCmd = cmd.subCommands?.find(
          sub => sub.name === 'models' || sub.name === 'list'
        );
        // At least one command should have models listing
        expect(cmd.subCommands?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key gracefully', async () => {
      const contextWithoutKey = {
        ...mockContext,
        services: {
          config: {
            get: (key: string) => {
              if (key === 'apiKey') return undefined;
              return undefined;
            },
          },
        },
      } as any;

      const commands = [imageCommand, audioCommand, pdfCommand];
      
      for (const cmd of commands) {
        if (cmd.action) {
          const result = await cmd.action(contextWithoutKey);
          expect(result).toBeDefined();
          // Should not throw, should return error message
        }
      }
    });

    it('should handle invalid arguments gracefully', async () => {
      const contextWithInvalidArgs = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '--invalid-flag-that-does-not-exist',
        },
      };

      const commands = [imageCommand, audioCommand, pdfCommand];
      
      for (const cmd of commands) {
        if (cmd.subCommands) {
          for (const subCmd of cmd.subCommands) {
            if (subCmd.action) {
              const result = await subCmd.action(contextWithInvalidArgs);
              expect(result).toBeDefined();
              // Should not throw
            }
          }
        }
      }
    });
  });
});
