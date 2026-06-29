#!/usr/bin/env node
/**
 * Recoder A2A Adapter for OpenAI Codex CLI
 *
 * Provides the same 5 tools as the Claude Code MCP server,
 * but uses Codex's JSON-RPC protocol format.
 *
 * Usage:
 *   export RECODER_API_TOKEN=YOUR_SESSION_TOKEN
 *   export RECODER_DAYTONA_URL=http://127.0.0.1:3900/api
 *   export DAYTONA_API_KEY=dyt_...
 *   node mcp/recoder-codex-adapter.js
 */

const {
  signRequest: coreSignRequest,
  isLocalUrl,
  normalizeDaytonaApiUrl,
  buildDaytonaCreateBody,
} = require('./lib/recoder-mcp-core');

const DOCKER_URL = process.env.RECODER_DOCKER_URL || 'http://127.0.0.1:3002';
const API_URL = process.env.RECODER_API_URL || 'http://127.0.0.1:3001';
const DAYTONA_URL = process.env.RECODER_DAYTONA_URL || '';
const DAYTONA_KEY = process.env.DAYTONA_API_KEY || '';
const API_TOKEN = process.env.RECODER_API_TOKEN || '';
const A2A_SIGNING_SECRET = process.env.RECODER_A2A_SIGNING_SECRET || '';
const ALLOW_UNAUTHENTICATED_LOCAL = process.env.RECODER_ALLOW_UNAUTHENTICATED_LOCAL === 'true';

function requireRecoderAuth(baseUrl) {
  if (API_TOKEN) return;
  if (ALLOW_UNAUTHENTICATED_LOCAL && isLocalUrl(baseUrl)) return;
  throw new Error('RECODER_API_TOKEN is required for Recoder A2A calls');
}

function signRequest({ method, url, body = '' }) {
  return coreSignRequest({ method, url, body, secret: A2A_SIGNING_SECRET });
}

function recoderHeaders(baseUrl, options = {}) {
  requireRecoderAuth(baseUrl);
  const headers = {
    ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
    ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
  };
  return {
    ...headers,
    ...signRequest({
      method: options.method || 'GET',
      url: options.url || baseUrl,
      body: options.body || '',
    }),
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RECODER_MCP_TIMEOUT_MS || 30000));
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${data?.error?.message || data?.message || res.statusText}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      try {
        const msg = JSON.parse(line);
        Promise.resolve(handleMessage(msg)).catch((err) => {
          respondError(readJsonRpcId(msg), -32000, err.message || 'Tool execution failed');
        });
      } catch (err) {
        respondError(null, -32700, 'Parse error', { message: err.message });
      }
    }
  }
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message, data) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } }) + '\n');
}

function readJsonRpcId(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  return Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    respondError(null, -32600, 'Invalid Request');
    return;
  }

  const { id, method, params } = msg;
  if (typeof method !== 'string') {
    respondError(id, -32600, 'Invalid Request', { reason: 'method must be a string' });
    return;
  }

  if (method === 'initialize') {
    respond(id, {
      name: 'recoder-codex-a2a',
      version: '1.0.0',
      tools: [
        { name: 'recoder_list_agents', description: 'List A2A agents' },
        { name: 'recoder_list_tasks', description: 'List A2A tasks' },
        { name: 'recoder_send_task', description: 'Send task to agent', params: ['target_agent', 'task'] },
        { name: 'recoder_create_thread', description: 'Create AI agent thread', params: ['prompt'] },
        { name: 'recoder_sandbox_run', description: 'Run command in sandbox', params: ['command'] },
      ],
    });
    return;
  }

  if (method === 'tools/call' || method === 'call') {
    const name = params?.name || params?.tool;
    const args = params?.arguments || params?.args || {};

    try {
      let result;
      switch (name) {
        case 'recoder_list_agents': {
          const url = `${DOCKER_URL}/api/a2a/agents`;
          result = await fetchJson(url, {
            headers: recoderHeaders(DOCKER_URL, { method: 'GET', url }),
          });
          break;
        }
        case 'recoder_list_tasks': {
          const url = `${DOCKER_URL}/api/a2a/tasks`;
          result = await fetchJson(url, {
            headers: recoderHeaders(DOCKER_URL, { method: 'GET', url }),
          });
          break;
        }
        case 'recoder_send_task': {
          const url = `${DOCKER_URL}/api/a2a/tasks`;
          const body = JSON.stringify({ target: args.target_agent, task: args.task, from: 'codex' });
          result = await fetchJson(url, {
            method: 'POST',
            headers: recoderHeaders(DOCKER_URL, {
              method: 'POST',
              url,
              contentType: 'application/json',
              body,
            }),
            body,
          });
          break;
        }
        case 'recoder_create_thread': {
          if (!args.prompt || typeof args.prompt !== 'string') {
            respondError(id, -32602, 'recoder_create_thread requires a "prompt" string argument');
            return;
          }
          const formData = new URLSearchParams();
          formData.append('prompt', args.prompt);
          const agentId = args.agent_id || process.env.RECODER_DEFAULT_AGENT_ID;
          if (agentId) formData.append('agent_id', agentId);
          const url = `${API_URL}/v1/agent/start`;
          const body = formData.toString();
          result = await fetchJson(url, {
            method: 'POST',
            headers: recoderHeaders(API_URL, {
              method: 'POST',
              url,
              contentType: 'application/x-www-form-urlencoded',
              body,
            }),
            body,
          });
          break;
        }
        case 'recoder_sandbox_run': {
          if (!DAYTONA_URL) { respondError(id, -32001, 'RECODER_DAYTONA_URL not set'); return; }
          if (!DAYTONA_KEY) { respondError(id, -32001, 'DAYTONA_API_KEY not set'); return; }
          if (!args.command || typeof args.command !== 'string') {
            respondError(id, -32602, 'recoder_sandbox_run requires a "command" string argument');
            return;
          }
          const daytonaApiUrl = normalizeDaytonaApiUrl(DAYTONA_URL);
          const daytonaHeaders = { 'Authorization': `Bearer ${DAYTONA_KEY}`, 'Content-Type': 'application/json' };
          const sandbox = await fetchJson(`${daytonaApiUrl}/sandbox`, {
            method: 'POST',
            headers: daytonaHeaders,
            body: JSON.stringify(buildDaytonaCreateBody({
              snapshot: process.env.DAYTONA_SNAPSHOT || 'daytonaio/sandbox:0.5.0-slim',
              autoStopInterval: 5,
            })),
          });
          if (!sandbox || !sandbox.id) {
            respondError(id, -32000, `Daytona sandbox creation returned no id: ${JSON.stringify(sandbox).slice(0, 200)}`);
            return;
          }
          await new Promise(r => setTimeout(r, 10000));
          const base = daytonaApiUrl.replace(/\/api\/?$/, '');
          try {
            result = await fetchJson(`${base}/api/toolbox/${sandbox.id}/toolbox/process/execute`, {
              method: 'POST',
              headers: daytonaHeaders,
              body: JSON.stringify({ command: args.command }),
            });
          } finally {
            // Always attempt cleanup, even if exec failed.
            await fetch(`${daytonaApiUrl}/sandbox/${sandbox.id}`, { method: 'DELETE', headers: daytonaHeaders }).catch(() => {});
          }
          break;
        }
        default:
          respondError(id, -32601, `Unknown tool: ${name}`);
          return;
      }
      respond(id, result);
    } catch (err) {
      respondError(id, -32000, err.message || 'Tool execution failed');
    }
    return;
  }

  respondError(id, -32601, `Unknown method: ${method}`);
}

process.stderr.write('[recoder-codex] Adapter ready. 5 tools available.\n');
