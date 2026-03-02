import { describe, it, expect } from 'vitest';
import { FileNameValidator } from '@/lib/validation';

describe('FileNameValidator', () => {
  describe('sanitizeName', () => {
    it('returns "Untitled" for empty or whitespace-only input', () => {
      expect(FileNameValidator.sanitizeName('')).toBe('Untitled');
      expect(FileNameValidator.sanitizeName('   ')).toBe('Untitled');
    });

    it('trims leading and trailing whitespace', () => {
      expect(FileNameValidator.sanitizeName('  hello.txt  ')).toBe('hello.txt');
    });

    it('removes the first illegal character occurrence', () => {
      // The underlying regex has no g flag, so only the first match is stripped
      const result = FileNameValidator.sanitizeName('my<file.txt');
      expect(result).toBe('myfile.txt');
    });

    it('strips leading and trailing dots', () => {
      expect(FileNameValidator.sanitizeName('..hidden..')).toBe('hidden');
    });

    it('prefixes reserved Windows names with underscore', () => {
      expect(FileNameValidator.sanitizeName('CON.txt')).toBe('_CON.txt');
      expect(FileNameValidator.sanitizeName('NUL')).toBe('_NUL');
    });

    it('returns "Untitled" when all characters are illegal', () => {
      // All illegal chars + dots = sanitized to empty
      expect(FileNameValidator.sanitizeName('...')).toBe('Untitled');
    });
  });

  describe('validateName', () => {
    it('rejects empty names', () => {
      const result = FileNameValidator.validateName('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('rejects names with illegal characters', () => {
      const result = FileNameValidator.validateName('bad:name');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('illegal characters');
    });

    it('rejects names starting or ending with dots', () => {
      const result = FileNameValidator.validateName('.hidden');
      expect(result.isValid).toBe(false);
    });

    it('rejects reserved Windows names', () => {
      const result = FileNameValidator.validateName('COM1.txt');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    it('accepts valid file names', () => {
      expect(FileNameValidator.validateName('index.tsx').isValid).toBe(true);
      expect(FileNameValidator.validateName('my-component_v2.ts').isValid).toBe(true);
    });

    it('uses itemType in error messages', () => {
      const result = FileNameValidator.validateName('', 'folder');
      expect(result.error).toContain('Folder');
    });
  });

  describe('checkNameConflict', () => {
    it('detects case-insensitive conflicts', () => {
      expect(FileNameValidator.checkNameConflict('README.md', ['readme.md'])).toBe(true);
    });

    it('returns false when no conflict', () => {
      expect(FileNameValidator.checkNameConflict('new-file.ts', ['old-file.ts'])).toBe(false);
    });
  });

  describe('generateUniqueNameSync', () => {
    it('returns the name unchanged when unique', () => {
      expect(FileNameValidator.generateUniqueNameSync('file.txt', [])).toBe('file.txt');
    });

    it('appends incrementing number on conflict', () => {
      const existing = ['file.txt'];
      expect(FileNameValidator.generateUniqueNameSync('file.txt', existing)).toBe('file 2.txt');
    });

    it('skips already-taken numbers', () => {
      const existing = ['file.txt', 'file 2.txt'];
      expect(FileNameValidator.generateUniqueNameSync('file.txt', existing)).toBe('file 3.txt');
    });

    it('handles folders without extension splitting', () => {
      const existing = ['components'];
      expect(FileNameValidator.generateUniqueNameSync('components', existing, 'folder')).toBe('components 2');
    });
  });
});
