import { describe, it, expect } from 'vitest';
import {
  resolveGithubToken,
  githubSessionEnv,
  githubConnected,
  githubTokenSource,
  githubStatus,
  GITHUB_SESSION_TOKEN_VAR,
} from './github-token.js';

describe('resolveGithubToken', () => {
  it('returns null when neither var is set', () => {
    expect(resolveGithubToken({})).toBeNull();
    expect(resolveGithubToken()).toBeNull();
  });

  it('prefers GH_TOKEN over GITHUB_TOKEN', () => {
    expect(resolveGithubToken({ GH_TOKEN: 'gho_a', GITHUB_TOKEN: 'ghp_b' })).toBe('gho_a');
  });

  it('falls back to GITHUB_TOKEN when GH_TOKEN is absent', () => {
    expect(resolveGithubToken({ GITHUB_TOKEN: 'ghp_b' })).toBe('ghp_b');
  });

  it('treats empty / whitespace-only values as absent and trims real ones', () => {
    expect(resolveGithubToken({ GH_TOKEN: '', GITHUB_TOKEN: '  \t ' })).toBeNull();
    expect(resolveGithubToken({ GH_TOKEN: '  gho_trim  ' })).toBe('gho_trim');
    // Empty GH_TOKEN must not shadow a real GITHUB_TOKEN.
    expect(resolveGithubToken({ GH_TOKEN: '   ', GITHUB_TOKEN: 'ghp_real' })).toBe('ghp_real');
  });
});

describe('githubSessionEnv (env injection fragment)', () => {
  it('injects nothing when no token is resolvable (degrade-safe)', () => {
    expect(githubSessionEnv({})).toEqual({});
    expect(githubSessionEnv({ GH_TOKEN: '  ' })).toEqual({});
  });

  it('injects GH_TOKEN as the canonical gh var when a token is present', () => {
    expect(githubSessionEnv({ GITHUB_TOKEN: 'ghp_b' })).toEqual({ [GITHUB_SESSION_TOKEN_VAR]: 'ghp_b' });
    expect(GITHUB_SESSION_TOKEN_VAR).toBe('GH_TOKEN');
  });

  it('never injects a blank/placeholder token value', () => {
    const env = githubSessionEnv({ GH_TOKEN: '' });
    expect(Object.keys(env)).toHaveLength(0);
  });
});

describe('githubConnected / githubTokenSource / githubStatus', () => {
  it('reports connected=false with null source when absent', () => {
    expect(githubConnected({})).toBe(false);
    expect(githubTokenSource({})).toBeNull();
    expect(githubStatus({})).toEqual({ connected: false, source: null });
  });

  it('reports the source var without leaking the token value', () => {
    expect(githubTokenSource({ GH_TOKEN: 'secret' })).toBe('GH_TOKEN');
    expect(githubTokenSource({ GITHUB_TOKEN: 'secret' })).toBe('GITHUB_TOKEN');
    const status = githubStatus({ GITHUB_TOKEN: 'secret' });
    expect(status).toEqual({ connected: true, source: 'GITHUB_TOKEN' });
    // The token value itself must never appear in the status snapshot.
    expect(JSON.stringify(status)).not.toContain('secret');
  });
});
