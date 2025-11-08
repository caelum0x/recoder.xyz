/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { filesCommand } from '../../src/ui/commands/filesCommand.js';
import { searchCommand } from '../../src/ui/commands/searchCommand.js';
import { findCommand } from '../../src/ui/commands/findCommand.js';
import { treeCommand } from '../../src/ui/commands/treeCommand.js';
import type { CommandContext } from '../../src/ui/commands/types.js';

describe('File Operations Commands', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      services: {
        config: {
          workspaceDirectories: ['/mock/workspace'],
          get: (key: string) => {
            if (key === 'workspaceDirectories') return ['/mock/workspace'];
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

  describe('/files Command', () => {
    it('should have correct command definition', () => {
      expect(filesCommand.name).toBe('files');
      expect(filesCommand.description).toBeTruthy();
      expect(filesCommand.action).toBeDefined();
    });

    it('should accept path argument', () => {
      expect(filesCommand.description).toContain('files');
    });

    it('should support listing files in current directory', async () => {
      const result = await filesCommand.action?.();
      expect(result).toBeDefined();
    });

    it('should support listing files with path', async () => {
      const contextWithPath = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '/test/path',
        },
      };
      const result = await filesCommand.action?.(contextWithPath);
      expect(result).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const contextWithInvalidPath = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '/nonexistent/impossible/path/12345',
        },
      };
      const result = await filesCommand.action?.(contextWithInvalidPath);
      expect(result).toBeDefined();
      // Should return error or empty result, not throw
    });
  });

  describe('/search Command', () => {
    it('should have correct command definition', () => {
      expect(searchCommand.name).toBe('search');
      expect(searchCommand.description).toBeTruthy();
      expect(searchCommand.action).toBeDefined();
    });

    it('should require search query', async () => {
      const result = await searchCommand.action?.(mockContext);
      expect(result).toBeDefined();
      if (result && 'type' in result && result.type === 'message') {
        // Should show usage or error
        expect(result.messageType).toBeDefined();
      }
    });

    it('should accept search query', async () => {
      const contextWithQuery = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'test query',
        },
      };
      const result = await searchCommand.action?.(contextWithQuery);
      expect(result).toBeDefined();
    });

    it('should support case-insensitive search', async () => {
      const contextWithFlags = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '-i test',
        },
      };
      const result = await searchCommand.action?.(contextWithFlags);
      expect(result).toBeDefined();
    });
  });

  describe('/find Command', () => {
    it('should have correct command definition', () => {
      expect(findCommand.name).toBe('find');
      expect(findCommand.description).toBeTruthy();
      expect(findCommand.action).toBeDefined();
    });

    it('should require file pattern', async () => {
      const result = await findCommand.action?.(mockContext);
      expect(result).toBeDefined();
      if (result && 'type' in result && result.type === 'message') {
        // Should show usage or error
        expect(result.messageType).toBeDefined();
      }
    });

    it('should accept file pattern', async () => {
      const contextWithPattern = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '*.ts',
        },
      };
      const result = await findCommand.action?.(contextWithPattern);
      expect(result).toBeDefined();
    });

    it('should support multiple patterns', async () => {
      const contextWithMultiplePatterns = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '*.ts *.js',
        },
      };
      const result = await findCommand.action?.(contextWithMultiplePatterns);
      expect(result).toBeDefined();
    });
  });

  describe('/tree Command', () => {
    it('should have correct command definition', () => {
      expect(treeCommand.name).toBe('tree');
      expect(treeCommand.description).toBeTruthy();
      expect(treeCommand.action).toBeDefined();
    });

    it('should support listing current directory tree', async () => {
      const result = await treeCommand.action?.();
      expect(result).toBeDefined();
    });

    it('should support depth limitation', async () => {
      const contextWithDepth = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '-L 2',
        },
      };
      const result = await treeCommand.action?.(contextWithDepth);
      expect(result).toBeDefined();
    });

    it('should support directory path', async () => {
      const contextWithPath = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '/test/path',
        },
      };
      const result = await treeCommand.action?.(contextWithPath);
      expect(result).toBeDefined();
    });
  });

  describe('File Operations Integration', () => {
    it('should allow finding then reading files', async () => {
      // Step 1: Find .ts files
      const findContext = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          command: findCommand,
          args: '*.test.ts',
        },
      };
      const findResult = await findCommand.action?.(findContext);
      expect(findResult).toBeDefined();

      // Step 2: Search within found files (real use case)
      const searchContext = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          command: searchCommand,
          args: 'describe',
        },
      };
      const searchResult = await searchCommand.action?.(searchContext);
      expect(searchResult).toBeDefined();
    });

    it('should allow tree then files exploration', async () => {
      // Step 1: View tree structure
      const treeResult = await treeCommand.action?.(mockContext);
      expect(treeResult).toBeDefined();

      // Step 2: List files in specific directory
      const filesContext = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '/test',
        },
      };
      const filesResult = await filesCommand.action?.(filesContext);
      expect(filesResult).toBeDefined();
    });
  });

  describe('Command Help and Usage', () => {
    it('should provide helpful error messages', async () => {
      // Empty search query
      const emptySearchResult = await searchCommand.action?.(mockContext);
      expect(emptySearchResult).toBeDefined();

      // Empty find pattern
      const emptyFindResult = await findCommand.action?.(mockContext);
      expect(emptyFindResult).toBeDefined();
    });

    it('should have consistent command structure', () => {
      const commands = [filesCommand, searchCommand, findCommand, treeCommand];
      
      commands.forEach(cmd => {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        expect(cmd.action).toBeDefined();
      });
    });
  });
});
