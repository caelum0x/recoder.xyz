/**
 * acp-process — the real {@link AcpProcess} backed by `child_process.spawn`, and
 * the spawner factory the {@link AcpAgentDriver} takes. This is the ONLY part of
 * the ACP stack that touches the OS; everything above it (codec, client, driver)
 * is pure and unit-tested. The low-level spawn is injectable so THIS adapter is
 * testable too — a fake child (stdin write spy + stdout/exit emitters) exercises
 * the stream→callback wiring without launching a binary.
 *
 * The agent process speaks JSON-RPC over stdio, so we pipe stdin/stdout and leave
 * stderr inherited-or-piped for logs. stdout chunks are decoded utf8 and handed to
 * the driver's `feed`; a spawn error or exit both surface through `onExit` so the
 * driver's `rejectAll` fires exactly once.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import type { AcpProcess } from './acp-driver.js';

/** The minimal child surface we depend on (real ChildProcess satisfies it). */
export interface AcpChild {
  stdin: { write(data: string): void } | null;
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null;
  on(event: 'exit', cb: (code: number | null) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

/** The low-level spawn seam (defaults to node's; tests inject a fake). */
export type LowLevelSpawn = (command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) => AcpChild;

const defaultSpawn: LowLevelSpawn = (command, args, cwd, env) =>
  nodeSpawn(command, [...args], { cwd, env, stdio: ['pipe', 'pipe', 'inherit'] }) as unknown as AcpChild;

export interface AcpSpawnOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam; defaults to the real node spawn. */
  readonly spawn?: LowLevelSpawn;
}

/** Wrap a spawned child as an {@link AcpProcess}. */
export function makeAcpProcess(opts: AcpSpawnOptions): AcpProcess {
  const spawnFn = opts.spawn ?? defaultSpawn;
  const child = spawnFn(opts.command, opts.args ?? [], opts.cwd, opts.env ?? process.env);
  let exitFired = false;
  const fireExitOnce = (cb: (code: number | null) => void, code: number | null): void => {
    if (exitFired) return;
    exitFired = true;
    cb(code);
  };
  return {
    write: (data) => child.stdin?.write(data),
    onData: (cb) => child.stdout?.on('data', (chunk) => cb(chunk.toString())),
    onExit: (cb) => {
      // A failed spawn ('error') and a normal 'exit' both mean the agent is gone;
      // fire the driver's exit hook exactly once so rejectAll can't double-run.
      child.on('exit', (code) => fireExitOnce(cb, code));
      child.on('error', () => fireExitOnce(cb, null));
    },
    kill: () => {
      child.kill();
    },
  };
}

/** A spawner the driver calls (`() => AcpProcess`), binding the process options. */
export function makeAcpSpawner(opts: AcpSpawnOptions): () => AcpProcess {
  return () => makeAcpProcess(opts);
}
