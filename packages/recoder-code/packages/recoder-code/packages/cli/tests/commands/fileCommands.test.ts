/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { filesCommand } from '../../src/ui/commands/filesCommand.js';
import { searchCommand } from '../../src/ui/commands/searchCommand.js';
import { findCommand } from '../../src/ui/commands/findCommand.js';
import { treeCommand } from '../../src/ui/commands/treeCommand.js';
import { webCommand } from '../../src/ui/commands/webCommand.js';
import type { CommandContext } from '../../src/ui/commands/types.js';

describe('File and Codebase Commands', () => {
  describe('filesCommand', () => {
    it('should have correct metadata', () => {
      expect(filesCommand.name).toBe('files');
      expect(filesCommand.description).toBe('List and explore project files');
      expect(filesCommand.action).toBeDefined();
    });

    it('should return error when config is missing', () => {
      const mockContext = {
        services: {
          config: null,
        },
      } as unknown as CommandContext;

      const result = filesCommand.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should return tool action with correct parameters', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'ls' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = filesCommand.action?.(mockContext, 'src --recursive');
      expect(result).toEqual({
        type: 'tool',
        toolName: 'ls',
        toolArgs: {
          path: 'src',
          recursive: 'true',
        },
      });
    });
  });

  describe('searchCommand', () => {
    it('should have correct metadata', () => {
      expect(searchCommand.name).toBe('search');
      expect(searchCommand.description).toBe('Search codebase content');
      expect(searchCommand.action).toBeDefined();
    });

    it('should return error when pattern is missing', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'ripgrep' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = searchCommand.action?.(mockContext, '');
      expect(result?.type).toBe('message');
      if (result?.type === 'message') {
        expect(result.content).toContain('provide a search pattern');
      }
    });

    it('should return tool action with correct parameters', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'ripgrep' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = searchCommand.action?.(mockContext, '"function" --file-pattern "*.ts"');
      expect(result).toEqual({
        type: 'tool',
        toolName: 'ripgrep',
        toolArgs: {
          pattern: 'function',
          file_pattern: '*.ts',
        },
      });
    });
  });

  describe('findCommand', () => {
    it('should have correct metadata', () => {
      expect(findCommand.name).toBe('find');
      expect(findCommand.description).toBe('Find files by name or pattern');
      expect(findCommand.action).toBeDefined();
    });

    it('should return error when pattern is missing', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'glob' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = findCommand.action?.(mockContext, '');
      expect(result?.type).toBe('message');
      if (result?.type === 'message') {
        expect(result.content).toContain('provide a file pattern');
      }
    });

    it('should return tool action with correct pattern', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'glob' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = findCommand.action?.(mockContext, '"*.ts"');
      expect(result).toEqual({
        type: 'tool',
        toolName: 'glob',
        toolArgs: {
          pattern: '*.ts',
        },
      });
    });
  });

  describe('treeCommand', () => {
    it('should have correct metadata', () => {
      expect(treeCommand.name).toBe('tree');
      expect(treeCommand.description).toBe('Show directory tree structure');
      expect(treeCommand.action).toBeDefined();
    });

    it('should return tool action with recursive option', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'ls' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = treeCommand.action?.(mockContext, 'src --depth 2');
      expect(result).toEqual({
        type: 'tool',
        toolName: 'ls',
        toolArgs: {
          path: 'src',
          recursive: 'true',
          depth: '2',
        },
      });
    });
  });

  describe('webCommand', () => {
    it('should have correct metadata', () => {
      expect(webCommand.name).toBe('web');
      expect(webCommand.description).toBe('Search the web for information');
      expect(webCommand.action).toBeDefined();
    });

    it('should return error when query is missing', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'web-search' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = webCommand.action?.(mockContext, '');
      expect(result?.type).toBe('message');
      if (result?.type === 'message') {
        expect(result.content).toContain('provide a search query');
      }
    });

    it('should return tool action with correct query', () => {
      const mockContext = {
        services: {
          config: {
            getToolRegistry: vi.fn().mockReturnValue({
              getTool: vi.fn().mockReturnValue({ name: 'web-search' }),
            }),
          },
        },
      } as unknown as CommandContext;

      const result = webCommand.action?.(mockContext, '"TypeScript async await"');
      expect(result).toEqual({
        type: 'tool',
        toolName: 'web-search',
        toolArgs: {
          query: 'TypeScript async await',
        },
      });
    });
  });
});
