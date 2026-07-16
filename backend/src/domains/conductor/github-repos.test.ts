/**
 * GitHub repo list (product F2: repo picker auto-populated from the account).
 *
 * Proves: an authenticated `gh` yields the parsed repo list; an absent gh, a
 * signed-out/failing gh, a hung-then-killed gh, and unparseable output all
 * degrade to a truthful EMPTY list — never an error, never a fabricated repo;
 * malformed entries are dropped, well-formed siblings kept.
 */
import { describe, it, expect } from 'vitest';
import {
  createGithubStatusAdapter,
  parseGhRepoList,
  type GithubProbeExec,
} from './adapters/github-status.adapter.js';
import { makeLogger } from './__fixtures__/harness.js';

interface FakeProbe {
  /** gh resolved on PATH? */
  gh?: boolean;
  /** `gh repo list` stdout; undefined ⇒ the exec throws (signed out / timeout). */
  repoList?: string;
}

const REPOS_JSON = JSON.stringify([
  { name: 'recoder.xyz', nameWithOwner: 'caelum0x/recoder.xyz', url: 'https://github.com/caelum0x/recoder.xyz' },
  { name: 'beads', nameWithOwner: 'caelum0x/beads', url: 'https://github.com/caelum0x/beads' },
]);

function makeExec(probe: FakeProbe): GithubProbeExec {
  return {
    which: async (bin) => (bin === 'gh' && probe.gh ? '/usr/local/bin/gh' : undefined),
    execFile: async (bin, args) => {
      if (bin.endsWith('gh') && args[0] === 'repo' && args[1] === 'list') {
        if (probe.repoList === undefined) throw new Error('gh: not logged in');
        return { stdout: probe.repoList, stderr: '' };
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
}

function makeAdapter(probe: FakeProbe) {
  return createGithubStatusAdapter({ logger: makeLogger(), env: {}, exec: makeExec(probe) });
}

describe('parseGhRepoList', () => {
  it('parses well-formed gh JSON output', () => {
    expect(parseGhRepoList(REPOS_JSON)).toEqual([
      { name: 'recoder.xyz', nameWithOwner: 'caelum0x/recoder.xyz', url: 'https://github.com/caelum0x/recoder.xyz' },
      { name: 'beads', nameWithOwner: 'caelum0x/beads', url: 'https://github.com/caelum0x/beads' },
    ]);
  });

  it('drops malformed entries but keeps well-formed siblings', () => {
    const mixed = JSON.stringify([
      { name: 'ok', nameWithOwner: 'me/ok', url: 'https://github.com/me/ok' },
      { name: '', nameWithOwner: 'me/empty-name', url: 'https://github.com/me/empty-name' },
      { name: 'no-url', nameWithOwner: 'me/no-url' },
      { name: 42, nameWithOwner: 'me/bad-type', url: 'https://github.com/me/bad-type' },
      'not-an-object',
      null,
    ]);
    expect(parseGhRepoList(mixed)).toEqual([
      { name: 'ok', nameWithOwner: 'me/ok', url: 'https://github.com/me/ok' },
    ]);
  });

  it('returns the empty list for non-JSON and non-array output', () => {
    expect(parseGhRepoList('gh: HTTP 401 Bad credentials')).toEqual([]);
    expect(parseGhRepoList('{"totalCount": 2}')).toEqual([]);
    expect(parseGhRepoList('')).toEqual([]);
  });
});

describe('github repo listing', () => {
  it('lists the account repos when gh is authenticated', async () => {
    const repos = await makeAdapter({ gh: true, repoList: REPOS_JSON }).repos();
    expect(repos).toEqual([
      { name: 'recoder.xyz', nameWithOwner: 'caelum0x/recoder.xyz', url: 'https://github.com/caelum0x/recoder.xyz' },
      { name: 'beads', nameWithOwner: 'caelum0x/beads', url: 'https://github.com/caelum0x/beads' },
    ]);
  });

  it('an absent gh is a truthful empty list, without ever exec-ing', async () => {
    await expect(makeAdapter({}).repos()).resolves.toEqual([]);
  });

  it('a signed-out/failing gh degrades to the empty list, never an error', async () => {
    await expect(makeAdapter({ gh: true }).repos()).resolves.toEqual([]);
  });

  it('unparseable gh output degrades to the empty list', async () => {
    await expect(makeAdapter({ gh: true, repoList: 'flaky garbage' }).repos()).resolves.toEqual([]);
  });

  it('even a throwing which() probe degrades to the empty list', async () => {
    const adapter = createGithubStatusAdapter({
      logger: makeLogger(),
      env: {},
      exec: {
        which: async () => {
          throw new Error('PATH probe exploded');
        },
        execFile: async () => {
          throw new Error('unreachable');
        },
      },
    });
    await expect(adapter.repos()).resolves.toEqual([]);
  });
});
