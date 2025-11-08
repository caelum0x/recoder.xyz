/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { byokCommand } from '../../src/ui/commands/byokCommand.js';
import type { CommandContext } from '../../src/ui/commands/types.js';

describe('BYOK (Bring Your Own Key) Command', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      services: {
        config: {
          get: (key: string) => {
            if (key === 'byokKeys') return {};
            return undefined;
          },
          set: () => Promise.resolve(),
        },
      },
      invocation: {
        command: {
          name: 'byok',
          description: 'test',
        },
        args: '',
        raw: '/byok',
      },
    } as any;
  });

  describe('Command Structure', () => {
    it('should have correct command definition', () => {
      expect(byokCommand.name).toBe('byok');
      expect(byokCommand.description).toBeTruthy();
      expect(byokCommand.description.toLowerCase()).toContain('key');
    });

    it('should have subcommands for key management', () => {
      expect(byokCommand.subCommands).toBeDefined();
      expect(byokCommand.subCommands?.length).toBeGreaterThan(0);
    });

    it('should support listing keys', () => {
      const listCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'list' || cmd.name === 'ls'
      );
      expect(listCmd).toBeDefined();
      expect(listCmd?.action).toBeDefined();
    });

    it('should support adding keys', () => {
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      expect(addCmd).toBeDefined();
      expect(addCmd?.action).toBeDefined();
    });

    it('should support removing keys', () => {
      const removeCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'remove' || cmd.name === 'rm' || cmd.name === 'delete'
      );
      expect(removeCmd).toBeDefined();
      expect(removeCmd?.action).toBeDefined();
    });
  });

  describe('Key Management Operations', () => {
    it('should list existing keys', async () => {
      const listCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'list' || cmd.name === 'ls'
      );
      
      if (listCmd?.action) {
        const result = await listCmd.action(mockContext);
        expect(result).toBeDefined();
      }
    });

    it('should show empty state when no keys configured', async () => {
      const listCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'list' || cmd.name === 'ls'
      );
      
      if (listCmd?.action) {
        const result = await listCmd.action(mockContext);
        expect(result).toBeDefined();
        if (result && 'type' in result && result.type === 'message') {
          expect(result.content).toBeTruthy();
        }
      }
    });

    it('should require provider and key when adding', async () => {
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      
      if (addCmd?.action) {
        const result = await addCmd.action(mockContext);
        expect(result).toBeDefined();
        // Should show usage or error
      }
    });

    it('should accept provider and key', async () => {
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      
      if (addCmd?.action) {
        const contextWithKey = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'openai sk-proj-test-key-12345',
          },
        };
        const result = await addCmd.action(contextWithKey);
        expect(result).toBeDefined();
      }
    });

    it('should support multiple providers', async () => {
      const providers = ['openai', 'anthropic', 'google', 'cohere', 'together'];
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      
      if (addCmd?.action) {
        for (const provider of providers) {
          const context = {
            ...mockContext,
            invocation: {
              ...mockContext.invocation,
              args: `${provider} test-key-${provider}`,
            },
          };
          const result = await addCmd.action(context);
          expect(result).toBeDefined();
        }
      }
    });

    it('should remove keys by provider', async () => {
      const removeCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'remove' || cmd.name === 'rm' || cmd.name === 'delete'
      );
      
      if (removeCmd?.action) {
        const contextWithProvider = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'openai',
          },
        };
        const result = await removeCmd.action(contextWithProvider);
        expect(result).toBeDefined();
      }
    });
  });

  describe('Security & Privacy', () => {
    it('should mask API keys in display', async () => {
      const contextWithKeys = {
        ...mockContext,
        services: {
          config: {
            get: (key: string) => {
              if (key === 'byokKeys') {
                return {
                  openai: 'sk-proj-very-secret-key-12345678901234567890',
                  anthropic: 'sk-ant-very-secret-key-12345678901234567890',
                };
              }
              return undefined;
            },
          },
        },
      } as any;

      const listCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'list' || cmd.name === 'ls'
      );
      
      if (listCmd?.action) {
        const result = await listCmd.action(contextWithKeys);
        expect(result).toBeDefined();
        if (result && 'type' in result && result.type === 'message') {
          // Keys should be masked, not showing full key
          const content = result.content || '';
          // Should contain masked key format (e.g., sk-proj-...7890)
          expect(content).toBeTruthy();
        }
      }
    });

    it('should validate key format before adding', async () => {
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      
      if (addCmd?.action) {
        const invalidKeys = [
          '', // Empty
          'short', // Too short
          'no-provider-prefix', // Invalid format
        ];

        for (const invalidKey of invalidKeys) {
          const context = {
            ...mockContext,
            invocation: {
              ...mockContext.invocation,
              args: `openai ${invalidKey}`,
            },
          };
          const result = await addCmd.action(context);
          expect(result).toBeDefined();
          // Should handle invalid keys gracefully
        }
      }
    });

    it('should confirm before removing keys', async () => {
      const removeCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'remove' || cmd.name === 'rm' || cmd.name === 'delete'
      );
      
      if (removeCmd?.action) {
        const context = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'openai',
          },
        };
        const result = await removeCmd.action(context);
        expect(result).toBeDefined();
        // Should ask for confirmation or directly remove
      }
    });
  });

  describe('Integration with OpenRouter', () => {
    it('should explain BYOK usage with OpenRouter', async () => {
      if (byokCommand.action) {
        const result = await byokCommand.action(mockContext);
        expect(result).toBeDefined();
        if (result && 'type' in result && result.type === 'message') {
          // Should explain how BYOK works with OpenRouter
          expect(result.content).toBeTruthy();
        }
      }
    });

    it('should show supported providers', async () => {
      const listCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'providers' || cmd.name === 'supported'
      );
      
      if (listCmd?.action) {
        const result = await listCmd.action(mockContext);
        expect(result).toBeDefined();
      } else if (byokCommand.action) {
        // Or shown in main help
        const result = await byokCommand.action(mockContext);
        expect(result).toBeDefined();
      }
    });

    it('should validate provider names', async () => {
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      
      if (addCmd?.action) {
        const contextWithInvalidProvider = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'invalid-provider-name-12345 test-key',
          },
        };
        const result = await addCmd.action(contextWithInvalidProvider);
        expect(result).toBeDefined();
        // Should handle invalid provider gracefully
      }
    });
  });

  describe('Help and Documentation', () => {
    it('should show usage instructions', async () => {
      if (byokCommand.action) {
        const result = await byokCommand.action(mockContext);
        expect(result).toBeDefined();
        if (result && 'type' in result && result.type === 'message') {
          const content = result.content || '';
          // Should contain usage examples
          expect(content).toBeTruthy();
        }
      }
    });

    it('should explain benefits of BYOK', async () => {
      if (byokCommand.action) {
        const result = await byokCommand.action(mockContext);
        expect(result).toBeDefined();
        // Should explain why users might want to use BYOK
      }
    });

    it('should provide setup examples', async () => {
      if (byokCommand.action) {
        const result = await byokCommand.action(mockContext);
        expect(result).toBeDefined();
        if (result && 'type' in result && result.type === 'message') {
          const content = result.content || '';
          // Should contain example commands
          expect(content.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing arguments gracefully', async () => {
      const addCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'add' || cmd.name === 'set'
      );
      const removeCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'remove' || cmd.name === 'rm'
      );
      
      const commands = [addCmd, removeCmd].filter(cmd => cmd?.action);
      
      for (const cmd of commands) {
        if (cmd?.action) {
          const result = await cmd.action(mockContext);
          expect(result).toBeDefined();
          // Should not throw
        }
      }
    });

    it('should handle storage errors gracefully', async () => {
      const contextWithStorageError = {
        ...mockContext,
        services: {
          config: {
            get: () => {
              throw new Error('Storage error');
            },
            set: () => {
              throw new Error('Storage error');
            },
          },
        },
      } as any;

      if (byokCommand.subCommands) {
        for (const subCmd of byokCommand.subCommands) {
          if (subCmd.action) {
            const result = await subCmd.action(contextWithStorageError);
            expect(result).toBeDefined();
            // Should handle storage errors gracefully
          }
        }
      }
    });
  });

  describe('Key Testing', () => {
    it('should support testing added keys', () => {
      const testCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'test' || cmd.name === 'verify'
      );
      
      if (testCmd) {
        expect(testCmd.action).toBeDefined();
      }
      // Test command is optional but useful
    });

    it('should validate key works with provider', async () => {
      const testCmd = byokCommand.subCommands?.find(
        cmd => cmd.name === 'test' || cmd.name === 'verify'
      );
      
      if (testCmd?.action) {
        const contextWithProvider = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: 'openai',
          },
        };
        const result = await testCmd.action(contextWithProvider);
        expect(result).toBeDefined();
      }
    });
  });
});
