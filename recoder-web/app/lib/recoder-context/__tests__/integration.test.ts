/**
 * Integration tests for .recoder/ context
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadRecoderContext, formatContextForAI } from '../loader';
import { initializeRecoderDirectory } from '../initializer';
import type { FileWriter } from '../initializer';

describe('.recoder/ Context Integration', () => {
  let mockFS: Map<string, string>;
  let fileWriter: FileWriter;

  beforeEach(() => {
    mockFS = new Map();
    
    fileWriter = {
      writeFile: async (path: string, content: string) => {
        mockFS.set(path, content);
      },
      mkdir: async (path: string) => {
        // Mock mkdir
      },
      exists: async (path: string) => {
        return mockFS.has(path);
      },
    };
  });

  describe('Initialization', () => {
    it('should create default files', async () => {
      await initializeRecoderDirectory(fileWriter);

      expect(mockFS.has('.recoder/context.md')).toBe(true);
      expect(mockFS.has('.recoder/spec.md')).toBe(true);
      expect(mockFS.has('.recoder/style-guide.md')).toBe(true);
    });

    it('should not overwrite existing files', async () => {
      mockFS.set('.recoder/context.md', 'existing content');
      
      await initializeRecoderDirectory(fileWriter);

      expect(mockFS.get('.recoder/context.md')).toBe('existing content');
    });

    it('should use template when provided', async () => {
      await initializeRecoderDirectory(fileWriter, 'nextjs');

      const context = mockFS.get('.recoder/context.md');
      expect(context).toContain('Next.js');
    });
  });

  describe('Context Loading', () => {
    it('should load all context files', async () => {
      mockFS.set('.recoder/context.md', '# Project Context');
      mockFS.set('.recoder/spec.md', '# Specification');
      mockFS.set('.recoder/style-guide.md', '# Style Guide');

      const context = await loadRecoderContext(async (path) => {
        return mockFS.get(path) || null;
      });

      expect(context.context).toBe('# Project Context');
      expect(context.spec).toBe('# Specification');
      expect(context.styleGuide).toBe('# Style Guide');
    });

    it('should handle missing files gracefully', async () => {
      const context = await loadRecoderContext(async (path) => {
        return null;
      });

      expect(context.context).toBeUndefined();
      expect(context.spec).toBeUndefined();
    });

    it('should load custom prompts', async () => {
      mockFS.set('.recoder/prompts/component.md', 'Component prompt');
      mockFS.set('.recoder/prompts/api.md', 'API prompt');

      const context = await loadRecoderContext(async (path) => {
        return mockFS.get(path) || null;
      });

      expect(context.prompts?.component).toBe('Component prompt');
      expect(context.prompts?.api).toBe('API prompt');
    });
  });

  describe('Context Formatting', () => {
    it('should format context for AI', () => {
      const context = {
        context: 'Project uses TypeScript',
        spec: 'Build a todo app',
        styleGuide: 'Use camelCase',
      };

      const formatted = formatContextForAI(context);

      expect(formatted).toContain('# Project-Specific Context');
      expect(formatted).toContain('## Project Context');
      expect(formatted).toContain('TypeScript');
      expect(formatted).toContain('## Specification');
      expect(formatted).toContain('todo app');
    });

    it('should return empty string for empty context', () => {
      const formatted = formatContextForAI({});
      expect(formatted).toBe('');
    });

    it('should include all sections', () => {
      const context = {
        context: 'Context',
        spec: 'Spec',
        prd: 'PRD',
        architecture: 'Arch',
        styleGuide: 'Style',
        apiDocs: 'API',
      };

      const formatted = formatContextForAI(context);

      expect(formatted).toContain('## Project Context');
      expect(formatted).toContain('## Specification');
      expect(formatted).toContain('## Product Requirements');
      expect(formatted).toContain('## Architecture');
      expect(formatted).toContain('## Style Guide');
      expect(formatted).toContain('## API Documentation');
    });
  });

  describe('Integration Flow', () => {
    it('should complete full integration flow', async () => {
      // 1. Initialize
      await initializeRecoderDirectory(fileWriter);

      // 2. Load context
      const context = await loadRecoderContext(async (path) => {
        return mockFS.get(path) || null;
      });

      // 3. Format for AI
      const formatted = formatContextForAI(context);

      // 4. Verify
      expect(formatted).toContain('Project Context');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should work with first message flow', async () => {
      const isFirstMessage = true;

      if (isFirstMessage) {
        await initializeRecoderDirectory(fileWriter);
      }

      const context = await loadRecoderContext(async (path) => {
        return mockFS.get(path) || null;
      });

      const formatted = formatContextForAI(context);

      expect(formatted).toBeTruthy();
    });
  });
});
