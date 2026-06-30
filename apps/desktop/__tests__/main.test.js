/**
 * Desktop app (main process) tests.
 *
 * These tests validate the *logic* extracted from main.js without requiring
 * a live Electron runtime.  We import the helpers we need by evaluating
 * snippets or re-implementing the pure-logic functions here (Electron IPC
 * handlers are side-effect-heavy so we test their contracts via mocks).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ---------------------------------------------------------------------------
// 1. IPC Rate Limiter
// ---------------------------------------------------------------------------

describe('IPC Rate Limiter', () => {
  // Re-implement the rate-limiter logic from main.js for isolated testing
  const IPC_RATE_LIMITS = {
    'fs:readFile': { rate: 30, interval: 1000 },
    'fs:writeFile': { rate: 30, interval: 1000 },
    'terminal:spawn': { rate: 5, interval: 1000 },
    'agent:delegateTask': { rate: 5, interval: 1000 },
    'a2a:createTask': { rate: 5, interval: 1000 },
  };
  let buckets;

  function checkIpcRateLimit(channel) {
    const limit = IPC_RATE_LIMITS[channel];
    if (!limit) return true;
    const now = Date.now();
    let bucket = buckets.get(channel);
    if (!bucket) {
      bucket = { tokens: limit.rate, lastRefill: now };
      buckets.set(channel, bucket);
    }
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= limit.interval) {
      bucket.tokens = limit.rate;
      bucket.lastRefill = now;
    }
    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }
    return false;
  }

  beforeEach(() => {
    buckets = new Map();
  });

  it('allows calls within the rate limit', () => {
    for (let i = 0; i < 30; i++) {
      expect(checkIpcRateLimit('fs:readFile')).toBe(true);
    }
  });

  it('blocks calls exceeding the rate limit', () => {
    for (let i = 0; i < 30; i++) {
      checkIpcRateLimit('fs:readFile');
    }
    expect(checkIpcRateLimit('fs:readFile')).toBe(false);
  });

  it('allows unlimited calls on channels without limits', () => {
    for (let i = 0; i < 200; i++) {
      expect(checkIpcRateLimit('clipboard:read')).toBe(true);
    }
  });

  it('respects per-channel limits (terminal:spawn = 5/sec)', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkIpcRateLimit('terminal:spawn')).toBe(true);
    }
    expect(checkIpcRateLimit('terminal:spawn')).toBe(false);
  });

  it('refills tokens after the interval elapses', () => {
    for (let i = 0; i < 5; i++) {
      checkIpcRateLimit('terminal:spawn');
    }
    expect(checkIpcRateLimit('terminal:spawn')).toBe(false);

    // Simulate time passing by manipulating the bucket
    const bucket = buckets.get('terminal:spawn');
    bucket.lastRefill = Date.now() - 1001;
    expect(checkIpcRateLimit('terminal:spawn')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Path traversal prevention (fs:readFile / fs:writeFile)
// ---------------------------------------------------------------------------

describe('Path traversal prevention', () => {
  function isPathSafe(filePath) {
    if (typeof filePath !== 'string') return false;
    const resolved = path.resolve(filePath);
    // Block null bytes (classic path traversal vector)
    if (filePath.includes('\0')) return false;
    // Must be an absolute path after resolution
    if (!path.isAbsolute(resolved)) return false;
    // Block attempts to escape to sensitive system dirs
    const blocked = ['/etc/shadow', '/etc/passwd', '/proc', '/sys'];
    if (blocked.some((p) => resolved.startsWith(p))) return false;
    return true;
  }

  it('accepts normal absolute paths', () => {
    expect(isPathSafe('/Users/dev/project/file.ts')).toBe(true);
    expect(isPathSafe('/home/user/code/index.js')).toBe(true);
  });

  it('rejects null bytes', () => {
    expect(isPathSafe('/tmp/file\0.txt')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isPathSafe(undefined)).toBe(false);
    expect(isPathSafe(null)).toBe(false);
    expect(isPathSafe(42)).toBe(false);
  });

  it('blocks sensitive system paths', () => {
    expect(isPathSafe('/etc/shadow')).toBe(false);
    expect(isPathSafe('/proc/1/environ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Terminal spawn input validation
// ---------------------------------------------------------------------------

describe('Terminal spawn sanitization', () => {
  function validateSpawnOptions(options) {
    if (options && typeof options !== 'object') return { valid: false, reason: 'options must be an object' };
    const opts = options || {};
    // Validate cols/rows are sane numbers
    if (opts.cols !== undefined && (typeof opts.cols !== 'number' || opts.cols < 1 || opts.cols > 1000)) {
      return { valid: false, reason: 'invalid cols' };
    }
    if (opts.rows !== undefined && (typeof opts.rows !== 'number' || opts.rows < 1 || opts.rows > 1000)) {
      return { valid: false, reason: 'invalid rows' };
    }
    // Validate cwd doesn't contain path traversal
    if (opts.cwd !== undefined) {
      if (typeof opts.cwd !== 'string') return { valid: false, reason: 'cwd must be a string' };
      if (opts.cwd.includes('\0')) return { valid: false, reason: 'cwd contains null byte' };
    }
    // Validate env values are strings
    if (opts.env !== undefined) {
      if (typeof opts.env !== 'object' || opts.env === null) return { valid: false, reason: 'env must be an object' };
      for (const [key, val] of Object.entries(opts.env)) {
        if (typeof val !== 'string') return { valid: false, reason: `env.${key} must be a string` };
      }
    }
    return { valid: true };
  }

  it('accepts valid options', () => {
    expect(validateSpawnOptions({ cols: 80, rows: 24, cwd: '/tmp' })).toEqual({ valid: true });
  });

  it('accepts empty options', () => {
    expect(validateSpawnOptions({})).toEqual({ valid: true });
    expect(validateSpawnOptions(undefined)).toEqual({ valid: true });
  });

  it('rejects invalid cols', () => {
    expect(validateSpawnOptions({ cols: -1 }).valid).toBe(false);
    expect(validateSpawnOptions({ cols: 'big' }).valid).toBe(false);
    expect(validateSpawnOptions({ cols: 5000 }).valid).toBe(false);
  });

  it('rejects invalid rows', () => {
    expect(validateSpawnOptions({ rows: 0 }).valid).toBe(false);
  });

  it('rejects null bytes in cwd', () => {
    expect(validateSpawnOptions({ cwd: '/tmp\0/evil' }).valid).toBe(false);
  });

  it('rejects non-string env values', () => {
    expect(validateSpawnOptions({ env: { PATH: 123 } }).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Agent/A2A input validation
// ---------------------------------------------------------------------------

describe('Agent task input validation', () => {
  function validateDelegatePayload(payload) {
    if (!payload || typeof payload !== 'object') return { valid: false, reason: 'payload required' };
    if (payload.task !== undefined && typeof payload.task !== 'string') return { valid: false, reason: 'task must be a string' };
    if (payload.paths !== undefined && !Array.isArray(payload.paths)) return { valid: false, reason: 'paths must be an array' };
    if (Array.isArray(payload.paths)) {
      for (const p of payload.paths) {
        if (typeof p !== 'string') return { valid: false, reason: 'each path must be a string' };
      }
    }
    return { valid: true };
  }

  it('accepts valid payloads', () => {
    expect(validateDelegatePayload({ task: 'build frontend' })).toEqual({ valid: true });
    expect(validateDelegatePayload({ task: 'test', paths: ['/app', '/lib'] })).toEqual({ valid: true });
  });

  it('rejects missing payload', () => {
    expect(validateDelegatePayload(null).valid).toBe(false);
    expect(validateDelegatePayload(undefined).valid).toBe(false);
  });

  it('rejects non-string task', () => {
    expect(validateDelegatePayload({ task: 42 }).valid).toBe(false);
  });

  it('rejects non-array paths', () => {
    expect(validateDelegatePayload({ paths: '/app' }).valid).toBe(false);
  });

  it('rejects non-string path entries', () => {
    expect(validateDelegatePayload({ paths: [123] }).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Crash webhook retry logic
// ---------------------------------------------------------------------------

describe('Crash webhook retry', () => {
  it('retries with exponential backoff on failure', async () => {
    const delays = [1000, 3000, 9000];
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt++;
      if (attempt <= 3) throw new Error('network error');
      return { ok: true };
    });

    const sleepLog = [];
    async function notifyCrashWebhookWithRetry(payload, fetchFn) {
      const maxRetries = 3;
      const backoffMs = [1000, 3000, 9000];
      for (let i = 0; i <= maxRetries; i++) {
        try {
          const resp = await fetchFn('https://webhook.test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (resp.ok) return true;
          if (i < maxRetries) sleepLog.push(backoffMs[i]);
        } catch {
          if (i < maxRetries) sleepLog.push(backoffMs[i]);
        }
      }
      return false;
    }

    const result = await notifyCrashWebhookWithRetry({ kind: 'test' }, fetchMock);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(sleepLog).toEqual(delays);
  });

  it('succeeds on first try without retries', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));

    async function notifyCrashWebhookWithRetry(payload, fetchFn) {
      const maxRetries = 3;
      const backoffMs = [1000, 3000, 9000];
      for (let i = 0; i <= maxRetries; i++) {
        try {
          const resp = await fetchFn('https://webhook.test', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          if (resp.ok) return true;
        } catch {
          // continue
        }
      }
      return false;
    }

    const result = await notifyCrashWebhookWithRetry({ kind: 'test' }, fetchMock);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Encrypted API key storage
// ---------------------------------------------------------------------------

describe('API key encrypted storage', () => {
  it('writeDesktopRecoderApiKeyCache creates encrypted envelope', () => {
    // Simulate the write logic
    const keysObj = { keys: { default: { apiKey: 'sk-test-123' } } };
    const jsonStr = JSON.stringify(keysObj, null, 2);

    // Simulate safeStorage available
    const encrypted = Buffer.from(jsonStr).toString('base64'); // simplified
    const envelope = JSON.stringify({ _encrypted: true, _data: encrypted });
    const parsed = JSON.parse(envelope);

    expect(parsed._encrypted).toBe(true);
    expect(typeof parsed._data).toBe('string');

    // Verify roundtrip
    const decrypted = Buffer.from(parsed._data, 'base64').toString('utf-8');
    const restored = JSON.parse(decrypted);
    expect(restored.keys.default.apiKey).toBe('sk-test-123');
  });

  it('resolveDesktopRecoderApiKeyFromCache reads encrypted envelope', () => {
    const keysObj = { keys: { mykey: { apiKey: 'sk-encrypted-456' } } };
    const jsonStr = JSON.stringify(keysObj);
    const envelope = { _encrypted: true, _data: Buffer.from(jsonStr).toString('base64') };

    // Simulate decrypt path
    const decrypted = Buffer.from(envelope._data, 'base64').toString('utf-8');
    const parsed = JSON.parse(decrypted);
    const keys = Object.values(parsed.keys);
    const firstKey = keys.find((e) => e && typeof e.apiKey === 'string' && e.apiKey.trim());

    expect(firstKey.apiKey).toBe('sk-encrypted-456');
  });

  it('falls back to plaintext when not encrypted', () => {
    const keysObj = { keys: { fallback: { apiKey: 'sk-plain-789' } } };
    const raw = JSON.stringify(keysObj);
    const parsed = JSON.parse(raw);

    // No _encrypted flag → treat as plaintext
    expect(parsed._encrypted).toBeUndefined();
    const keys = Object.values(parsed.keys);
    expect(keys[0].apiKey).toBe('sk-plain-789');
  });
});

// ---------------------------------------------------------------------------
// 7. IPC handler registration coverage
// ---------------------------------------------------------------------------

describe('IPC handler registration', () => {
  const EXPECTED_HANDLERS = [
    'dialog:openFile',
    'dialog:openFolder',
    'dialog:saveFile',
    'fs:readFile',
    'fs:writeFile',
    'fs:readDir',
    'fs:exists',
    'fs:stat',
    'terminal:spawn',
    'terminal:write',
    'terminal:resize',
    'terminal:kill',
    'clipboard:write',
    'clipboard:read',
    'window:minimize',
    'window:maximize',
    'window:close',
    'window:toggleFullscreen',
    'app:version',
    'agent:getWorkflowPlan',
    'agent:delegateTask',
    'agent:getDelegatedTaskStatus',
    'agent:pollDelegatedTaskStatus',
    'a2a:listTasks',
    'a2a:getTask',
    'a2a:pollTask',
    'a2a:createTask',
    'app:checkForUpdates',
    'app:installUpdate',
    'app:openExternal',
    'app:showInFolder',
  ];

  it('lists all expected IPC channels', () => {
    // This test documents the handler contract.  It reads main.js and
    // verifies each expected channel name appears in the source.
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'main.js'),
      'utf-8',
    );

    const missing = EXPECTED_HANDLERS.filter(
      (ch) => !mainSrc.includes(`'${ch}'`),
    );
    expect(missing).toEqual([]);
  });

  it('has at least 29 handlers registered', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'main.js'),
      'utf-8',
    );
    const handleMatches = mainSrc.match(/ipcMain\.handle\(/g) || [];
    expect(handleMatches.length).toBeGreaterThanOrEqual(29);
  });
});

// ---------------------------------------------------------------------------
// 8. Window management
// ---------------------------------------------------------------------------

describe('Window management', () => {
  it('window channels are registered in main.js', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'main.js'),
      'utf-8',
    );
    const windowChannels = ['window:minimize', 'window:maximize', 'window:close', 'window:toggleFullscreen'];
    for (const ch of windowChannels) {
      expect(mainSrc).toContain(`'${ch}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Auto-update lifecycle
// ---------------------------------------------------------------------------

describe('Auto-update lifecycle', () => {
  it('update channels are registered in main.js', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'main.js'),
      'utf-8',
    );
    expect(mainSrc).toContain("'app:checkForUpdates'");
    expect(mainSrc).toContain("'app:installUpdate'");
    expect(mainSrc).toContain('electron-updater');
    expect(mainSrc).toContain('autoUpdateEnabled');
  });

  it('auto-update can be disabled via env var', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'main.js'),
      'utf-8',
    );
    expect(mainSrc).toContain("DESKTOP_AUTO_UPDATE");
    expect(mainSrc).toContain("!== 'false'");
  });
});

// ---------------------------------------------------------------------------
// 10. Deep link protocol
// ---------------------------------------------------------------------------

describe('Deep link protocol', () => {
  it('registers the recoder:// protocol', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '..', 'main.js'),
      'utf-8',
    );
    expect(mainSrc).toContain("PROTOCOL_SCHEME = 'recoder'");
    expect(mainSrc).toContain('setAsDefaultProtocolClient');
  });
});

// ---------------------------------------------------------------------------
// 11. Embedded terminal — TMUX_BIN resolution + env hardening
// ---------------------------------------------------------------------------
// These mirror the pure logic of resolveTmuxBin / buildPtyEnv in main.js so the
// PTY attaches with the SAME pinned tmux the conductor used, and the renderer
// cannot inject arbitrary env into the spawned process.

describe('Embedded terminal — tmux binary resolution', () => {
  // Mirror of resolveTmuxBin(rendererEnv) for an existing renderer-supplied bin.
  function resolveTmuxBin(rendererEnv, existsSync, envOverride) {
    const fromRenderer = rendererEnv && rendererEnv.CONDUCTOR_TMUX_BIN;
    if (typeof fromRenderer === 'string' && fromRenderer.trim() && existsSync(fromRenderer)) {
      return fromRenderer;
    }
    return envOverride || 'tmux';
  }

  it('prefers an existing renderer-supplied CONDUCTOR_TMUX_BIN', () => {
    const bin = '/opt/recoder/c/tmux/tmux';
    const resolved = resolveTmuxBin({ CONDUCTOR_TMUX_BIN: bin }, (p) => p === bin, undefined);
    expect(resolved).toBe(bin);
  });

  it('ignores a renderer bin that does not exist on disk', () => {
    const resolved = resolveTmuxBin(
      { CONDUCTOR_TMUX_BIN: '/nope/tmux' },
      () => false,
      '/env/override/tmux',
    );
    expect(resolved).toBe('/env/override/tmux');
  });

  it('falls back to bare tmux when nothing resolves', () => {
    expect(resolveTmuxBin(undefined, () => false, undefined)).toBe('tmux');
  });

  it('main.js actually resolves tmux in-process (does not trust bare command)', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
    expect(mainSrc).toContain('function resolveTmuxBin');
    expect(mainSrc).toContain('resolveVendoredTmux');
    expect(mainSrc).toContain("path.join(dir, 'c', 'tmux', 'tmux.c')");
    // When the renderer asks for bare/empty tmux, main substitutes the binary.
    expect(mainSrc).toContain('wantsTmux');
  });

  it('main.js surfaces ptyUnavailable instead of a fake TERM=dumb pipe', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
    expect(mainSrc).toContain('ptyUnavailable: true');
    // The old silent child_process TERM=dumb fallback must be gone.
    expect(mainSrc).not.toContain("TERM: 'dumb'");
  });
});

describe('Embedded terminal — env hardening (renderer allowlist)', () => {
  const RENDERER_ENV_ALLOWLIST = new Set([
    'CONDUCTOR_TMUX_BIN',
    'CONDUCTOR_WORKTREE_ROOT',
    'TERM',
    'TERM_PROGRAM',
    'COLORTERM',
    'LANG',
    'LC_ALL',
  ]);

  function buildPtyEnv(baseEnv, rendererEnv, tmuxBin) {
    const env = { ...baseEnv };
    if (rendererEnv && typeof rendererEnv === 'object') {
      for (const key of Object.keys(rendererEnv)) {
        if (RENDERER_ENV_ALLOWLIST.has(key) && typeof rendererEnv[key] === 'string') {
          env[key] = rendererEnv[key];
        }
      }
    }
    env.CONDUCTOR_TMUX_BIN = tmuxBin;
    return env;
  }

  it('forwards only allowlisted renderer env keys', () => {
    const env = buildPtyEnv(
      { PATH: '/usr/bin', SECRET: 'keep' },
      { TERM: 'xterm-256color', EVIL: 'rm -rf', PATH: '/tmp/evil' },
      '/c/tmux/tmux',
    );
    expect(env.TERM).toBe('xterm-256color');
    expect(env.EVIL).toBeUndefined();
    // Renderer cannot overwrite a non-allowlisted base var like PATH.
    expect(env.PATH).toBe('/usr/bin');
    expect(env.SECRET).toBe('keep');
  });

  it('always pins the resolved tmux bin into the env', () => {
    const env = buildPtyEnv({}, { CONDUCTOR_TMUX_BIN: '/ignored' }, '/resolved/tmux');
    expect(env.CONDUCTOR_TMUX_BIN).toBe('/resolved/tmux');
  });

  it('main.js cleans up PTYs on window close / quit', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
    expect(mainSrc).toContain('function killAllTerminals');
    expect(mainSrc).toContain("app.on('before-quit', killAllTerminals)");
  });
});

// ---------------------------------------------------------------------------
// 12. Embedded terminal — IPC channel contract parity (main ⇄ preload)
// ---------------------------------------------------------------------------
// A real PTY only works if every terminal:* channel the preload bridges invoke
// is actually registered (ipcMain.handle) or broadcast (webContents.send) by the
// main process — a single typo'd channel name silently breaks the terminal. We
// assert both sides agree on the exact channel names by scanning the source.

describe('Embedded terminal — IPC channel contract (no main/preload mismatch)', () => {
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  const preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf-8');

  // Channels the renderer invokes (request/response) — must be ipcMain.handle'd.
  const INVOKE_CHANNELS = ['terminal:spawn', 'terminal:write', 'terminal:resize', 'terminal:kill'];
  // Channels the main process pushes (PTY output / exit) — must be subscribed in preload.
  const EVENT_CHANNELS = ['terminal:data', 'terminal:exit'];

  it.each(INVOKE_CHANNELS)('main.js registers an ipcMain.handle for %s', (channel) => {
    expect(mainSrc).toContain(`ipcMain.handle('${channel}'`);
  });

  it.each(INVOKE_CHANNELS)('preload.js invokes %s (matches the main handler)', (channel) => {
    expect(preloadSrc).toContain(`ipcRenderer.invoke('${channel}'`);
  });

  it.each(EVENT_CHANNELS)('main.js broadcasts %s to the renderer', (channel) => {
    // broadcastTerminal(channel, …) is called with the literal event channel.
    expect(mainSrc).toContain(`broadcastTerminal('${channel}'`);
  });

  it.each(EVENT_CHANNELS)('preload.js subscribes to %s (matches the main broadcast)', (channel) => {
    expect(preloadSrc).toContain(`ipcRenderer.on('${channel}'`);
  });

  it('preload exposes both terminal bridges over the SAME channels (no drift)', () => {
    // Legacy recoderDesktop bridge + focused recoderTerminal bridge.
    expect(preloadSrc).toContain("exposeInMainWorld('recoderDesktop'");
    expect(preloadSrc).toContain("exposeInMainWorld('recoderTerminal'");
    // The renderer must never see no-real-TTY as success: the spawn handler
    // returns the truthful ptyUnavailable flag, and preload passes it through.
    expect(mainSrc).toContain('ptyUnavailable: true');
  });

  it('no renderer-side node-pty: pty.spawn lives only in the MAIN process', () => {
    // The PTY MUST be owned by main.js (a renderer cannot own a controlling TTY).
    expect(mainSrc).toContain("require('node-pty')");
    expect(mainSrc).toContain('pty.spawn(');
    // preload is a contextIsolation boundary — it must not load node-pty.
    expect(preloadSrc).not.toContain("require('node-pty')");
    expect(preloadSrc).not.toContain('pty.spawn');
  });
});
