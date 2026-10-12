#!/usr/bin/env node
/**
 * Resandbox orchestrator — a self-hosted sandbox control plane that speaks the
 * E2B-compatible REST the backend `resandbox.adapter` calls, backed by local
 * Docker containers. Zero npm dependencies (node:http + docker CLI).
 *
 * This is what `RESANDBOX_BASE_URL` points at. Each sandbox is one container
 * (`resandbox-<id>`) kept alive with `sleep infinity`; exec runs inside it.
 *
 * Endpoints (match the adapter):
 *   GET    /health                 -> 200
 *   POST   /sandboxes              {templateID, envVars, metadata} -> {sandboxID, url}
 *   GET    /sandboxes/:id          -> {state: running|stopped|paused|error}
 *   DELETE /sandboxes/:id          -> 204 (idempotent)
 *   POST   /sandboxes/:id/exec     {cmd, cwd, envs} -> {exitCode, stdout, stderr, timedOut}
 *
 * Run:  node server.mjs            (PORT env, default 7450; requires Docker)
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || process.env.RESANDBOX_PORT || 7450);
const DEFAULT_IMAGE = process.env.RESANDBOX_DEFAULT_IMAGE || 'node:22-bookworm-slim';
const NAME_PREFIX = 'resandbox-';

/** templateID 'base'/empty -> the default image; otherwise the templateID IS the image. */
function imageFor(templateID) {
  return !templateID || templateID === 'base' ? DEFAULT_IMAGE : String(templateID);
}

function docker(args, { timeoutMs = 30000, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile('docker', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const timedOut = Boolean(error && error.killed && error.signal === 'SIGTERM');
      const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
      resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '', timedOut });
    });
    if (input && child.stdin) {
      child.stdin.end(input);
    }
  });
}

function envArgs(env) {
  const out = [];
  for (const [k, v] of Object.entries(env || {})) out.push('-e', `${k}=${v}`);
  return out;
}

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

async function provision(req, res) {
  const body = await readJson(req);
  const id = randomUUID();
  const name = NAME_PREFIX + id;
  const args = ['run', '-d', '--name', name, '--label', 'resandbox=1', ...envArgs(body.envVars), imageFor(body.templateID), 'sleep', 'infinity'];
  const r = await docker(args, { timeoutMs: 60000 });
  if (r.code !== 0) {
    return send(res, 502, { error: 'provision_failed', detail: r.stderr.trim() || 'docker run failed' });
  }
  send(res, 200, { sandboxID: id, url: null });
}

async function getState(res, id) {
  const r = await docker(['inspect', '-f', '{{.State.Status}}', NAME_PREFIX + id], { timeoutMs: 10000 });
  if (r.code !== 0) return send(res, 404, { error: 'not_found' });
  const status = r.stdout.trim();
  const state = status === 'running' ? 'running' : status === 'paused' ? 'paused' : 'stopped';
  send(res, 200, { state });
}

async function destroy(res, id) {
  await docker(['rm', '-f', NAME_PREFIX + id], { timeoutMs: 20000 });
  send(res, 204);
}

async function exec(req, res, id) {
  const body = await readJson(req);
  const cmd = typeof body.cmd === 'string' ? body.cmd : '';
  if (!cmd) return send(res, 400, { error: 'missing_cmd' });
  const args = ['exec'];
  if (body.cwd) args.push('-w', String(body.cwd));
  args.push(...envArgs(body.envs));
  args.push(NAME_PREFIX + id, 'sh', '-lc', cmd);
  const r = await docker(args, { timeoutMs: Number(body.timeoutMs) || 60000 });
  send(res, 200, { exitCode: r.timedOut ? null : r.code, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method || 'GET';

  if (method === 'GET' && parts[0] === 'health') return send(res, 200, { ok: true });
  if (method === 'POST' && parts[0] === 'sandboxes' && parts.length === 1) return void provision(req, res);
  if (parts[0] === 'sandboxes' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    if (method === 'GET' && parts.length === 2) return void getState(res, id);
    if (method === 'DELETE' && parts.length === 2) return void destroy(res, id);
    if (method === 'POST' && parts[2] === 'exec') return void exec(req, res, id);
  }
  send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  process.stdout.write(`resandbox orchestrator listening on :${PORT} (image=${DEFAULT_IMAGE})\n`);
});
