/**
 * GitHub identity detection (zero-config onboarding).
 *
 * Proves: env token wins over the gh CLI login; a gh login without a token is
 * `gh_cli`; nothing detected is a truthful `connected: false`; the git config
 * identity rides along independently of connection; probe failures degrade to
 * not-connected — never a fabricated link, never a token value in the view.
 */
import { describe, it, expect } from 'vitest';
import {
  createGithubStatusAdapter,
  parseGhLogin,
  type GithubProbeExec,
} from './adapters/github-status.adapter.js';
import { makeLogger } from './__fixtures__/harness.js';

interface FakeProbe {
  /** gh resolved on PATH? */
  gh?: boolean;
  /** `gh auth status` combined output; undefined ⇒ the probe throws (not logged in). */
  ghStatus?: string;
  gitName?: string;
  gitEmail?: string;
}

function makeExec(probe: FakeProbe): GithubProbeExec {
  return {
    which: async (bin) => (bin === 'gh' && probe.gh ? '/usr/local/bin/gh' : undefined),
    execFile: async (bin, args) => {
      if (bin.endsWith('gh')) {
        if (probe.ghStatus === undefined) throw new Error('not logged in');
        return { stdout: '', stderr: probe.ghStatus };
      }
      if (bin === 'git' && args[0] === 'config') {
        const value = args[2] === 'user.name' ? probe.gitName : probe.gitEmail;
        if (!value) throw new Error('unset');
        return { stdout: `${value}\n`, stderr: '' };
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
}

function makeAdapter(env: Record<string, string | undefined>, probe: FakeProbe) {
  return createGithubStatusAdapter({ logger: makeLogger(), env, exec: makeExec(probe) });
}

describe('parseGhLogin', () => {
  it('parses the modern "account <login>" form', () => {
    expect(parseGhLogin('✓ Logged in to github.com account caelum0x (keyring)')).toBe('caelum0x');
  });

  it('parses the legacy "as <login>" form', () => {
    expect(parseGhLogin('✓ Logged in to github.com as caelum0x (oauth_token)')).toBe('caelum0x');
  });

  it('returns undefined for signed-out output', () => {
    expect(parseGhLogin('You are not logged into any GitHub hosts.')).toBeUndefined();
  });
});

describe('github status detection', () => {
  it('GH_TOKEN wins over a gh login, with the account riding along', async () => {
    const adapter = makeAdapter(
      { GH_TOKEN: 'secret' },
      { gh: true, ghStatus: 'Logged in to github.com account caelum0x (keyring)', gitName: 'Caelum' },
    );
    const status = await adapter.status();
    expect(status).toEqual({
      connected: true,
      source: 'GH_TOKEN',
      account: { login: 'caelum0x', name: 'Caelum' },
    });
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  it('GITHUB_TOKEN connects when GH_TOKEN is absent', async () => {
    const status = await makeAdapter({ GITHUB_TOKEN: 'secret' }, {}).status();
    expect(status.connected).toBe(true);
    expect(status.source).toBe('GITHUB_TOKEN');
  });

  it('a gh CLI login without a token env is gh_cli', async () => {
    const status = await makeAdapter(
      {},
      { gh: true, ghStatus: 'Logged in to github.com account caelum0x (keyring)' },
    ).status();
    expect(status).toEqual({
      connected: true,
      source: 'gh_cli',
      account: { login: 'caelum0x' },
    });
  });

  it('reports a truthful not-connected when nothing is detected', async () => {
    const status = await makeAdapter({}, {}).status();
    expect(status).toEqual({ connected: false, source: null });
  });

  it('a signed-out gh is not-connected, but the git identity still surfaces', async () => {
    const status = await makeAdapter(
      {},
      { gh: true, gitName: 'Caelum', gitEmail: 'c@example.com' },
    ).status();
    expect(status).toEqual({
      connected: false,
      source: null,
      account: { name: 'Caelum', email: 'c@example.com' },
    });
  });
});
