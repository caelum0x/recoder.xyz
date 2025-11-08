/**
 * Core Command Tests
 * Tests for essential interactive chat commands
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { CommandContext } from '../../src/ui/commands/types';

// Mock context builder
function createMockContext(): Partial<CommandContext> {
  return {
    services: {
      config: {
        getContentGeneratorConfig: () => ({ authType: 'qwen-oauth' }),
        getModel: () => 'google/gemini-2.0-flash-exp:free',
        storage: {
          getProjectTempDir: () => '/tmp/recoder-code-test',
        },
      },
    },
    history: [],
    historyTimeline: [],
    settings: {
      merged: {
        experimental: {
          visionModelPreview: true,
        },
      },
    },
  } as any;
}

describe('Core Commands', () => {
  let mockContext: Partial<CommandContext>;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('/help', () => {
    it('should display list of available commands', async () => {
      const { helpCommand } = await import('../../src/ui/commands/helpCommand.js');
      const result = await helpCommand.action(mockContext as any, '');
      
      expect(result.type).toBe('message');
      expect(result.content).toContain('Available commands:' || 'command');
      expect(result.messageType).toBe('info');
    });
  });

  describe('/about', () => {
    it('should display version and system information', async () => {
      const { aboutCommand } = await import('../../src/ui/commands/aboutCommand.js');
      const result = await aboutCommand.action(mockContext as any, '');
      
      expect(result.type).toBe('dialog');
      expect(result.dialog).toBe('about');
    });
  });

  describe('/clear', () => {
    it('should clear conversation history', async () => {
      const { clearCommand } = await import('../../src/ui/commands/clearCommand.js');
      mockContext.history = [
        { id: '1', role: 'user', parts: [] },
        { id: '2', role: 'model', parts: [] },
      ] as any;
      
      const result = await clearCommand.action(mockContext as any, '');
      
      expect(result.type).toBe('message');
      expect(result.content).toContain('cleared' || 'Cleared');
    });
  });

  describe('/quit', () => {
    it('should show quit confirmation', async () => {
      const { quitCommand } = await import('../../src/ui/commands/quitCommand.js');
      const result = await quitCommand.action(mockContext as any, '');
      
      expect(result.type).toBe('dialog');
      expect(result.dialog).toBe('quit-confirm');
    });
  });

  describe('/theme', () => {
    it('should show theme selection dialog', async () => {
      const { themeCommand } = await import('../../src/ui/commands/themeCommand.js');
      const result = await themeCommand.action(mockContext as any, '');
      
      expect(result.type).toBe('dialog');
      expect(result.dialog).toBe('theme');
    });
  });

  describe('/vim', () => {
    it('should toggle vim mode', async () => {
      const { vimCommand } = await import('../../src/ui/commands/vimCommand.js');
      const result = await vimCommand.action(mockContext as any, '');
      
      expect(result.type).toBe('message');
      expect(result.content).toContain('Vim mode' || 'vim');
    });
  });
});
