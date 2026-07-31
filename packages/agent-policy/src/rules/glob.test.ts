import { describe, expect, it } from 'vitest';
import { globMatch } from './glob.js';

describe('globMatch', () => {
  describe('leading **/ matches zero or more path segments', () => {
    it('matches a root-level file with **/*.pem (the forbidden-path bypass defect)', () => {
      expect(globMatch('**/*.pem', 'deploy.pem')).toBe(true);
    });

    it('matches a nested file with **/*.pem', () => {
      expect(globMatch('**/*.pem', 'sub/deploy.pem')).toBe(true);
    });

    it('matches a deeply nested file with **/*.pem', () => {
      expect(globMatch('**/*.pem', 'a/b/c/deploy.pem')).toBe(true);
    });

    it('matches root-level .env with **/.env', () => {
      expect(globMatch('**/.env', '.env')).toBe(true);
    });

    it('matches nested .env with **/.env', () => {
      expect(globMatch('**/.env', 'config/.env')).toBe(true);
    });
  });

  describe('non-matching cases still fail', () => {
    it('does not match a different extension', () => {
      expect(globMatch('**/*.pem', 'deploy.txt')).toBe(false);
    });

    it('single * does not cross a path separator', () => {
      expect(globMatch('*.pem', 'sub/deploy.pem')).toBe(false);
    });
  });

  describe('existing directory-scoped patterns still work', () => {
    it('matches a direct child with src/**/*.ts', () => {
      expect(globMatch('src/**/*.ts', 'src/index.ts')).toBe(true);
    });

    it('matches a nested child with src/**/*.ts', () => {
      expect(globMatch('src/**/*.ts', 'src/a/b/index.ts')).toBe(true);
    });

    it('does not match outside the scoped directory', () => {
      expect(globMatch('src/**/*.ts', 'lib/index.ts')).toBe(false);
    });

    it('handles backslash path separators', () => {
      expect(globMatch('**/*.pem', 'sub\\deploy.pem')).toBe(true);
    });
  });
});
