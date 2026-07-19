/**
 * Tests for the tmux introspection adapter port — the DEEP read-only capability
 * over the pinned tmux binary. The binary seam (`TmuxRun`) is MOCKED so no real
 * tmux is spawned; the live path drives the same `runCli(TMUX_BIN, ...)` primitive
 * the base adapter uses.
 *
 * Covers: the `-F` format parse into typed records, the "no server running" empty
 * state (present binary, zero sessions → not a failure), the ENOENT → truthful
 * `{ ok:false, reason }` degrade, the bounded capture (maxLines keeps the newest +
 * flags truncation), and the disabled-by-config short-circuit.
 */
import { describe, it, expect, vi } from 'vitest';
import type { CliResult } from './cli-exec.js';
import { createTmuxIntrospect, type TmuxRun } from './tmux-introspect.adapter.js';

const FS = '\x1f';
const BIN = '/vendored/tmux';

function okResult(stdout: string): CliResult {
  return { ok: true, code: 0, stdout, stderr: '' };
}
function failResult(reason: string, stderr = ''): CliResult {
  return { ok: false, code: 1, stdout: '', stderr, reason };
}

function makePort(run: TmuxRun, enabled = true) {
  return createTmuxIntrospect({ bin: BIN, enabled: () => enabled, vendored: true, run });
}

describe('listSessions', () => {
  it('parses the -F session rows into typed records', async () => {
    const row = ['recoder-run-1', '$1', '3', '1', '1700000000', '1700000900'].join(FS);
    const run = vi.fn(async () => okResult(`${row}\n`));
    const port = makePort(run);
    const res = await port.listSessions();
    expect(run).toHaveBeenCalledWith(BIN, ['list-sessions', '-F', expect.any(String)], expect.any(Object));
    expect(res.ok && res.value).toEqual([
      { name: 'recoder-run-1', id: '$1', windows: 3, attached: true, created: '1700000000', activity: '1700000900' },
    ]);
  });

  it('treats "no server running" as the empty state (ok, [])', async () => {
    const run = vi.fn(async () => failResult('exit 1: no server running on /tmp/tmux-501/default'));
    const res = await makePort(run).listSessions();
    expect(res).toEqual({ ok: true, value: [] });
  });

  it('degrades truthfully when tmux is not installed (ENOENT)', async () => {
    const run = vi.fn(async () => failResult('spawn tmux ENOENT'));
    const res = await makePort(run).listSessions();
    expect(res).toMatchObject({ ok: false, reason: 'tmux is not installed on this host', code: 'unavailable' });
  });

  it('short-circuits when the tmux engine is disabled by config', async () => {
    const run = vi.fn(async () => okResult(''));
    const res = await makePort(run, false).listSessions();
    expect(run).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, code: 'disabled' });
  });
});

describe('listPanes', () => {
  it('parses pane rows and scopes to a target when given', async () => {
    const row = ['%2', '0', '4242', '1', 'node', '/repo/wt', '120', '40', 'agent'].join(FS);
    const run = vi.fn(async () => okResult(`${row}\n`));
    const res = await makePort(run).listPanes('recoder-run-1');
    expect(run).toHaveBeenCalledWith(
      BIN,
      ['list-panes', '-t', 'recoder-run-1', '-F', expect.any(String)],
      expect.any(Object),
    );
    expect(res.ok && res.value).toEqual([
      { id: '%2', index: 0, pid: 4242, active: true, command: 'node', path: '/repo/wt', width: 120, height: 40, title: 'agent' },
    ]);
  });

  it('lists across all sessions (-a) with no target', async () => {
    const run = vi.fn(async () => okResult(''));
    await makePort(run).listPanes();
    expect(run).toHaveBeenCalledWith(BIN, ['list-panes', '-a', '-F', expect.any(String)], expect.any(Object));
  });
});

describe('capturePane', () => {
  it('requires a target', async () => {
    const run = vi.fn(async () => okResult(''));
    const res = await makePort(run).capturePane({ target: '  ' });
    expect(run).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, code: 'bad_input' });
  });

  it('passes -S/-E/-J and returns the pane content', async () => {
    const run = vi.fn(async () => okResult('line1\nline2\n'));
    const res = await makePort(run).capturePane({ target: '%1', startLine: -50, endLine: 0, join: true });
    expect(run).toHaveBeenCalledWith(
      BIN,
      ['capture-pane', '-p', '-t', '%1', '-J', '-S', '-50', '-E', '0'],
      expect.any(Object),
    );
    expect(res.ok && res.value).toEqual({ target: '%1', lines: ['line1', 'line2'], content: 'line1\nline2', truncated: false });
  });

  it('keeps only the newest maxLines and flags truncation', async () => {
    const run = vi.fn(async () => okResult('a\nb\nc\nd\n'));
    const res = await makePort(run).capturePane({ target: '%1', maxLines: 2 });
    expect(res.ok && res.value).toEqual({ target: '%1', lines: ['c', 'd'], content: 'c\nd', truncated: true });
  });
});

describe('serverInfo', () => {
  it('rolls up version + running + counts', async () => {
    const sessionRow = ['s', '$1', '1', '1', '1700000000', '1700000900'].join(FS);
    const run = vi.fn(async (_bin: string, args: readonly string[]) => {
      if (args[0] === '-V') return okResult('tmux 3.5a');
      if (args[0] === 'list-sessions' && args.includes('-F')) return okResult(`${sessionRow}\n`);
      if (args[0] === 'list-clients') return okResult('client-1\nclient-2\n');
      return okResult('');
    });
    const res = await makePort(run).serverInfo();
    expect(res.ok && res.value).toEqual({
      running: true,
      version: 'tmux 3.5a',
      vendored: true,
      bindingPath: BIN,
      sessions: 1,
      clients: 2,
    });
  });

  it('reports running:false with zero sessions when no server runs', async () => {
    const run = vi.fn(async (_bin: string, args: readonly string[]) => {
      if (args[0] === '-V') return okResult('tmux 3.5a');
      return failResult('exit 1: no server running on /tmp/tmux-501/default');
    });
    const res = await makePort(run).serverInfo();
    expect(res.ok && res.value).toMatchObject({ running: false, sessions: 0, clients: 0 });
  });

  it('degrades truthfully when the binary is missing', async () => {
    const run = vi.fn(async () => failResult('spawn tmux ENOENT'));
    const res = await makePort(run).serverInfo();
    expect(res).toMatchObject({ ok: false, reason: 'tmux is not installed on this host', code: 'unavailable' });
  });
});
