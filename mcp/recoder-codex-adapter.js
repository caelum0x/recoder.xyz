#!/usr/bin/env node
/**
 * Recoder A2A Adapter for OpenAI Codex CLI
 *
 * Provides the same 5 tools as the Claude Code MCP server,
 * but uses Codex's JSON-RPC protocol format.
 *
 * Usage:
 *   export RECODER_API_TOKEN=YOUR_SESSION_TOKEN
 *   export DAYTONA_API_KEY=dyt_8532...
 *   node mcp/recoder-codex-adapter.js
 */

const DOCKER_URL = process.env.RECODER_DOCKER_URL || 'https://docker.recoder.xyz';
const API_URL = process.env.RECODER_API_URL || 'https://api.recoder.xyz';
const DAYTONA_URL = process.env.RECODER_DAYTONA_URL || 'http://77.42.23.19:3900/api';
const DAYTONA_KEY = process.env.DAYTONA_API_KEY || '';
const API_TOKEN = process.env.RECODER_API_TOKEN || '';

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      try { handleMessage(JSON.parse(line)); } catch {}
    }
  }
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

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
          const res = await fetch(`${DOCKER_URL}/api/a2a/agents`);
          result = await res.json();
          break;
        }
        case 'recoder_list_tasks': {
          const res = await fetch(`${DOCKER_URL}/api/a2a/tasks`);
          result = await res.json();
          break;
        }
        case 'recoder_send_task': {
          const res = await fetch(`${DOCKER_URL}/api/a2a/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: args.target_agent, task: args.task, from: 'codex' }),
          });
          result = await res.json();
          break;
        }
        case 'recoder_create_thread': {
          const formData = new URLSearchParams();
          formData.append('prompt', args.prompt);
          const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
          if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
          const res = await fetch(`${API_URL}/v1/agent/start`, { method: 'POST', headers, body: formData.toString() });
          result = await res.json();
          break;
        }
        case 'recoder_sandbox_run': {
          if (!DAYTONA_KEY) { respond(id, { error: 'DAYTONA_API_KEY not set' }); return; }
          const createRes = await fetch(`${DAYTONA_URL}/sandbox`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DAYTONA_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot: 'daytonaio/sandbox:0.5.0-slim', public: true, autoStopInterval: 5 }),
          });
          const sandbox = await createRes.json();
          await new Promise(r => setTimeout(r, 10000));
          const base = DAYTONA_URL.replace('/api', '');
          const execRes = await fetch(`${base}/api/toolbox/${sandbox.id}/toolbox/process/execute`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DAYTONA_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: args.command }),
          });
          result = await execRes.json();
          await fetch(`${DAYTONA_URL}/sandbox/${sandbox.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${DAYTONA_KEY}` } }).catch(() => {});
          break;
        }
        default:
          respond(id, { error: `Unknown tool: ${name}` });
          return;
      }
      respond(id, result);
    } catch (err) {
      respond(id, { error: err.message });
    }
  }
}

process.stderr.write('[recoder-codex] Adapter ready. 5 tools available.\n');
