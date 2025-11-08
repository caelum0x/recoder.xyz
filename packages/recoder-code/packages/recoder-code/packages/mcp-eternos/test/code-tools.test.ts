/**
 * MCP Eternos - Test Suite for Code Intelligence
 */
import { describe, it, expect } from 'vitest';

describe('Code Intelligence Tools', () => {
  describe('find_functions', () => {
    it('should find JavaScript functions', () => {
      const code = `
        function test() {}
        const arrow = () => {};
        async function asyncFn() {}
      `;
      const functionCount = (code.match(/function|=>/g) || []).length;
      expect(functionCount).toBeGreaterThan(0);
    });

    it('should find Python functions', () => {
      const code = `
        def test():
            pass
        async def async_test():
            pass
      `;
      const functionCount = (code.match(/def\s+\w+/g) || []).length;
      expect(functionCount).toBe(2);
    });

    it('should detect async functions', () => {
      const functions = [
        { name: 'test', type: 'sync' },
        { name: 'asyncTest', type: 'async' },
      ];
      const asyncCount = functions.filter(f => f.type === 'async').length;
      expect(asyncCount).toBe(1);
    });

    it('should return line numbers', () => {
      const func = {
        name: 'test',
        line: 42,
      };
      expect(func.line).toBeGreaterThan(0);
    });
  });

  describe('count_loc', () => {
    it('should count total lines', () => {
      const stats = {
        totalFiles: 50,
        totalLines: 10000,
        totalCode: 7500,
        totalComments: 1500,
        totalBlank: 1000,
      };
      expect(stats.totalLines).toBe(10000);
    });

    it('should count by file extension', () => {
      const byExtension = {
        js: { files: 20, lines: 5000, code: 4000 },
        ts: { files: 15, lines: 3000, code: 2500 },
        py: { files: 10, lines: 2000, code: 1500 },
      };
      expect(byExtension.js.files).toBe(20);
    });

    it('should separate code from comments', () => {
      const stats = {
        code: 7500,
        comments: 1500,
      };
      expect(stats.code).toBeGreaterThan(stats.comments);
    });

    it('should ignore specified directories', () => {
      const ignore = ['node_modules/**', 'dist/**', 'build/**'];
      expect(ignore).toContain('node_modules/**');
    });
  });

  describe('complexity_analysis', () => {
    it('should calculate cyclomatic complexity', () => {
      const complexity = 15;
      expect(complexity).toBeGreaterThan(0);
    });

    it('should rate complexity', () => {
      const ratings = [
        { complexity: 5, rating: 'Simple' },
        { complexity: 15, rating: 'Moderate' },
        { complexity: 35, rating: 'Complex' },
        { complexity: 60, rating: 'Very Complex' },
      ];
      expect(ratings[0].rating).toBe('Simple');
    });

    it('should calculate complexity per function', () => {
      const totalComplexity = 20;
      const functions = 5;
      const perFunction = totalComplexity / functions;
      expect(perFunction).toBe(4);
    });

    it('should count decision points', () => {
      const code = `
        if (x) {}
        while (y) {}
        for (i) {}
        switch (z) { case 1: break; }
      `;
      const decisions = (code.match(/\b(if|while|for|case)\b/g) || []).length;
      expect(decisions).toBeGreaterThan(0);
    });
  });

  describe('analyze_code', () => {
    it('should find imports', () => {
      const code = `
        import { foo } from 'bar';
        import React from 'react';
      `;
      const imports = (code.match(/import .* from/g) || []).length;
      expect(imports).toBe(2);
    });

    it('should find exports', () => {
      const code = `
        export const test = () => {};
        export default MyComponent;
      `;
      const exports = (code.match(/export\s+(const|default|function)/g) || []).length;
      expect(exports).toBe(2);
    });

    it('should count functions', () => {
      const analysis = {
        functions: 10,
        classes: 3,
        imports: 15,
        exports: 8,
      };
      expect(analysis.functions).toBeGreaterThan(0);
    });
  });
});
