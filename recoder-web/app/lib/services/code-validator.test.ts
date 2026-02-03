/**
 * Code Validator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateCode,
  formatValidationResult,
  canWriteWithValidation,
} from './code-validator';

describe('Code Validator', () => {
  describe('validateCode', () => {
    it('should pass valid JavaScript code', async () => {
      const code = `
        const greeting = 'Hello, World!';
        console.log(greeting);
      `;
      const result = await validateCode(code, 'test.js');
      expect(result.valid).toBe(true);
    });

    it('should detect unmatched brackets', async () => {
      const code = `
        function test() {
          if (true) {
            console.log('missing closing brace');
      `;
      const result = await validateCode(code, 'test.js');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Unmatched brackets'))).toBe(true);
    });

    it('should pass valid TypeScript code', async () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }

        const user: User = {
          name: 'John',
          age: 30
        };
      `;
      const result = await validateCode(code, 'test.ts');
      expect(result.valid).toBe(true);
    });

    it('should detect JSX class attribute warning', async () => {
      const code = `
        function Component() {
          return <div class="container">Hello</div>;
        }
      `;
      const result = await validateCode(code, 'Component.tsx');
      expect(result.errors.some(e =>
        e.message.includes('className') && e.severity === 'warning'
      )).toBe(true);
    });

    it('should pass valid JSON', async () => {
      const json = `{
        "name": "test",
        "version": "1.0.0"
      }`;
      const result = await validateCode(json, 'package.json');
      expect(result.valid).toBe(true);
    });

    it('should detect invalid JSON', async () => {
      const json = `{
        "name": "test",
        "version": "1.0.0",
      }`;
      const result = await validateCode(json, 'package.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'syntax')).toBe(true);
    });

    it('should detect console.log warning', async () => {
      const code = `
        function debug() {
          console.log('debugging...');
        }
      `;
      const result = await validateCode(code, 'debug.js');
      expect(result.warnings.some(w =>
        w.message.includes('Console statements')
      )).toBe(true);
    });

    it('should detect hardcoded secrets warning', async () => {
      const code = `
        const apiKey = "sk_live_1234567890abcdef";
      `;
      const result = await validateCode(code, 'config.js');
      expect(result.warnings.some(w =>
        w.message.includes('secret') || w.message.includes('environment')
      )).toBe(true);
    });
  });

  describe('canWriteWithValidation', () => {
    it('should allow writing when valid', async () => {
      const result = await validateCode('const x = 1;', 'test.js');
      expect(canWriteWithValidation(result)).toBe(true);
    });

    it('should allow writing with only warnings', async () => {
      const result = await validateCode('console.log("test");', 'test.js');
      // Should have warning but be valid
      expect(canWriteWithValidation(result)).toBe(true);
    });
  });

  describe('formatValidationResult', () => {
    it('should format passing result', async () => {
      const result = await validateCode('const x = 1;', 'test.js');
      const formatted = formatValidationResult(result);
      expect(formatted).toContain('passed');
    });

    it('should format failing result with errors', async () => {
      const result = await validateCode('{ missing bracket', 'test.js');
      const formatted = formatValidationResult(result);
      expect(formatted).toContain('Error');
    });
  });
});
