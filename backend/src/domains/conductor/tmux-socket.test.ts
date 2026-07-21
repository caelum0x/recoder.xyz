/**
 * `tmuxDefaultSocket` — proves the emitted path replicates tmux's own
 * default-socket algorithm EXACTLY (durable-shell unify §A1b):
 *   `${TMUX_TMPDIR:-/tmp}/tmux-<uid>/default`.
 * A wrong path is worse than nothing (it would assert a false shared server), so
 * an unknown uid must yield `null`, not a guess. The live-process resolver is
 * checked to agree with the pure function on POSIX (where `geteuid` exists).
 */
import { describe, it, expect } from 'vitest';
import { tmuxDefaultSocket, resolveConductorTmuxSocket } from './tmux-socket.js';

describe('tmuxDefaultSocket', () => {
  it('uses /tmp when TMUX_TMPDIR is unset (tmux default)', () => {
    expect(tmuxDefaultSocket({ uid: 501 })).toBe('/tmp/tmux-501/default');
    expect(tmuxDefaultSocket({ tmuxTmpDir: null, uid: 0 })).toBe('/tmp/tmux-0/default');
  });

  it('uses /tmp when TMUX_TMPDIR is the empty string (tmux tests `*s != 0`)', () => {
    expect(tmuxDefaultSocket({ tmuxTmpDir: '', uid: 501 })).toBe('/tmp/tmux-501/default');
  });

  it('uses TMUX_TMPDIR verbatim when set and non-empty', () => {
    expect(tmuxDefaultSocket({ tmuxTmpDir: '/run/user/1000', uid: 1000 })).toBe(
      '/run/user/1000/tmux-1000/default',
    );
  });

  it('does NOT normalize TMUX_TMPDIR — a trailing slash is preserved (tmux joins raw)', () => {
    // tmux uses printf "%s/%s" without trimming, so a trailing slash yields a
    // double slash the real socket lives at; matching precisely > "prettier".
    expect(tmuxDefaultSocket({ tmuxTmpDir: '/tmp/', uid: 501 })).toBe('/tmp//tmux-501/default');
  });

  it('yields null for an unknown/invalid uid (never a guessed default)', () => {
    expect(tmuxDefaultSocket({ uid: null })).toBeNull();
    expect(tmuxDefaultSocket({})).toBeNull();
    expect(tmuxDefaultSocket({ uid: -1 })).toBeNull();
    expect(tmuxDefaultSocket({ uid: 1.5 })).toBeNull();
  });
});

describe('resolveConductorTmuxSocket', () => {
  const hasEuid = typeof (process as NodeJS.Process & { geteuid?: () => number }).geteuid === 'function';

  it.runIf(hasEuid)('agrees with the pure algorithm for the live process (POSIX)', () => {
    const uid = (process as NodeJS.Process & { geteuid: () => number }).geteuid();
    const expected = tmuxDefaultSocket({ tmuxTmpDir: process.env.TMUX_TMPDIR ?? null, uid });
    expect(resolveConductorTmuxSocket()).toBe(expected);
  });
});
