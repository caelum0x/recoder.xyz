#!/usr/bin/env node
/**
 * dev-boot-proof.js
 *
 * Headless end-to-end proof that the desktop BackendSupervisor genuinely boots
 * the embedded docker-backend (tmux + the engines host), mints a real platform
 * key, and that GET /api/conductor/health returns 200 with the substrate shape
 * { available, git, tmux, tmuxBin }.
 *
 * This is the DEV path (isPackaged:false): it runs `tsx src/server.ts` from the
 * repo docker-backend exactly as the packaged app would run dist/server.js, and
 * mints via the real dev-mint-conductor-key script — no Electron runtime needed.
 *
 * Prints the real HTTP status + body, then stops the supervisor cleanly.
 * Exits 0 on a real 200 health, non-zero otherwise. NEVER fakes readiness.
 */
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { BackendSupervisor } = require('../backend-supervisor');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoder-desktop-bootproof-'));

async function main() {
  const supervisor = new BackendSupervisor({
    userDataDir,
    repoRoot,
    isPackaged: false,
    healthTimeoutMs: 90000,
    healthIntervalMs: 750,
    maxRestarts: 0,
    log: (level, message, extra) => {
      process.stderr.write(`[supervisor:${level}] ${message}` + (extra ? ` ${JSON.stringify(extra)}` : '') + '\n');
    },
  });

  const result = await supervisor.start();
  process.stderr.write(`[boot-proof] start result: ${JSON.stringify({ ok: result.ok, reason: result.reason })}\n`);

  if (!result.ok) {
    await supervisor.stop();
    process.stderr.write('[boot-proof] FAILED: supervisor did not reach READY\n');
    process.exit(1);
  }

  const auth = supervisor.getAuth();
  const url = `${auth.backendUrl}/api/conductor/health`;
  const headers = { Accept: 'application/json' };
  if (auth.apiKey) {
    headers['x-api-key'] = auth.apiKey;
    headers.Authorization = `Bearer ${auth.apiKey}`;
  }

  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();

  // Emit the load-bearing proof on stdout (single clean block).
  process.stdout.write(`HTTP_CODE=${res.status}\n`);
  process.stdout.write(`URL=${url}\n`);
  process.stdout.write(`HAS_API_KEY=${Boolean(auth.apiKey)}\n`);
  process.stdout.write(`BODY=${bodyText}\n`);

  let ok = res.status === 200;
  try {
    const json = JSON.parse(bodyText);
    const data = json && json.data ? json.data : json;
    const hasShape = data
      && typeof data.available === 'boolean'
      && typeof data.git === 'boolean'
      && typeof data.tmux === 'boolean'
      && typeof data.tmuxBin === 'string';
    process.stdout.write(`HEALTH_SHAPE_OK=${hasShape}\n`);
    ok = ok && hasShape;
  } catch (e) {
    process.stdout.write(`HEALTH_SHAPE_OK=false (parse: ${e.message})\n`);
    ok = false;
  }

  await supervisor.stop();
  process.stderr.write('[boot-proof] supervisor stopped cleanly\n');

  // Best-effort cleanup of the temp userData dir.
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }

  process.exit(ok ? 0 : 2);
}

main().catch(async (err) => {
  process.stderr.write(`[boot-proof] ERROR: ${err && err.stack ? err.stack : String(err)}\n`);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(3);
});
