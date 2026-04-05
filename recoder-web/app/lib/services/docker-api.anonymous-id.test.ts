import { afterEach, describe, expect, it, vi } from 'vitest';

import { withDockerCredentials } from './docker-api';

function createStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('withDockerCredentials anonymous identity forwarding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the stable anonymous ID header', () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    localStorage.setItem('recoder_anonymous_id', 'anon_test_123');

    vi.stubGlobal('window', {
      location: {
        hostname: 'web.recoder.xyz',
        protocol: 'https:',
      },
    });
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('sessionStorage', sessionStorage);
    vi.stubGlobal('document', { cookie: '' });

    const init = withDockerCredentials();
    const headers = new Headers(init.headers);

    expect(headers.get('X-Recoder-Anonymous-Id')).toBe('anon_test_123');
    expect(init.credentials).toBe('include');
  });

  it('does not override an explicit anonymous ID header', () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    localStorage.setItem('recoder_anonymous_id', 'anon_local');

    vi.stubGlobal('window', {
      location: {
        hostname: 'web.recoder.xyz',
        protocol: 'https:',
      },
    });
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('sessionStorage', sessionStorage);
    vi.stubGlobal('document', { cookie: '' });

    const init = withDockerCredentials({
      headers: {
        'X-Recoder-Anonymous-Id': 'anon_explicit',
      },
    });
    const headers = new Headers(init.headers);

    expect(headers.get('X-Recoder-Anonymous-Id')).toBe('anon_explicit');
  });
});
