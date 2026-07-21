/**
 * `createRecoderSessionLister` — the read-only `recoder-*` attach-list bridge
 * (durable-shell unify §A2). Proves, with a MOCKED exec seam (no real tmux, no
 * `go build`, no packaged app):
 *
 *  - it surfaces the live conductor sessions filtered to the `recoder-` prefix and
 *    NEVER a user's unrelated tmux session;
 *  - it is pure read (`list-sessions` only) — the mock records that no mutating
 *    verb (`new-session`/`send-keys`/`kill-session`) is ever invoked;
 *  - tmux absent/unrunnable ⇒ a truthful EMPTY list + a warn (degrade-truthful),
 *    exactly like the reconcile scan source it reuses;
 *  - tmux present with no server yet ⇒ the empty state, not a failure.
 */
import { describe, it, expect, vi } from 'vitest';
import type { CliResult } from '../../engines/adapters/cli/cli-exec.js';
import { createTmuxIntrospect, type TmuxRun } from '../../engines/adapters/cli/tmux-introspect.adapter.js';
import { createRecoderSessionLister } from './recoder-session-lister.adapter.js';

/** tmux `-F` field separator (ASCII Unit Separator), mirrored from the adapter. */
const FS = '\x1f';

/** Build one `list-sessions -F` stdout row for a session name. */
function sessionRow(name: string): string {
  return [name, `$${name}`, '1', '0', '1700000000', '1700000001'].join(FS);
}

function okResult(stdout: string): CliResult {
  return { ok: true, code: 0, stdout, stderr: '' };
}

function failResult(reason: string): CliResult {
  return { ok: false, code: 1, stdout: '', stderr: reason, reason };
}

/** A lister over a mocked exec seam (no real tmux). */
function listerOver(run: TmuxRun, logger?: { warn: ReturnType<typeof vi.fn> }) {
  const introspect = createTmuxIntrospect({ bin: 'tmux', enabled: () => true, vendored: false, run });
  return createRecoderSessionLister({
    introspect,
    ...(logger ? { logger: logger as never } : {}),
  });
}

describe('createRecoderSessionLister', () => {
  it('lists only the conductor-owned recoder-* sessions', async () => {
    const stdout = [
      sessionRow('recoder-abc123'),
      sessionRow('recoder-def456'),
      sessionRow('my-personal-shell'), // unrelated user session — must be filtered out
      sessionRow('work'),
    ].join('\n');
    const run = vi.fn<TmuxRun>(async () => okResult(stdout));

    const sessions = await listerOver(run)();

    expect(sessions).toEqual(['recoder-abc123', 'recoder-def456']);
    // Pure read: the ONLY verb ever invoked is the read-only `list-sessions`.
    for (const call of run.mock.calls) {
      expect(call[1][0]).toBe('list-sessions');
    }
  });

  it('degrades to a truthful empty list + warn when tmux is absent', async () => {
    const warn = vi.fn();
    const run = vi.fn<TmuxRun>(async () => failResult('spawn tmux ENOENT: no such file'));

    const sessions = await listerOver(run, { warn })();

    expect(sessions).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('degrades to a truthful empty list when NO introspect port is injected', async () => {
    // The engines-owned tmux facet is undeclared at the composition root ⇒ this
    // bridge cannot observe the substrate and must NOT value-import an engines
    // default. It returns `[]` (never a fabricated live session) and never throws.
    const sessions = await createRecoderSessionLister()();
    expect(sessions).toEqual([]);
  });

  it('treats "no server running yet" as the empty state (not a failure)', async () => {
    const warn = vi.fn();
    const run = vi.fn<TmuxRun>(async () => failResult('no server running on /tmp/tmux-501/default'));

    const sessions = await listerOver(run, { warn })();

    expect(sessions).toEqual([]);
    // Empty state is `ok([])`, so the degrade warn does NOT fire.
    expect(warn).not.toHaveBeenCalled();
  });
});
