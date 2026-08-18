/**
 * loom-daemon — supervised lifecycle against a REAL fake `loom server`.
 *
 * The fake bin is a tiny shebang'd node script that binds the injected
 * `LOOM_SOCKET_PATH` and answers `ping` with a pong (protocol configurable), so
 * `start()` drives the REAL child spawn + socket poll + REAL `LoomSocketClient`
 * ping handshake, and `stop()` drives the REAL process-group kill. It also proves
 * the two truthful-degrade paths: the binary absent (no spawn, `running:false`
 * with the resolver reason) and a health timeout (server that never binds).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLoomDaemon,
  isSecretLoomEnvKey,
  defaultRecoderLoomSocketPath,
  type LoomChild,
  type LoomDaemon,
} from './loom-daemon.js';

// --- fake `loom server` scripts ---------------------------------------------

/** A fake that binds LOOM_SOCKET_PATH and answers `ping` (protocol via env). */
const HEALTHY_FAKE = `#!/usr/bin/env node
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const socketPath = process.env.LOOM_SOCKET_PATH;
if (!socketPath) process.exit(2);
const dump = process.env.LOOM_ENV_DUMP;
if (dump) {
  fs.writeFileSync(dump, JSON.stringify({
    hasSecret: process.env.BETTER_AUTH_SECRET !== undefined,
    hasDbUrl: process.env.DATABASE_URL !== undefined,
    hasInternal: process.env.INTERNAL_SERVICE_KEY !== undefined,
    hasPath: process.env.PATH !== undefined,
    hasAnthropic: process.env.ANTHROPIC_API_KEY !== undefined,
    socketPath,
  }));
}
try { fs.mkdirSync(path.dirname(socketPath), { recursive: true }); } catch {}
try { fs.rmSync(socketPath, { force: true }); } catch {}
const protocol = Number(process.env.FAKE_PROTOCOL || '21');
const server = net.createServer((sock) => {
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\\n')) !== -1) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let req; try { req = JSON.parse(line); } catch { continue; }
      if (req.method === 'ping') {
        sock.write(JSON.stringify({ id: req.id, result: { type: 'pong', protocol, version: 'fake-1.0' } }) + '\\n');
      } else {
        sock.write(JSON.stringify({ id: req.id, error: { code: 'unhandled', message: req.method } }) + '\\n');
      }
    }
  });
});
server.listen(socketPath);
process.on('SIGTERM', () => { try { server.close(); } catch {} process.exit(0); });
setInterval(() => {}, 1 << 30);
`;

/** A fake that spawns fine but NEVER binds the socket (forces a health timeout). */
const NO_SOCKET_FAKE = `#!/usr/bin/env node
setInterval(() => {}, 1 << 30);
`;

let dirCounter = 0;
const daemons: LoomDaemon[] = [];
const tempDirs: string[] = [];

function writeFake(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'loom-daemon-test-'));
  tempDirs.push(dir);
  const script = join(dir, 'loom-fake');
  writeFileSync(script, body);
  chmodSync(script, 0o755);
  return script;
}

function socketFor(): string {
  dirCounter += 1;
  const dir = mkdtempSync(join(tmpdir(), 'loom-sock-'));
  tempDirs.push(dir);
  return join(dir, `loom-${dirCounter}.sock`);
}

async function isPidAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  for (const d of daemons.splice(0)) await d.stop().catch(() => {});
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('createLoomDaemon — real lifecycle against a fake loom server', () => {
  it('spawns, ping-handshakes protocol 21 healthy, then stops without an orphan', async () => {
    const bin = writeFake(HEALTHY_FAKE);
    const socketPath = socketFor();
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin }),
      env: { PATH: process.env.PATH },
      healthTimeoutMs: 5_000,
      pollIntervalMs: 50,
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(status.running).toBe(true);
    expect(status.protocol).toBe(21);
    expect(status.socketPath).toBe(socketPath);
    expect(status.pid).toBeGreaterThan(0);
    expect(existsSync(socketPath)).toBe(true);

    const pid = status.pid!;
    await daemon.stop();
    expect(daemon.status().running).toBe(false);

    // No orphan: the process group is gone shortly after stop().
    let alive = true;
    for (let i = 0; i < 40 && alive; i++) {
      alive = await isPidAlive(pid);
      if (alive) await new Promise(r => setTimeout(r, 25));
    }
    expect(alive).toBe(false);
    // The socket file is cleaned up on stop.
    expect(existsSync(socketPath)).toBe(false);
  });

  it('start() is idempotent while healthy (reuses the one live server)', async () => {
    const bin = writeFake(HEALTHY_FAKE);
    const daemon = createLoomDaemon({
      socketPath: socketFor(),
      resolveBin: () => ({ bin }),
      env: { PATH: process.env.PATH },
      healthTimeoutMs: 5_000,
      pollIntervalMs: 50,
    });
    daemons.push(daemon);

    const a = await daemon.start();
    const b = await daemon.start();
    expect(a.pid).toBe(b.pid);
    expect(b.running).toBe(true);
  });

  it('spawns the daemon with backend secrets STRIPPED and needed vars kept + socket pinned', async () => {
    const bin = writeFake(HEALTHY_FAKE);
    const socketPath = socketFor();
    const dumpPath = join(mkdtempSync(join(tmpdir(), 'loom-env-')), 'env.json');
    tempDirs.push(dumpPath);
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin }),
      env: {
        PATH: process.env.PATH,
        ANTHROPIC_API_KEY: 'sk-keep-me',
        BETTER_AUTH_SECRET: 'leak-secret',
        DATABASE_URL: 'postgres://leak',
        INTERNAL_SERVICE_KEY: 'leak-internal',
        LOOM_ENV_DUMP: dumpPath,
      },
      healthTimeoutMs: 5_000,
      pollIntervalMs: 50,
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(status.running).toBe(true);

    const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as Record<string, unknown>;
    // STRIPPED — the prompt-injectable daemon never inherits backend secrets:
    expect(dump.hasSecret).toBe(false);
    expect(dump.hasDbUrl).toBe(false);
    expect(dump.hasInternal).toBe(false);
    // KEPT — what the agents legitimately need:
    expect(dump.hasPath).toBe(true);
    expect(dump.hasAnthropic).toBe(true);
    // The Recoder-owned socket path is pinned into the child env.
    expect(dump.socketPath).toBe(socketPath);
  });

  it('degrades truthfully (no spawn) when the binary is absent', async () => {
    let spawnCalls = 0;
    const daemon = createLoomDaemon({
      socketPath: socketFor(),
      resolveBin: () => ({ bin: null, reason: 'loom binary not found (set CONDUCTOR_LOOM_BIN)' }),
      spawn: () => {
        spawnCalls += 1;
        throw new Error('spawn must not be called when the binary is absent');
      },
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(status.running).toBe(false);
    expect(status.reason).toMatch(/loom binary not found/);
    expect(spawnCalls).toBe(0);
  });

  it('reports a health timeout (and reaps the child) when the server never binds', async () => {
    const bin = writeFake(NO_SOCKET_FAKE);
    const daemon = createLoomDaemon({
      socketPath: socketFor(),
      resolveBin: () => ({ bin }),
      env: { PATH: process.env.PATH },
      healthTimeoutMs: 700,
      pollIntervalMs: 50,
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(status.running).toBe(false);
    expect(status.reason).toMatch(/did not become healthy/);
  });
});

describe('createLoomDaemon — adopt an existing healthy server (durability/reattach)', () => {
  // A minimal injected child so spawn-path tests never touch a real process; the
  // huge pid keeps killTracked's signals harmless no-ops (ESRCH, caught).
  function fakeChild(): LoomChild {
    return {
      pid: 2_147_480_000,
      stderr: { on: () => {} },
      on: () => {},
      kill: () => true,
      unref: () => {},
    };
  }

  it('adopts an already-healthy protocol-21 server without spawning', async () => {
    const socketPath = socketFor();
    writeFileSync(socketPath, ''); // an existing socket that must NOT be rm-ed
    let spawnCalls = 0;
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin: '/does/not/matter/loom' }),
      exists: () => true,
      makeClient: () => ({ ping: async () => ({ protocol: 21, version: 'live' }) }),
      spawn: () => {
        spawnCalls += 1;
        throw new Error('spawn must not be called when adopting a healthy server');
      },
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(spawnCalls).toBe(0);
    expect(status.running).toBe(true);
    expect(status.adopted).toBe(true);
    expect(status.protocol).toBe(21);
    expect(status.pid).toBeUndefined();
    // The adopted server's socket is left intact (never reclaimed).
    expect(existsSync(socketPath)).toBe(true);
  });

  it('does NOT adopt on a protocol mismatch — reclaims the socket and spawns', async () => {
    const socketPath = socketFor();
    writeFileSync(socketPath, 'stale');
    let spawnCalls = 0;
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin: '/fake/loom' }),
      exists: existsSync,
      makeClient: () => ({ ping: async () => ({ protocol: 19 }) }),
      spawn: () => {
        spawnCalls += 1;
        return fakeChild();
      },
      healthTimeoutMs: 150,
      pollIntervalMs: 20,
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(spawnCalls).toBe(1);
    expect(status.adopted).toBeUndefined();
    expect(status.running).toBe(false);
    // The stale socket was reclaimed (rm-ed) before spawning, as before.
    expect(existsSync(socketPath)).toBe(false);
  });

  it('does NOT adopt when the ping throws (stale socket, no listener) — spawns', async () => {
    const socketPath = socketFor();
    writeFileSync(socketPath, 'stale');
    let spawnCalls = 0;
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin: '/fake/loom' }),
      exists: existsSync,
      makeClient: () => ({
        ping: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        },
      }),
      spawn: () => {
        spawnCalls += 1;
        return fakeChild();
      },
      healthTimeoutMs: 150,
      pollIntervalMs: 20,
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(spawnCalls).toBe(1);
    expect(status.adopted).toBeUndefined();
    expect(status.running).toBe(false);
    expect(existsSync(socketPath)).toBe(false);
  });

  it('adopts even when resolveBin() cannot find a local binary', async () => {
    const socketPath = socketFor();
    let spawnCalls = 0;
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin: null, reason: 'loom binary not found' }),
      exists: () => true,
      makeClient: () => ({ ping: async () => ({ protocol: 21 }) }),
      spawn: () => {
        spawnCalls += 1;
        throw new Error('must not spawn — a healthy server is already up');
      },
    });
    daemons.push(daemon);

    const status = await daemon.start();
    expect(spawnCalls).toBe(0);
    expect(status.running).toBe(true);
    expect(status.adopted).toBe(true);
  });

  it('stop() on an ADOPTED server detaches — no kill, socket left running', async () => {
    const socketPath = socketFor();
    writeFileSync(socketPath, '');
    let spawnCalls = 0;
    const daemon = createLoomDaemon({
      socketPath,
      resolveBin: () => ({ bin: null, reason: 'no local binary' }),
      exists: () => true,
      makeClient: () => ({ ping: async () => ({ protocol: 21 }) }),
      spawn: () => {
        spawnCalls += 1;
        throw new Error('adopt path must not spawn');
      },
    });
    daemons.push(daemon);

    const started = await daemon.start();
    expect(started.adopted).toBe(true);

    await daemon.stop();
    const stopped = daemon.status();
    expect(spawnCalls).toBe(0);
    expect(stopped.running).toBe(false);
    expect(stopped.reason).toMatch(/detached/);
    // The adopted herd's socket is left intact — never removed on detach.
    expect(existsSync(socketPath)).toBe(true);
  });
});

describe('isSecretLoomEnvKey', () => {
  it('flags backend secrets and spares agent-needed vars', () => {
    for (const k of [
      'BETTER_AUTH_SECRET',
      'SESSION_SECRET',
      'DATABASE_URL',
      'AUTH_DATABASE_URL',
      'INTERNAL_SERVICE_KEY',
      'API_KEY_HASH_SALT',
      'CREEM_API_KEY',
      'CLOUDFLARE_API_TOKEN',
      'DAYTONA_API_KEY',
      'DB_PASSWORD',
    ]) {
      expect(isSecretLoomEnvKey(k)).toBe(true);
    }
    for (const k of ['PATH', 'HOME', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GITHUB_TOKEN', 'LANG']) {
      expect(isSecretLoomEnvKey(k)).toBe(false);
    }
  });
});

describe('defaultRecoderLoomSocketPath', () => {
  it('prefers the CONDUCTOR_LOOM_SOCKET_PATH override', () => {
    expect(
      defaultRecoderLoomSocketPath({ CONDUCTOR_LOOM_SOCKET_PATH: '/owned/loom.sock' })
    ).toBe('/owned/loom.sock');
  });

  it('roots under RECODER_STATE_DIR when set (Recoder-owned, not ~/.config/loom)', () => {
    const p = defaultRecoderLoomSocketPath({ RECODER_STATE_DIR: '/var/lib/recoder' });
    expect(p).toBe(join('/var/lib/recoder', 'loom', 'loom.sock'));
    expect(p).not.toMatch(/\.config\/loom/);
  });

  it('falls back to a Recoder-owned tmp dir (never ~/.config/loom)', () => {
    const p = defaultRecoderLoomSocketPath({});
    expect(p).toMatch(/recoder-loom/);
    expect(p.endsWith('loom.sock')).toBe(true);
    expect(p).not.toMatch(/\.config\/loom/);
  });
});
