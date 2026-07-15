/**
 * `runCli` — the ONE degrade-safe subprocess primitive every CLI engine adapter
 * (beads / dmux / tmux / recodergit) shells through. It is the raw-transport
 * layer the seam owns (conflict #8: engines own the transport); a capability
 * domain never spawns a CLI itself, it takes a typed `EngineClientPort`.
 *
 * Laws (mirror the `EngineClientPort` contract):
 *  - NEVER throws: a missing binary (ENOENT), a non-zero exit, or a spawn error
 *    resolves to a truthful `{ ok:false }` — the adapter maps it to `fail(...)`.
 *  - Bounded: every call has a hard `timeoutMs` deadline (default 15s) and is
 *    SIGKILL'd past it, so `invoke` can never hang the seam.
 *  - Minimal env: the child gets ONLY the overlay passed in (plus PATH so the OS
 *    can resolve a bare binary name) — NEVER the whole `process.env` (secret-leak
 *    guard, matching the daemon/sidecar supervisors).
 */
import { spawn } from 'node:child_process';

/** The captured outcome of one bounded CLI invocation. */
export interface CliResult {
  /** True only on a clean `exit 0` within the deadline. */
  readonly ok: boolean;
  /** Process exit code (null when killed by signal / never started). */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Present when the process could not start / timed out / was signalled. */
  readonly reason?: string;
  /** True when the deadline fired and the child was killed. */
  readonly timedOut?: boolean;
}

/** Options for one bounded CLI run. */
export interface RunCliOptions {
  /** cwd for the child (vendored dep / repo resolution). */
  readonly cwd?: string;
  /** MINIMAL env overlay — merged onto a PATH-only base, never the full env. */
  readonly env?: Readonly<Record<string, string>>;
  /** Hard deadline (ms) before the child is SIGKILL'd. Default 15_000. */
  readonly timeoutMs?: number;
  /** Optional stdin payload written then closed (e.g. JSON for a subcommand). */
  readonly stdin?: string;
}

const DEFAULT_CLI_TIMEOUT_MS = 15_000;

/**
 * Run `bin arg...` with a bounded deadline and a minimal env. Resolves to a
 * `CliResult` — it never rejects, so the caller pattern is a plain `await` with
 * no try/catch. A bare binary name is resolved via the inherited `PATH`.
 */
export function runCli(
  bin: string,
  args: readonly string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
  // PATH-only base so a bare binary name (e.g. `bd`, `tmux`) still resolves, plus
  // the caller's minimal overlay. NEVER `...process.env` (secret-leak guard).
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    ...(options.env ?? {}),
  };

  return new Promise<CliResult>((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: CliResult): void => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };

    let child;
    try {
      child = spawn(bin, [...args], {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        env,
        stdio: [options.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: false,
      });
    } catch (err) {
      finish({ ok: false, code: null, stdout: '', stderr: '', reason: message(err) });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // best-effort kill; result already carries the timeout reason
      }
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        timedOut: true,
        reason: `cli '${bin}' exceeded ${timeoutMs}ms deadline`,
      });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, code: null, stdout, stderr, reason: message(err) });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
        ...(code === 0 ? {} : { reason: `exit ${code ?? 'null'}: ${stderr.trim().slice(0, 200)}` }),
      });
    });

    if (options.stdin !== undefined && child.stdin) {
      child.stdin.end(options.stdin);
    }
  });
}

/** Parse CLI JSON stdout; falls back to the trimmed raw text when not JSON. */
export function parseCliJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
