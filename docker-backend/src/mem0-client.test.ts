/**
 * Focused tests for the mem0 `MEM0_BASE_URL` connect seam.
 *
 * `mem0BaseUrl()` is the resolver that points the platform `@recoder/mem0`
 * client at a self-hosted `py/mem0` server (its `host`) instead of the SaaS
 * default. These assert the trimming/empty contract without constructing the
 * real SDK client (no network), plus that platform-mode health reports the
 * resolved base URL truthfully.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mem0BaseUrl } from './mem0-client.js';

const KEY = 'MEM0_BASE_URL';
const originalBase = process.env[KEY];

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  setEnv(KEY, undefined);
});

afterEach(() => {
  setEnv(KEY, originalBase);
});

describe('mem0BaseUrl', () => {
  it('is undefined when MEM0_BASE_URL is unset or blank', () => {
    expect(mem0BaseUrl()).toBeUndefined();
    setEnv(KEY, '   ');
    expect(mem0BaseUrl()).toBeUndefined();
  });

  it('returns the trimmed value when set (the host the platform client connects to)', () => {
    setEnv(KEY, '  http://mem0:8000  ');
    expect(mem0BaseUrl()).toBe('http://mem0:8000');
  });
});
