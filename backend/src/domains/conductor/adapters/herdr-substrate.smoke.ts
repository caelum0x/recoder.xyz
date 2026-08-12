/**
 * REAL-BINARY smoke for the herdr socket client ↔ engine wire (Phase 1).
 *
 * Proves the reused Phase-0 {@link HerdrSocketClient} drives the REAL vendored
 * `herdr` engine (not just the in-memory fake): it spawns `herdr server` with a
 * Recoder-owned temp `HERDR_SOCKET_PATH`, waits for the socket, then over the
 * client performs `ping` (asserting protocol 20), `worktree.create` in a throwaway
 * git repo, and `worktree.remove`, before shutting the server down.
 *
 * It deliberately does NOT launch a real coding agent (that needs the agent CLIs).
 *
 * GUARD: if the engine binary is absent this SKIPS (exit 0) — it is not a test
 * failure to lack the built sidecar. Resolution order for the binary:
 *   1. `HERDR_BIN` env (absolute path),
 *   2. `<cwd>/apps/desktop/engines/herdr/target/release/herdr`.
 *
 * Run standalone (not under vitest — the filename is `*.smoke.ts`, not
 * `*.test.ts`): `pnpm exec tsx <this file>` (optionally `HERDR_BIN=… tsx …`).
 * Emits a single `SMOKE: passed|failed|skipped — <detail>` line and exits
 * 0 (passed/skipped) or 1 (failed). The engine server + temp dirs are always
 * cleaned up before exit.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  HerdrSocketClient,
  type HerdrResult,
} from '@recoder/agent-runtimes/herdr';

const run = promisify(execFile);

interface SmokeResult {
  status: 'passed' | 'failed' | 'skipped';
  detail: string;
}

function resolveBinary(): string | null {
  const fromEnv = process.env.HERDR_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const local = join(
    process.cwd(),
    'apps/desktop/engines/herdr/target/release/herdr'
  );
  if (existsSync(local)) return local;
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSocket(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await delay(100);
  }
  throw new Error(
    `herdr socket did not appear at ${path} within ${timeoutMs}ms`
  );
}

async function runSmoke(): Promise<SmokeResult> {
  const binary = resolveBinary();
  if (binary == null) {
    return {
      status: 'skipped',
      detail:
        'herdr engine binary absent (set HERDR_BIN or build apps/desktop/engines/herdr)',
    };
  }

  const workDir = mkdtempSync(join(tmpdir(), 'herdr-smoke-'));
  const repoDir = join(workDir, 'repo');
  const socketPath = join(workDir, 'herdr.sock');
  let serverPid: number | undefined;

  try {
    // A throwaway git repo with one commit so worktree.create has a base ref.
    await run('git', ['init', '-q', repoDir]);
    await run('git', ['-C', repoDir, 'config', 'user.email', 'smoke@recoder.dev']);
    await run('git', ['-C', repoDir, 'config', 'user.name', 'herdr smoke']);
    await run('git', ['-C', repoDir, 'commit', '--allow-empty', '-q', '-m', 'base']);

    // Spawn the REAL headless server on a Recoder-owned socket path. `detached`
    // puts it in its own process group so cleanup can signal the WHOLE group —
    // herdr advertises a `detached_server_daemon` capability (it may double-fork a
    // daemon), so the direct child pid alone is not always the live server.
    const server = spawn(binary, ['server'], {
      env: { ...process.env, HERDR_SOCKET_PATH: socketPath },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    serverPid = server.pid;
    let serverErr = '';
    server.stderr?.on('data', d => {
      serverErr += d.toString('utf8');
    });

    await waitForSocket(socketPath, 15_000);

    const client = new HerdrSocketClient({ socketPath, callTimeoutMs: 10_000 });

    // 1) ping — must handshake protocol 20.
    const pong = await client.ping();
    if (pong.protocol !== 20) {
      return {
        status: 'failed',
        detail: `ping returned protocol ${pong.protocol}, expected 20`,
      };
    }

    // 2) worktree.create in the throwaway repo.
    const created = await client.call<HerdrResult>('worktree.create', {
      cwd: repoDir,
      branch: 'smoke/wt',
      base: 'HEAD',
    });
    if (created.type !== 'worktree_created') {
      return {
        status: 'failed',
        detail: `worktree.create returned '${created.type}', expected 'worktree_created'; stderr=${serverErr.slice(0, 400)}`,
      };
    }
    const workspaceId = (
      created as Extract<HerdrResult, { type: 'worktree_created' }>
    ).workspace.workspace_id;

    // 3) worktree.remove — tear the native worktree back down.
    const removed = await client.call<HerdrResult>('worktree.remove', {
      workspace_id: workspaceId,
      force: true,
    });
    if (removed.type !== 'worktree_removed') {
      return {
        status: 'failed',
        detail: `worktree.remove returned '${removed.type}', expected 'worktree_removed'`,
      };
    }

    return {
      status: 'passed',
      detail: `ping protocol=${pong.protocol} version=${pong.version}; worktree.create+remove ok (ws=${workspaceId})`,
    };
  } catch (err) {
    return {
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Best-effort: signal the server's whole process group (negative pid) so a
    // forked daemon is reaped too, then the direct pid as a fallback. A fully
    // double-forked herdr daemon may reparent out of the group and survive on its
    // (unique, isolated) socket — an honestly-acknowledged herdr behavior.
    if (serverPid != null) {
      for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
        try {
          process.kill(-serverPid, sig);
        } catch {
          /* group gone */
        }
        try {
          process.kill(serverPid, sig);
        } catch {
          /* pid gone */
        }
      }
    }
    rmSync(workDir, { recursive: true, force: true });
  }
}

runSmoke()
  .then(result => {
    // eslint-disable-next-line no-console
    console.log(`SMOKE: ${result.status} — ${result.detail}`);
    process.exit(result.status === 'failed' ? 1 : 0);
  })
  .catch(err => {
    // eslint-disable-next-line no-console
    console.log(
      `SMOKE: failed — ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
