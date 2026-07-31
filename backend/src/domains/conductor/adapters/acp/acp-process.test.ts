/**
 * acp-process — the child_process-backed AcpProcess, tested with a fake child.
 *
 * Proves: write() reaches the child's stdin; stdout Buffer/string chunks are
 * decoded to utf8 and delivered to onData; kill() calls the child; and 'exit'
 * OR 'error' fires the exit hook EXACTLY ONCE (so the driver's rejectAll can't
 * double-run). No real process is spawned.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeAcpProcess, makeAcpSpawner, type AcpChild, type LowLevelSpawn } from './acp-process.js';

function fakeChild() {
  const emitter = new EventEmitter() as EventEmitter & AcpChild;
  const stdinWrite = vi.fn();
  const stdout = new EventEmitter();
  const child: AcpChild = {
    stdin: { write: stdinWrite },
    stdout: { on: (event, cb) => stdout.on(event, cb) },
    on: (event, cb) => emitter.on(event, cb as never),
    kill: vi.fn(() => true),
  };
  const spawn: LowLevelSpawn = () => child;
  return { child, spawn, stdinWrite, emitExit: (c: number | null) => emitter.emit('exit', c), emitError: () => emitter.emit('error', new Error('spawn failed')), emitData: (chunk: Buffer | string) => stdout.emit('data', chunk) };
}

const baseOpts = (spawn: LowLevelSpawn) => ({ command: 'claude-agent-acp', args: ['--stdio'], cwd: '/wt', spawn });

describe('makeAcpProcess', () => {
  it('write() forwards to the child stdin', () => {
    const f = fakeChild();
    const proc = makeAcpProcess(baseOpts(f.spawn));
    proc.write('{"jsonrpc":"2.0"}\n');
    expect(f.stdinWrite).toHaveBeenCalledWith('{"jsonrpc":"2.0"}\n');
  });

  it('decodes stdout chunks (Buffer or string) to utf8 for onData', () => {
    const f = fakeChild();
    const proc = makeAcpProcess(baseOpts(f.spawn));
    const got: string[] = [];
    proc.onData((c) => got.push(c));
    f.emitData(Buffer.from('hello '));
    f.emitData('world');
    expect(got).toEqual(['hello ', 'world']);
  });

  it('fires onExit exactly once for a normal exit', () => {
    const f = fakeChild();
    const proc = makeAcpProcess(baseOpts(f.spawn));
    const onExit = vi.fn();
    proc.onExit(onExit);
    f.emitExit(0);
    f.emitExit(0); // a second event must not double-fire
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it('a spawn error also fires onExit once (agent never came up)', () => {
    const f = fakeChild();
    const proc = makeAcpProcess(baseOpts(f.spawn));
    const onExit = vi.fn();
    proc.onExit(onExit);
    f.emitError();
    f.emitExit(1); // exit after error must not double-fire
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(null);
  });

  it('kill() terminates the child', () => {
    const f = fakeChild();
    const proc = makeAcpProcess(baseOpts(f.spawn));
    proc.kill();
    expect(f.child.kill).toHaveBeenCalled();
  });
});

describe('makeAcpSpawner', () => {
  it('returns a factory that yields a fresh AcpProcess per call', () => {
    const f = fakeChild();
    const spawner = makeAcpSpawner(baseOpts(f.spawn));
    const proc = spawner();
    proc.write('x');
    expect(f.stdinWrite).toHaveBeenCalledWith('x');
  });
});
