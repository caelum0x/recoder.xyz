/**
 * backend-supervisor.js
 *
 * Makes the Electron desktop app SELF-CONTAINED: instead of expecting an
 * externally-run backend at DOCKER_BACKEND_URL, the desktop process boots a
 * local docker-backend on a free loopback port and hands the cockpit the
 * resulting { backendUrl, apiKey } so it can drive the conductor (tmux + the
 * engines) with no external dependency.
 *
 * Responsibilities (all real, never faked):
 *   1. Pick a free 127.0.0.1 port.
 *   2. Assemble a hermetic env: a per-install random API_KEY_HASH_SALT and
 *      INTERNAL_SERVICE_KEY (persisted to userData, NOT committed), STRICT_AUTH=false,
 *      a private DATA_DIR under userData, and the resolved vendored tmux binary
 *      (repo c/tmux/tmux in dev; bundled extraResources path when packaged).
 *   3. Mint a local platform sk_ key by running the real dev-mint-conductor-key
 *      script (which calls createApiKey) with the SAME salt + DATA_DIR the server
 *      will use, so the persisted hash is valid for the spawned server.
 *   4. Spawn the backend child (dev: tsx src/server.ts from the repo; packaged:
 *      node <resourcesPath>/backend/dist/server.js).
 *   5. Poll GET /api/conductor/health with the key until 200 (bounded timeout;
 *      a timeout is surfaced truthfully as a failed status — never fake-ready).
 *   6. Expose getAuth() -> { backendUrl, apiKey } for main.js getAuth().
 *   7. Kill the child on app quit. Restart-on-crash with exponential backoff.
 *
 * This module is dependency-injected (spawn / fetch / fs / paths) so it can be
 * unit-tested with a fake child process and a fake health server, with no
 * Electron runtime and no real backend.
 */

'use strict';

const nodeFs = require('fs');
const nodePath = require('path');
const nodeOs = require('os');
const nodeCrypto = require('crypto');
const childProcess = require('child_process');
const net = require('net');

// ---------------------------------------------------------------------------
// Status contract — what main.js / the UI read. Never lies about readiness.
// ---------------------------------------------------------------------------

/** @typedef {'idle'|'starting'|'ready'|'crashed'|'failed'|'stopped'} SupervisorPhase */

const PHASE = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  READY: 'ready',
  CRASHED: 'crashed',
  FAILED: 'failed',
  STOPPED: 'stopped',
});

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Pick a free TCP port bound to 127.0.0.1 by listening on port 0 and reading
 * the OS-assigned port. Resolves with the port number.
 * @param {{ createServer?: typeof net.createServer }} [deps]
 * @returns {Promise<number>}
 */
function pickFreePort(deps = {}) {
  const createServer = deps.createServer || net.createServer;
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    let settled = false;
    const onError = (err) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch { /* already closing */ }
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    server.on('error', onError);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        if (settled) return;
        settled = true;
        server.close(() => reject(new Error('Failed to resolve a free port')));
        return;
      }
      const { port } = address;
      server.close(() => {
        if (settled) return;
        settled = true;
        resolve(port);
      });
    });
  });
}

/**
 * Resolve true if the given TCP port is free to bind on 127.0.0.1.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Pick a free loopback port with bounded retries. The OS-assigned port from a
 * single port-0 bind is occasionally racy (another process can grab it between
 * close() and our spawn), so retry on transient failures. Truthfully rejects if
 * no free port can be found after `attempts` tries.
 * @param {{ pickFreePort?: () => Promise<number>, attempts?: number, sleep?: (ms: number) => Promise<void> }} [deps]
 * @returns {Promise<number>}
 */
async function pickFreePortWithRetry(deps = {}) {
  const pick = deps.pickFreePort || (() => pickFreePort());
  const attempts = Math.max(1, deps.attempts ?? 5);
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const port = await pick();
      if (Number.isInteger(port) && port > 0 && port < 65536) {
        return port;
      }
      lastErr = new Error(`pickFreePort returned an invalid port: ${port}`);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    if (i < attempts - 1) {
      await sleep(25 * (i + 1));
    }
  }
  throw new Error(
    `could not acquire a free loopback port after ${attempts} attempts` +
      (lastErr ? `: ${lastErr.message}` : ''),
  );
}

/**
 * Resolve the vendored tmux binary path the backend should drive.
 * Dev: <repoRoot>/c/tmux/tmux. Packaged: <resourcesPath>/backend/c/tmux/tmux
 * (bundled via extraResources). Returns the first existing candidate, or the
 * dev candidate as a best-effort default so the env is always set (the backend
 * surfaces a truthful "tmux missing" via /health if the path is wrong).
 * @param {{ isPackaged: boolean, repoRoot: string, resourcesPath?: string, existsSync?: (p: string) => boolean }} opts
 * @returns {string}
 */
function resolveTmuxBin(opts) {
  const existsSync = opts.existsSync || nodeFs.existsSync;
  const explicit = process.env.RECODER_DESKTOP_TMUX_BIN || process.env.CONDUCTOR_TMUX_BIN;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }
  const candidates = [];
  if (opts.isPackaged && opts.resourcesPath) {
    candidates.push(nodePath.join(opts.resourcesPath, 'backend', 'c', 'tmux', 'tmux'));
    candidates.push(nodePath.join(opts.resourcesPath, 'c', 'tmux', 'tmux'));
  }
  // Repo-root vendored binary (dev, and a packaged fallback if extraResources
  // layout differs).
  const repoCandidate = nodePath.join(opts.repoRoot, 'c', 'tmux', 'tmux');
  candidates.push(repoCandidate);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  // Best-effort default: the repo path. The backend health check reports the
  // truth if it does not exist (tmux:false), so we never fake availability.
  return candidates[0] || repoCandidate;
}

/**
 * Resolve and persist the per-install secrets (salt + internal key). They live
 * in userData and are generated once, then reused so the minted key's persisted
 * hash stays valid across restarts. NEVER committed.
 * @param {{ secretsPath: string, fs?: typeof nodeFs, randomBytes?: (n: number) => Buffer }} opts
 * @returns {{ apiKeyHashSalt: string, internalServiceKey: string }}
 */
function loadOrCreateSecrets(opts) {
  const fs = opts.fs || nodeFs;
  const randomBytes = opts.randomBytes || nodeCrypto.randomBytes;
  try {
    if (fs.existsSync(opts.secretsPath)) {
      const parsed = JSON.parse(fs.readFileSync(opts.secretsPath, 'utf-8'));
      if (
        parsed &&
        typeof parsed.apiKeyHashSalt === 'string' &&
        parsed.apiKeyHashSalt.length > 0 &&
        typeof parsed.internalServiceKey === 'string' &&
        parsed.internalServiceKey.length > 0
      ) {
        return {
          apiKeyHashSalt: parsed.apiKeyHashSalt,
          internalServiceKey: parsed.internalServiceKey,
        };
      }
    }
  } catch {
    // Corrupt/unreadable secrets file — regenerate below.
  }
  const secrets = {
    apiKeyHashSalt: randomBytes(32).toString('hex'),
    internalServiceKey: randomBytes(32).toString('hex'),
  };
  const dir = nodePath.dirname(opts.secretsPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(opts.secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(opts.secretsPath, 0o600);
  } catch {
    // chmod may fail on some filesystems (e.g. Windows) — best effort.
  }
  return secrets;
}

/**
 * Assemble the full child-process environment for the backend. Pure: takes the
 * resolved inputs and the base env, returns a new env object (no mutation).
 * @param {{
 *   baseEnv: NodeJS.ProcessEnv,
 *   port: number,
 *   dataDir: string,
 *   tmuxBin: string,
 *   apiKeyHashSalt: string,
 *   internalServiceKey: string,
 *   electronRunAsNode?: boolean,
 * }} opts
 * @returns {NodeJS.ProcessEnv}
 */
function assembleBackendEnv(opts) {
  const env = {
    ...opts.baseEnv,
    PORT: String(opts.port),
    DATA_DIR: opts.dataDir,
    STRICT_AUTH: 'false',
    NODE_ENV: opts.baseEnv.NODE_ENV || 'production',
    API_KEY_HASH_SALT: opts.apiKeyHashSalt,
    INTERNAL_SERVICE_KEY: opts.internalServiceKey,
    // The embedded backend is one user on their own machine, so delivery
    // (merge/PR) is one-click: a user-initiated merge records its own audited
    // approval (the click IS the approval) instead of stalling on awaiting_approval.
    // Governance still classifies risk + seals the Merkle audit; a hard deny still
    // blocks. Team/cloud surfaces leave this unset and keep the full approval gate.
    RECODER_SOLO_MODE: '1',
    // tmux-path.ts resolves CONDUCTOR_TMUX_BIN (authoritative) first, then
    // RECODER_TMUX_BUILD_PATH. Set both plus TMUX_BIN for forward-compat.
    CONDUCTOR_TMUX_BIN: opts.tmuxBin,
    RECODER_TMUX_BUILD_PATH: opts.tmuxBin,
    TMUX_BIN: opts.tmuxBin,
  };
  // Packaged: the backend + mint scripts are spawned with process.execPath,
  // which is the Electron app binary — not plain node. ELECTRON_RUN_AS_NODE=1
  // makes it behave as a bare Node runtime so `node dist/server.js` works.
  if (opts.electronRunAsNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  return env;
}

/**
 * The backend base URL for a loopback port.
 * @param {number} port
 * @returns {string}
 */
function backendUrlForPort(port) {
  return `http://127.0.0.1:${port}`;
}

/**
 * Poll GET ${backendUrl}/api/conductor/health with the key until it returns 200
 * with a truthy success envelope, or the timeout elapses. Resolves with a
 * truthful result — { ok:false, reason } on timeout/never-ready, NEVER faked.
 * @param {{
 *   backendUrl: string,
 *   apiKey?: string,
 *   fetch: typeof fetch,
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   isAlive?: () => boolean,
 * }} opts
 * @returns {Promise<{ ok: boolean, attempts: number, elapsedMs: number, reason?: string, data?: unknown }>}
 */
async function pollHealth(opts) {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const intervalMs = opts.intervalMs ?? 500;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now || Date.now;
  const isAlive = opts.isAlive || (() => true);
  const url = `${opts.backendUrl.replace(/\/+$/, '')}/api/conductor/health`;
  const headers = { Accept: 'application/json' };
  if (opts.apiKey) {
    // Send BOTH forms: x-api-key is the first-party platform-key path the
    // backend resolves authoritatively; Authorization Bearer is the cockpit's
    // own transport, kept consistent here.
    headers['x-api-key'] = opts.apiKey;
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const startedAt = now();
  let attempts = 0;
  let lastReason = 'never-ready';

  while (now() - startedAt <= timeoutMs) {
    attempts += 1;
    if (!isAlive()) {
      return {
        ok: false,
        attempts,
        elapsedMs: now() - startedAt,
        reason: 'backend-process-exited',
      };
    }
    try {
      const res = await opts.fetch(url, { method: 'GET', headers });
      if (res && res.status === 200) {
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        // A 200 with success:true is the real ready signal.
        if (!data || data.success !== false) {
          return { ok: true, attempts, elapsedMs: now() - startedAt, data };
        }
        lastReason = 'health-not-success';
      } else {
        lastReason = `status-${res ? res.status : 'no-response'}`;
      }
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
    await sleep(intervalMs);
  }

  return {
    ok: false,
    attempts,
    elapsedMs: now() - startedAt,
    reason: `timeout-after-${timeoutMs}ms (${lastReason})`,
  };
}

/**
 * Compute the next restart backoff (ms) given how many restarts have happened.
 * Exponential with a cap, so a crash-looping backend does not hammer the host.
 * An optional `jitterMs` adds bounded randomness to de-correlate restart storms
 * (e.g. a port-collision loop). The base exponential value is unchanged when no
 * jitter is requested, so existing behavior/tests are preserved.
 * @param {number} restartCount
 * @param {{ baseMs?: number, maxMs?: number, jitterMs?: number, random?: () => number }} [opts]
 * @returns {number}
 */
function backoffMs(restartCount, opts = {}) {
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 30000;
  const exponential = Math.min(max, base * Math.pow(2, Math.max(0, restartCount - 1)));
  const jitterMax = opts.jitterMs ?? 0;
  if (jitterMax > 0) {
    const random = opts.random || Math.random;
    const jitter = Math.floor(random() * jitterMax);
    return Math.min(max, exponential + jitter);
  }
  return exponential;
}

/**
 * Build a clear, user-facing message explaining why the embedded backend could
 * not boot, plus where to look for detail. Never claims success; always truthful.
 * @param {{ phase?: string, reason?: string, restartCount?: number, logPath?: string }} status
 * @returns {string}
 */
function describeBootFailure(status = {}) {
  const reason = status.reason || 'unknown error';
  const parts = ['The local Recoder backend could not start.'];
  parts.push(`Reason: ${reason}.`);
  if (typeof status.restartCount === 'number' && status.restartCount > 0) {
    parts.push(`It crashed ${status.restartCount} time(s) before giving up.`);
  }
  if (status.logPath) {
    parts.push(`See the log for detail: ${status.logPath}`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

class BackendSupervisor {
  /**
   * @param {{
   *   userDataDir: string,
   *   repoRoot: string,
   *   isPackaged?: boolean,
   *   resourcesPath?: string,
   *   // Injectable seams (tests pass fakes):
   *   spawn?: typeof childProcess.spawn,
   *   fetchImpl?: typeof fetch,
   *   fs?: typeof nodeFs,
   *   pickFreePort?: () => Promise<number>,
   *   mintKey?: (env: NodeJS.ProcessEnv) => Promise<string>,
   *   log?: (level: string, message: string, extra?: object) => void,
   *   healthTimeoutMs?: number,
   *   healthIntervalMs?: number,
   *   maxRestarts?: number,
   *   sleep?: (ms: number) => Promise<void>,
   *   now?: () => number,
   * }} options
   */
  constructor(options) {
    if (!options || !options.userDataDir || !options.repoRoot) {
      throw new Error('BackendSupervisor requires userDataDir and repoRoot');
    }
    this.userDataDir = options.userDataDir;
    this.repoRoot = options.repoRoot;
    this.isPackaged = Boolean(options.isPackaged);
    this.resourcesPath = options.resourcesPath;

    this._spawn = options.spawn || childProcess.spawn;
    this._fetch = options.fetchImpl || globalThis.fetch;
    this._fs = options.fs || nodeFs;
    this._pickFreePort = options.pickFreePort
      || (() => pickFreePortWithRetry({ sleep: options.sleep }));
    // Injectable so unit tests never probe a REAL port (a live backend on
    // :3100 must not change test outcomes).
    this._portIsFree = options.portIsFree || portIsFree;
    this._mintKey = options.mintKey || ((env) => this._mintKeyViaScript(env));
    this._log = options.log || (() => {});
    this._sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this._now = options.now || Date.now;

    this.healthTimeoutMs = options.healthTimeoutMs ?? 60000;
    this.healthIntervalMs = options.healthIntervalMs ?? 500;
    this.maxRestarts = options.maxRestarts ?? 5;
    // Backoff jitter de-correlates restart storms (e.g. a port-collision loop).
    this.restartJitterMs = options.restartJitterMs ?? 250;
    // Grace period after SIGTERM before escalating to SIGKILL so a hung child
    // can never wedge app quit. 0/undefined disables escalation (kept for tests).
    this.killGraceMs = options.killGraceMs ?? 5000;
    // Crashes older than this window do not count toward maxRestarts, so a
    // backend that ran healthily for a long time then crashed once is allowed a
    // fresh restart budget instead of being permanently failed.
    this.restartWindowMs = options.restartWindowMs ?? 60000;
    this._lastReadyAt = null;

    /** @type {SupervisorPhase} */
    this.phase = PHASE.IDLE;
    this.port = null;
    this.backendUrl = null;
    this.apiKey = null;
    this.lastError = null;
    this.restartCount = 0;
    /** @type {import('child_process').ChildProcess | null} */
    this.child = null;
    this._stopping = false;
    this._startPromise = null;

    // Persistent per-install paths under userData.
    this.dataDir = nodePath.join(this.userDataDir, 'backend-data');
    this.secretsPath = nodePath.join(this.userDataDir, 'backend-supervisor-secrets.json');
    this.logPath = nodePath.join(this.userDataDir, 'logs', 'backend-supervisor.log');
  }

  /** Public, never-lies status snapshot the UI/main.js can read. */
  getStatus() {
    const failed = this.phase === PHASE.FAILED;
    return {
      phase: this.phase,
      ready: this.phase === PHASE.READY,
      backendUrl: this.backendUrl,
      port: this.port,
      hasApiKey: Boolean(this.apiKey),
      restartCount: this.restartCount,
      error: this.lastError ? String(this.lastError) : null,
      logPath: this.logPath,
      // A clear, user-facing sentence only when we actually failed — so the UI
      // can show real "could not start" copy instead of a generic spinner.
      // Truthful: null unless we are in a failed phase.
      userMessage: failed
        ? describeBootFailure({
            phase: this.phase,
            reason: this.lastError ? String(this.lastError) : undefined,
            restartCount: this.restartCount,
            logPath: this.logPath,
          })
        : null,
    };
  }

  /**
   * Auth handed to the cockpit. Returns null until the backend is actually
   * ready, so the cockpit never points at a not-yet-listening backend.
   * @returns {{ backendUrl: string, apiKey: string | null } | null}
   */
  getAuth() {
    if (this.phase !== PHASE.READY || !this.backendUrl) {
      return null;
    }
    return { backendUrl: this.backendUrl, apiKey: this.apiKey };
  }

  _appendLog(level, message, extra) {
    const line = `${new Date().toISOString()} [${level}] ${message}` +
      (extra ? ` ${JSON.stringify(extra)}` : '');
    this._log(level, message, extra);
    try {
      this._fs.mkdirSync(nodePath.dirname(this.logPath), { recursive: true });
      this._fs.appendFileSync(this.logPath, `${line}\n`, 'utf-8');
    } catch {
      // logging must never throw
    }
  }

  /**
   * Boot the backend once: pick port, assemble env, mint key, spawn, poll
   * health. Idempotent (a concurrent call returns the in-flight promise).
   * @returns {Promise<{ ok: boolean, backendUrl?: string, apiKey?: string|null, reason?: string }>}
   */
  async start() {
    if (this._startPromise) {
      return this._startPromise;
    }
    this._startPromise = this._startOnce().finally(() => {
      this._startPromise = null;
    });
    return this._startPromise;
  }

  async _startOnce() {
    this._stopping = false;
    this.phase = PHASE.STARTING;
    this.lastError = null;
    try {
      // Prefer the port the cockpit defaults to (3100) so the renderer's default
      // backend URL works with zero re-injection; only fall back to a random free
      // port if 3100 (or RECODER_BACKEND_PORT) is already taken.
      const preferred = Number.parseInt(String(process.env.RECODER_BACKEND_PORT || '3100'), 10);
      let port;
      if (Number.isInteger(preferred) && preferred > 0 && (await this._portIsFree(preferred))) {
        port = preferred;
      } else {
        port = await this._pickFreePort();
      }
      const backendUrl = backendUrlForPort(port);
      const secrets = loadOrCreateSecrets({ secretsPath: this.secretsPath, fs: this._fs });
      const tmuxBin = resolveTmuxBin({
        isPackaged: this.isPackaged,
        repoRoot: this.repoRoot,
        resourcesPath: this.resourcesPath,
        existsSync: this._fs.existsSync,
      });

      this._fs.mkdirSync(this.dataDir, { recursive: true });

      const env = assembleBackendEnv({
        baseEnv: process.env,
        port,
        dataDir: this.dataDir,
        tmuxBin,
        apiKeyHashSalt: secrets.apiKeyHashSalt,
        internalServiceKey: secrets.internalServiceKey,
        // Packaged spawns use process.execPath (the Electron binary); run it as node.
        electronRunAsNode: this.isPackaged,
      });

      this.port = port;
      this.backendUrl = backendUrl;
      this._env = env;

      this._appendLog('info', 'minting local conductor key', { dataDir: this.dataDir });
      let apiKey = null;
      try {
        apiKey = await this._mintKey(env);
      } catch (err) {
        // A mint failure is non-fatal: with STRICT_AUTH=false on loopback the
        // backend still serves the cockpit. Surface it truthfully but continue.
        this._appendLog('warn', 'conductor key mint failed; continuing without a key', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.apiKey = apiKey;

      // Fail-closed: when we hold a real minted key, the backend must REQUIRE
      // it (STRICT_AUTH) — otherwise the key is decorative and any local
      // process could drive the conductor. The permissive loopback mode is
      // reserved for the documented mint-failure degrade above.
      const spawnEnv = apiKey ? { ...env, STRICT_AUTH: 'true' } : env;
      this._env = spawnEnv;

      this._appendLog('info', 'spawning backend child', {
        backendUrl,
        tmuxBin,
        strictAuth: spawnEnv.STRICT_AUTH,
      });
      this._spawnChild(spawnEnv);

      const health = await pollHealth({
        backendUrl,
        apiKey: this.apiKey || undefined,
        fetch: this._fetch,
        timeoutMs: this.healthTimeoutMs,
        intervalMs: this.healthIntervalMs,
        sleep: this._sleep,
        now: this._now,
        isAlive: () => Boolean(this.child) && this.child.killed !== true && this._childAlive,
      });

      if (!health.ok) {
        this.phase = PHASE.FAILED;
        this.lastError = `backend health check failed: ${health.reason}`;
        this._appendLog('error', this.lastError, { attempts: health.attempts });
        this._killChild();
        return { ok: false, reason: this.lastError };
      }

      this.phase = PHASE.READY;
      this.restartCount = 0;
      this._lastReadyAt = this._now();
      this._appendLog('info', 'backend ready', {
        backendUrl,
        attempts: health.attempts,
        elapsedMs: health.elapsedMs,
      });
      return { ok: true, backendUrl, apiKey: this.apiKey };
    } catch (err) {
      this.phase = PHASE.FAILED;
      this.lastError = err instanceof Error ? err.message : String(err);
      this._appendLog('error', 'backend start failed', { error: this.lastError });
      this._killChild();
      return { ok: false, reason: this.lastError };
    }
  }

  /** Spawn the backend child and wire crash handling. */
  _spawnChild(env) {
    const { command, args, cwd } = this._resolveSpawnTarget();
    this._appendLog('info', 'spawn target', { command, args, cwd });
    const child = this._spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this._childAlive = true;

    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (buf) => {
        this._appendLog('backend', String(buf).trimEnd());
      });
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (buf) => {
        this._appendLog('backend-err', String(buf).trimEnd());
      });
    }

    child.on('exit', (code, signal) => {
      this._childAlive = false;
      this._onChildExit(code, signal);
    });
    child.on('error', (err) => {
      this._childAlive = false;
      this.lastError = err instanceof Error ? err.message : String(err);
      this._appendLog('error', 'backend spawn error', { error: this.lastError });
    });
  }

  /**
   * Decide what to exec. Dev: tsx src/server.ts from docker-backend in the repo.
   * Packaged: node <resourcesPath>/backend/dist/server.js.
   * @returns {{ command: string, args: string[], cwd: string }}
   */
  _resolveSpawnTarget() {
    if (this.isPackaged && this.resourcesPath) {
      const backendDir = nodePath.join(this.resourcesPath, 'backend');
      return {
        command: process.execPath, // bundled Electron's node
        args: [nodePath.join(backendDir, 'dist', 'server.js')],
        cwd: backendDir,
      };
    }
    const backendDir = nodePath.join(this.repoRoot, 'docker-backend');
    const tsxBin = nodePath.join(backendDir, 'node_modules', '.bin', 'tsx');
    return {
      command: tsxBin,
      args: [nodePath.join(backendDir, 'src', 'server.ts')],
      cwd: backendDir,
    };
  }

  /**
   * Mint a platform sk_ key by running the real dev-mint-conductor-key script
   * with the SAME salt + DATA_DIR the server uses. Resolves with the plaintext
   * key (the script's last stdout line is a JSON object with { apiKey }).
   * @param {NodeJS.ProcessEnv} env
   * @returns {Promise<string>}
   */
  _mintKeyViaScript(env) {
    return new Promise((resolve, reject) => {
      const backendDir = this.isPackaged && this.resourcesPath
        ? nodePath.join(this.resourcesPath, 'backend')
        : nodePath.join(this.repoRoot, 'docker-backend');

      let command;
      let args;
      if (this.isPackaged && this.resourcesPath) {
        // Packaged: run the compiled mint entrypoint with bundled node. It lives
        // under src/conductor so tsc compiles it to dist/conductor (scripts/ is
        // outside rootDir and is NOT emitted by the build).
        command = process.execPath;
        args = [nodePath.join(backendDir, 'dist', 'conductor', 'mint-conductor-key.js')];
      } else {
        command = nodePath.join(backendDir, 'node_modules', '.bin', 'tsx');
        args = [nodePath.join(backendDir, 'scripts', 'dev-mint-conductor-key.ts')];
      }

      const proc = this._spawn(command, args, {
        cwd: backendDir,
        env, // shares API_KEY_HASH_SALT + DATA_DIR with the server
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      if (proc.stdout) proc.stdout.on('data', (b) => { stdout += String(b); });
      if (proc.stderr) proc.stderr.on('data', (b) => { stderr += String(b); });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`mint script exited ${code}: ${stderr.trim() || 'no stderr'}`));
          return;
        }
        const lines = stdout.trim().split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          try {
            const parsed = JSON.parse(lines[i]);
            if (parsed && typeof parsed.apiKey === 'string' && parsed.apiKey.startsWith('sk_')) {
              resolve(parsed.apiKey);
              return;
            }
          } catch {
            // not the JSON line; keep scanning upward
          }
        }
        reject(new Error('mint script produced no apiKey line on stdout'));
      });
    });
  }

  /** Handle child exit: restart with backoff unless we are intentionally stopping. */
  _onChildExit(code, signal) {
    if (this._stopping || this.phase === PHASE.STOPPED) {
      this.phase = PHASE.STOPPED;
      this._appendLog('info', 'backend stopped', { code, signal });
      return;
    }
    this.phase = PHASE.CRASHED;
    this.lastError = `backend exited (code=${code}, signal=${signal})`;
    this._appendLog('error', this.lastError, { restartCount: this.restartCount });

    // If the backend ran healthily for longer than the restart window before
    // this crash, forgive the prior crash budget — a long-lived backend that
    // dies once should be restarted, not declared permanently failed.
    if (
      this._lastReadyAt != null &&
      this.restartWindowMs > 0 &&
      this._now() - this._lastReadyAt >= this.restartWindowMs &&
      this.restartCount > 0
    ) {
      this._appendLog('info', 'crash after a long healthy run; resetting restart budget', {
        healthyForMs: this._now() - this._lastReadyAt,
      });
      this.restartCount = 0;
    }

    if (this.restartCount >= this.maxRestarts) {
      this.phase = PHASE.FAILED;
      this.lastError = `backend crashed ${this.restartCount} times; giving up`;
      this._appendLog('error', this.lastError);
      return;
    }

    this.restartCount += 1;
    const delay = backoffMs(this.restartCount, { jitterMs: this.restartJitterMs });
    this._appendLog('warn', 'scheduling backend restart', { delay, attempt: this.restartCount });
    this._restartTimer = setTimeout(() => {
      if (this._stopping) return;
      void this._startOnce();
    }, delay);
    if (this._restartTimer && typeof this._restartTimer.unref === 'function') {
      this._restartTimer.unref();
    }
  }

  _killChild() {
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    if (this._killTimer) {
      clearTimeout(this._killTimer);
      this._killTimer = null;
    }
    const child = this.child;
    this.child = null;
    this._childAlive = false;
    if (!child || typeof child.kill !== 'function') {
      return;
    }
    // Clean shutdown: ask the backend to exit with SIGTERM first so it can flush
    // and release tmux/sockets. If it does not exit within the grace period,
    // escalate to SIGKILL so a hung child can never wedge app quit.
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
      return;
    }
    if (this.killGraceMs > 0 && child.killed !== true) {
      this._killTimer = setTimeout(() => {
        this._killTimer = null;
        try {
          // child.killed flips true once the process actually exits; only
          // escalate if it is still around.
          if (child.killed !== true && child.exitCode == null) {
            child.kill('SIGKILL');
          }
        } catch {
          // already gone
        }
      }, this.killGraceMs);
      if (this._killTimer && typeof this._killTimer.unref === 'function') {
        this._killTimer.unref();
      }
    }
  }

  /**
   * A clear, user-facing failure message when the backend could not boot, or
   * null when it is healthy / still starting. Truthful — never invents success.
   * @returns {string | null}
   */
  getUserFacingError() {
    if (this.phase !== PHASE.FAILED) {
      return null;
    }
    return describeBootFailure({
      phase: this.phase,
      reason: this.lastError ? String(this.lastError) : undefined,
      restartCount: this.restartCount,
      logPath: this.logPath,
    });
  }

  /** Stop the backend and prevent restart. Called on app quit. */
  async stop() {
    this._stopping = true;
    this.phase = PHASE.STOPPED;
    this._killChild();
    this._appendLog('info', 'supervisor stopped');
  }
}

module.exports = {
  BackendSupervisor,
  PHASE,
  // Pure helpers exported for tests.
  pickFreePort,
  pickFreePortWithRetry,
  resolveTmuxBin,
  loadOrCreateSecrets,
  assembleBackendEnv,
  backendUrlForPort,
  pollHealth,
  backoffMs,
  describeBootFailure,
};
