/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { filesCommand } from '../../src/ui/commands/filesCommand.js';
import { searchCommand } from '../../src/ui/commands/searchCommand.js';
import { findCommand } from '../../src/ui/commands/findCommand.js';
import { treeCommand } from '../../src/ui/commands/treeCommand.js';
import { webCommand } from '../../src/ui/commands/webCommand.js';
import type { CommandContext, ToolActionReturn, MessageActionReturn } from '../../src/ui/commands/types.js';

describe('File Management Commands', () => {
  let mockContext: CommandContext;
  let mockToolRegistry: any;

  beforeEach(() => {
    mockToolRegistry = {
      getTool: vi.fn((name: string) => {
        const tools: Record<string, any> = {
          'ls': { name: 'ls', execute: vi.fn() },
          'grep': { name: 'grep', execute: vi.fn() },
          'ripgrep': { name: 'ripgrep', execute: vi.fn() },
          'glob': { name: 'glob', execute: vi.fn() },
          'web-search': { name: 'web-search', execute: vi.fn() },
        };
        return tools[name];
      }),
    };

    mockContext = {
      services: {
        config: {
          getToolRegistry: () => mockToolRegistry,
        },
      },
    } as any;
  });

  describe('/files command', () => {
    it('should have correct command metadata', () => {
      expect(filesCommand.name).toBe('files');
      expect(filesCommand.description).toBe('List and explore project files with filters');
      expect(filesCommand.action).toBeDefined();
    });

    it('should show help when no args provided', () => {
      const result = filesCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('File Explorer');
    });

    it('should list files in specified directory', () => {
      const result = filesCommand.action?.(mockContext, 'src') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ls');
      expect(result.toolArgs).toEqual({
        path: 'src',
        recursive: 'false',
      });
    });

    it('should support recursive listing with --recursive flag', () => {
      const result = filesCommand.action?.(mockContext, 'src --recursive') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ls');
      expect(result.toolArgs).toEqual({
        path: 'src',
        recursive: 'true',
        ignore_pattern: 'node_modules,.git,dist,build,.next,coverage',
      });
    });

    it('should support recursive listing with -r flag', () => {
      const result = filesCommand.action?.(mockContext, 'src -r') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ls');
      expect(result.toolArgs).toEqual({
        path: 'src',
        recursive: 'true',
        ignore_pattern: 'node_modules,.git,dist,build,.next,coverage',
      });
    });

    it('should return error when config is not loaded', () => {
      const noConfigContext = {
        services: { config: null },
      } as any;

      const result = filesCommand.action?.(noConfigContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Config not loaded');
    });

    it('should return error when ls tool is not available', () => {
      mockToolRegistry.getTool.mockReturnValue(null);

      const result = filesCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('File listing tool not available');
    });
  });

  describe('/search command', () => {
    it('should have correct command metadata', () => {
      expect(searchCommand.name).toBe('search');
      expect(searchCommand.description).toBe('Search codebase content with context preview');
      expect(searchCommand.action).toBeDefined();
    });

    it('should search with simple pattern', () => {
      const result = searchCommand.action?.(mockContext, '"function"') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ripgrep');
      expect(result.toolArgs).toEqual({
        pattern: 'function',
      });
    });

    it('should search with pattern without quotes', () => {
      const result = searchCommand.action?.(mockContext, 'function') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ripgrep');
      expect(result.toolArgs).toEqual({
        pattern: 'function',
      });
    });

    it('should support file pattern filter', () => {
      const result = searchCommand.action?.(
        mockContext,
        '"class User" --ext ts'
      ) as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ripgrep');
      expect(result.toolArgs).toEqual({
        pattern: 'class User',
        file_pattern: '*.ts',
      });
    });

    it('should support path filter', () => {
      const result = searchCommand.action?.(
        mockContext,
        '"TODO" --path src'
      ) as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ripgrep');
      expect(result.toolArgs).toEqual({
        pattern: 'TODO',
        path: 'src',
      });
    });

    it('should support both file pattern and path filters', () => {
      const result = searchCommand.action?.(
        mockContext,
        '"export" --ext js --path lib'
      ) as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ripgrep');
      expect(result.toolArgs).toEqual({
        pattern: 'export',
        file_pattern: '*.js',
        path: 'lib',
      });
    });

    it('should fallback to grep when ripgrep is not available', () => {
      mockToolRegistry.getTool.mockImplementation((name: string) => {
        if (name === 'ripgrep') return null;
        if (name === 'grep') return { name: 'grep', execute: vi.fn() };
        return null;
      });

      const result = searchCommand.action?.(mockContext, 'test') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('grep');
    });

    it('should return error when no pattern provided', () => {
      const result = searchCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('Smart Code Search');
    });

    it('should return error when search tool is not available', () => {
      mockToolRegistry.getTool.mockReturnValue(null);

      const result = searchCommand.action?.(mockContext, 'test') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Search tool not available');
    });
  });

  describe('/find command', () => {
    it('should have correct command metadata', () => {
      expect(findCommand.name).toBe('find');
      expect(findCommand.description).toBe('Find files by name with fuzzy matching');
      expect(findCommand.action).toBeDefined();
    });

    it('should find files with simple pattern', () => {
      const result = findCommand.action?.(mockContext, '"*.ts"') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('glob');
      expect(result.toolArgs).toEqual({
        pattern: '*.ts',
      });
    });

    it('should find files with pattern without quotes', () => {
      const result = findCommand.action?.(mockContext, '*.js') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('glob');
      expect(result.toolArgs).toEqual({
        pattern: '*.js',
      });
    });

    it('should handle complex glob patterns', () => {
      const result = findCommand.action?.(
        mockContext,
        '"**\/components\/*.tsx"'
      ) as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('glob');
      expect(result.toolArgs).toEqual({
        pattern: '**\/components\/*.tsx',
      });
    });

    it('should return error when no pattern provided', () => {
      const result = findCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('Smart File Finder');
    });

    it('should return error when glob tool is not available', () => {
      mockToolRegistry.getTool.mockReturnValue(null);

      const result = findCommand.action?.(mockContext, '*.ts') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('File search tool not available');
    });
  });

  describe('/tree command', () => {
    it('should have correct command metadata', () => {
      expect(treeCommand.name).toBe('tree');
      expect(treeCommand.description).toBe('Show directory tree structure with filtering');
      expect(treeCommand.action).toBeDefined();
    });

    it('should show help when no args provided', () => {
      const result = treeCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('Directory Tree Viewer');
    });

    it('should show tree of specified directory', () => {
      const result = treeCommand.action?.(mockContext, 'src') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ls');
      expect(result.toolArgs).toEqual({
        path: 'src',
        recursive: 'true',
        ignore_pattern: 'node_modules,.git,dist,build,.next,coverage',
      });
    });

    it('should support depth limitation', () => {
      const result = treeCommand.action?.(mockContext, '. --depth 2') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ls');
      expect(result.toolArgs).toEqual({
        path: '.',
        recursive: 'true',
        depth: '2',
        ignore_pattern: 'node_modules,.git,dist,build,.next,coverage',
      });
    });

    it('should support path and depth together', () => {
      const result = treeCommand.action?.(mockContext, 'src --depth 3') as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('ls');
      expect(result.toolArgs).toEqual({
        path: 'src',
        recursive: 'true',
        depth: '3',
        ignore_pattern: 'node_modules,.git,dist,build,.next,coverage',
      });
    });

    it('should return error when ls tool is not available', () => {
      mockToolRegistry.getTool.mockReturnValue(null);

      const result = treeCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Directory listing tool not available');
    });
  });

  describe('/web command', () => {
    it('should have correct command metadata', () => {
      expect(webCommand.name).toBe('web');
      expect(webCommand.description).toBe('Search the web for information');
      expect(webCommand.action).toBeDefined();
    });

    it('should search with simple query', () => {
      const result = webCommand.action?.(
        mockContext,
        '"how to use async await in TypeScript"'
      ) as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('web-search');
      expect(result.toolArgs).toEqual({
        query: 'how to use async await in TypeScript',
      });
    });

    it('should search with query without quotes', () => {
      const result = webCommand.action?.(
        mockContext,
        'OpenRouter API documentation'
      ) as ToolActionReturn;

      expect(result.type).toBe('tool');
      expect(result.toolName).toBe('web-search');
      expect(result.toolArgs).toEqual({
        query: 'OpenRouter API documentation',
      });
    });

    it('should return error when no query provided', () => {
      const result = webCommand.action?.(mockContext, '') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('Web Search');
    });

    it('should return error when web-search tool is not available', () => {
      mockToolRegistry.getTool.mockReturnValue(null);

      const result = webCommand.action?.(mockContext, 'test query') as MessageActionReturn;

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Web search tool not available');
    });
  });

  describe('File Management Workflow Integration', () => {
    it('should support exploring project structure', () => {
      // User flow: /tree → /files src → /search "class" --path src → /find "*.ts"
      
      // Step 1: View project tree
      const treeResult = treeCommand.action?.(mockContext, '.') as ToolActionReturn;
      expect(treeResult.type).toBe('tool');
      expect(treeResult.toolName).toBe('ls');

      // Step 2: List files in specific directory
      const filesResult = filesCommand.action?.(mockContext, 'src') as ToolActionReturn;
      expect(filesResult.type).toBe('tool');
      expect(filesResult.toolName).toBe('ls');

      // Step 3: Search for content
      const searchResult = searchCommand.action?.(
        mockContext,
        '"class" --path src'
      ) as ToolActionReturn;
      expect(searchResult.type).toBe('tool');
      expect(searchResult.toolName).toBe('ripgrep');

      // Step 4: Find specific file types
      const findResult = findCommand.action?.(mockContext, '"*.ts"') as ToolActionReturn;
      expect(findResult.type).toBe('tool');
      expect(findResult.toolName).toBe('glob');
    });

    it('should support debugging workflow', () => {
      // User flow: /find "*.test.ts" → /search "FIXME" → /web "how to fix..."
      
      // Step 1: Find test files
      const findResult = findCommand.action?.(mockContext, '"*.test.ts"') as ToolActionReturn;
      expect(findResult.type).toBe('tool');

      // Step 2: Search for FIXMEs
      const searchResult = searchCommand.action?.(mockContext, 'FIXME') as ToolActionReturn;
      expect(searchResult.type).toBe('tool');

      // Step 3: Search web for solutions
      const webResult = webCommand.action?.(
        mockContext,
        '"how to fix TypeScript test error"'
      ) as ToolActionReturn;
      expect(webResult.type).toBe('tool');
      expect(webResult.toolName).toBe('web-search');
    });

    it('should support codebase analysis workflow', () => {
      // User flow: /tree src --depth 2 → /files src --recursive → /search "export" --ext ts
      
      // Step 1: See high-level structure
      const treeResult = treeCommand.action?.(
        mockContext,
        'src --depth 2'
      ) as ToolActionReturn;
      expect(treeResult.toolArgs).toHaveProperty('depth', '2');

      // Step 2: List all files recursively
      const filesResult = filesCommand.action?.(
        mockContext,
        'src --recursive'
      ) as ToolActionReturn;
      expect(filesResult.toolArgs).toHaveProperty('recursive', 'true');

      // Step 3: Find all exports
      const searchResult = searchCommand.action?.(
        mockContext,
        '"export" --ext ts'
      ) as ToolActionReturn;
      expect(searchResult.toolArgs).toHaveProperty('file_pattern', '*.ts');
    });
  });
});
