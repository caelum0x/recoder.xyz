import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredSandboxProjectId,
  getStoredSandboxProjectId,
  isLikelySandboxProjectId,
  persistStoredSandboxProjectId,
  ROOT_SANDBOX_PROJECT_STORAGE_KEY,
  resolveSandboxProjectId,
} from './sandbox-project-id';

describe('sandbox-project-id', () => {
  beforeEach(() => {
    const sessionStorage = (() => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      };
    })();

    vi.stubGlobal('window', { sessionStorage });
  });

  it('accepts project-style and uuid project identifiers', () => {
    expect(isLikelySandboxProjectId('project-1774919650071')).toBe(true);
    expect(isLikelySandboxProjectId('9f84a9c3-7180-4f77-8c73-82ef2f7cbb1c')).toBe(true);
  });

  it('rejects plain chat slugs', () => {
    expect(isLikelySandboxProjectId('hello-world')).toBe(false);
    expect(isLikelySandboxProjectId('landing-page-redesign')).toBe(false);
  });

  it('prefers a real project id and never falls back to a slug', () => {
    expect(resolveSandboxProjectId({
      preferredProjectId: 'project-123',
      storedProjectId: 'project-456',
      urlId: 'hello-world',
      chatId: 'hello-world',
      now: () => 42,
    })).toBe('project-123');

    expect(resolveSandboxProjectId({
      preferredProjectId: undefined,
      storedProjectId: undefined,
      urlId: 'hello-world',
      chatId: 'hello-world',
      now: () => 42,
    })).toBe('project-42');
  });

  it('persists and clears the root sandbox project id in session storage', () => {
    clearStoredSandboxProjectId(ROOT_SANDBOX_PROJECT_STORAGE_KEY);
    expect(getStoredSandboxProjectId(ROOT_SANDBOX_PROJECT_STORAGE_KEY)).toBeNull();

    persistStoredSandboxProjectId('project-99', ROOT_SANDBOX_PROJECT_STORAGE_KEY);
    expect(getStoredSandboxProjectId(ROOT_SANDBOX_PROJECT_STORAGE_KEY)).toBe('project-99');

    clearStoredSandboxProjectId(ROOT_SANDBOX_PROJECT_STORAGE_KEY);
    expect(getStoredSandboxProjectId(ROOT_SANDBOX_PROJECT_STORAGE_KEY)).toBeNull();
  });
});
