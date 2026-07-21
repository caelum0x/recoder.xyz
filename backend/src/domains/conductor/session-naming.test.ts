/**
 * Golden-vector lock for the `recoder-<id>` session-naming contract (design §A4 /
 * docs/architecture/TERMINAL-UNIFICATION.md §3).
 *
 * The conductor's `tmuxNameFor` is the single producer of the durable-session
 * name every substrate + the (future) wave-side attach path must agree on. These
 * frozen input→output vectors pin the exact spec — `recoder-` prefix plus
 * `[^a-zA-Z0-9_-] → _` sanitization — so the rule can never silently drift when
 * an adapter reproduces it or the wave client attaches by the same name.
 *
 * TS-BACKEND-ONLY: this asserts the producer against the documented contract and
 * against the wave-side allowlist CHARSET (`^recoder-[A-Za-z0-9_-]*$`) that the
 * attach validator accepts — without importing any frontend/Go code. It locks
 * that the producer only ever emits names the wave allowlist accepts.
 */
import { describe, it, expect } from 'vitest';
import { SESSION_PREFIX, tmuxNameFor } from './session-naming.js';

/**
 * Frozen contract vectors. Each output is the literal result of
 * `recoder-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}` — do NOT "fix" a value here to
 * make a changed producer pass; a diff means the contract moved (Bucket B).
 */
const GOLDEN: ReadonlyArray<readonly [id: string, name: string]> = [
  // Already-safe ids pass through unchanged (letters, digits, `_`, `-`).
  ['ws_123', 'recoder-ws_123'],
  ['ABC-def_0', 'recoder-ABC-def_0'],
  ['a-b-c', 'recoder-a-b-c'],
  // Path separators — the common workspace/branch shape — are neutralized.
  ['feat/branch', 'recoder-feat_branch'],
  ['path/to/ws', 'recoder-path_to_ws'],
  // Whitespace (space, tab) → `_`.
  ['a b\tc', 'recoder-a_b_c'],
  // Punctuation / URL-ish chars → `_`.
  ['x.y:z@1', 'recoder-x_y_z_1'],
  ['ws#2!', 'recoder-ws_2_'],
  // Path-traversal chars are all outside the allowlist ⇒ each becomes `_`.
  ['../etc', 'recoder-___etc'],
  // Non-ASCII BMP char (é = U+00E9) is a single code unit → one `_`.
  ['café', 'recoder-caf_'],
  // Empty id ⇒ the bare prefix (edge case, still contract-valid).
  ['', 'recoder-'],
];

/** The wave-side attach allowlist charset: prefix + `[A-Za-z0-9_-]`. */
const WAVE_ALLOWLIST = /^recoder-[A-Za-z0-9_-]*$/;

describe('recoder-<id> session-naming contract', () => {
  it('pins SESSION_PREFIX to the documented value', () => {
    expect(SESSION_PREFIX).toBe('recoder-');
  });

  it('produces the exact golden name for every workspace id', () => {
    for (const [id, expected] of GOLDEN) {
      expect(tmuxNameFor(id)).toBe(expected);
    }
  });

  it('always emits a name the wave attach allowlist accepts', () => {
    for (const [id] of GOLDEN) {
      expect(tmuxNameFor(id)).toMatch(WAVE_ALLOWLIST);
    }
    // Fuzz a spread of hostile ids: the output is ALWAYS allowlist-valid.
    const hostile = [
      'a/b/c', 'a b', 'a\nb', 'a;rm -rf /', '$(whoami)', '`id`', 'π-θ',
      '😀', 'tab\tsep', 'semi;colon', 'quote"q\'q', '..\\..\\win',
    ];
    for (const id of hostile) {
      expect(tmuxNameFor(id)).toMatch(WAVE_ALLOWLIST);
    }
  });

  it('every produced name is prefixed and never collides across the prefix boundary', () => {
    for (const [id] of GOLDEN) {
      expect(tmuxNameFor(id).startsWith(SESSION_PREFIX)).toBe(true);
    }
    // A raw id that already looks prefixed is re-prefixed (no ambiguity): the
    // producer NEVER emits a bare `recoder-x`; it is always `recoder-recoder-x`.
    expect(tmuxNameFor('recoder-x')).toBe('recoder-recoder-x');
  });

  it('is idempotent on an already-sanitized name (re-running keeps it stable)', () => {
    // The sanitized BODY of a produced name contains only allowlist chars, so
    // sanitizing it again is a no-op — attaching by a produced name is stable.
    for (const [, name] of GOLDEN) {
      const body = name.slice(SESSION_PREFIX.length);
      expect(body.replace(/[^a-zA-Z0-9_-]/g, '_')).toBe(body);
    }
  });
});
