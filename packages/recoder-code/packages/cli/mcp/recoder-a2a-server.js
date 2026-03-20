#!/usr/bin/env node
/**
 * Recoder A2A MCP Server for Claude Code
 *
 * Provides 6 tools to interact with the Recoder platform:
 * - recoder_list_agents: List connected A2A agents
 * - recoder_list_tasks: View A2A task queue
 * - recoder_send_task: Send task to another agent via A2A
 * - recoder_create_thread: Create agent thread with Daytona sandbox
 * - recoder_sandbox_exec: Execute code in isolated sandbox
 * - recoder_get_thread: Get thread messages (including AI responses)
 */

const DOCKER_URL = process.env.RECODER_DOCKER_URL || 'https://docker.recoder.xyz';
const API_URL = process.env.RECODER_API_URL || 'https://api.recoder.xyz';
const A2A_URL = process.env.RECODER_A2A_URL || `${DOCKER_URL.replace('https:', 'wss:').replace('http:', 'ws:')}/agent-bridge`;
const DAYTONA_URL = process.env.RECODER_DAYTONA_URL || 'http://localhost:3900/api';
const DAYTONA_KEY = process.env.DAYTONA_API_KEY || '';
const API_TOKEN = process.env.RECODER_API_TOKEN || process.env.RECODER_SESSION_TOKEN || '';
const AGENT_ID = process.env.RECODER_AGENT_ID || 'claude_code';

// ── WebSocket A2A Bridge Connection ──

let ws = null;
let wsConnected = false;
let wsMessages = [];

function connectBridge() {
  try {
    const WebSocket = require('ws');
    ws = new WebSocket(A2A_URL, { headers: { 'x-agent-id': AGENT_ID, 'x-capabilities': JSON.stringify(['execute', 'plan', 'edit']) } });
    ws.on('open', () => { wsConnected = true; process.stderr.write(`[recoder-a2a] Connected to A2A bridge as ${AGENT_ID}\n`); });
    ws.on('message', (data) => { wsMessages.push(JSON.parse(data.toString())); });
    ws.on('close', () => { wsConnected = false; setTimeout(connectBridge, 5000); });
    ws.on('error', () => { wsConnected = false; });
  } catch {
    process.stderr.write('[recoder-a2a] ws module not found — A2A bridge disabled (install: npm install ws)\n');
  }
}

// Connect in background (don't block MCP startup)
setTimeout(connectBridge, 100);

// ── MCP Protocol (JSON-RPC over stdio) ──

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (line) {
      try { handleMessage(JSON.parse(line)); } catch {}
    }
  }
});

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function respond(id, result) { send({ jsonrpc: '2.0', id, result }); }
function respondError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

// ── Tool Definitions ──

const TOOLS = [
  {
    name: 'recoder_list_agents',
    description: 'List all agents registered on the Recoder A2A platform. Shows agent IDs, platforms, and health status.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'recoder_list_tasks',
    description: 'List recent A2A tasks. Shows task IDs, states, and assignments.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'recoder_send_task',
    description: 'Send a task to another agent via the A2A protocol. The target agent will receive and process it.',
    inputSchema: {
      type: 'object',
      properties: {
        target_agent: { type: 'string', description: 'Target agent ID (codex, claude_code, recoder_web, recoder_agency, recoder_pm, recoder_backend)' },
        task: { type: 'string', description: 'Task description' },
        intent: { type: 'string', enum: ['execute', 'plan', 'handoff', 'tool_call'], default: 'execute' },
      },
      required: ['target_agent', 'task'],
    },
  },
  {
    name: 'recoder_create_thread',
    description: 'Create an AI agent thread on Recoder. Provisions a Daytona sandbox and starts an AI agent that can write code, browse the web, and execute commands.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The task/prompt for the AI agent' },
        agent_id: { type: 'string', description: 'Agent ID (default: Recoder assistant)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'recoder_get_thread',
    description: 'Get messages from an existing thread, including AI responses.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'Thread ID to fetch messages from' },
      },
      required: ['thread_id'],
    },
  },
  {
    name: 'recoder_sandbox_exec',
    description: 'Execute a command in an isolated Daytona sandbox with Python 3.11, Node.js 22, and internet access.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        sandbox_id: { type: 'string', description: 'Existing sandbox ID (creates new if omitted)' },
      },
      required: ['command'],
    },
  },
];

// ── Helpers ──

async function apiFetch(url, options = {}) {
  const headers = { ...options.headers };
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Tool Implementations ──

async function handleToolCall(name, args) {
  switch (name) {
    case 'recoder_list_agents': {
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/agents`);
      const agents = data.agents || [];
      if (!agents.length) return 'No agents registered.';
      const lines = agents.map(a => `• ${a.agent_id} (${a.platform}) — ${a.enabled ? '✓' : '✗'} health:${a.health}`);
      lines.push(`\nA2A bridge: ${wsConnected ? 'connected' : 'disconnected'}`);
      return lines.join('\n');
    }

    case 'recoder_list_tasks': {
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/tasks`);
      const tasks = data.data?.tasks || [];
      if (!tasks.length) return 'No tasks in queue.';
      return tasks.map(t => `• ${t.id?.slice(0,12)} state:${t.state} from:${t.requester?.agent_id} to:${t.assignee?.agent_id}`).join('\n');
    }

    case 'recoder_send_task': {
      // Try WebSocket first (real-time)
      if (wsConnected && ws) {
        ws.send(JSON.stringify({
          type: 'intent',
          intent: args.intent || 'execute',
          target: args.target_agent,
          task: args.task,
          from: AGENT_ID,
        }));
        return `Task sent to ${args.target_agent} via A2A bridge (real-time).\nIntent: ${args.intent || 'execute'}\nTask: ${args.task}`;
      }

      // Fallback to REST API
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: 'ws_default',
          thread_id: `thread_${Date.now()}`,
          requester: { agent_id: AGENT_ID, platform: 'claude_code' },
          assignee: { agent_id: args.target_agent, platform: args.target_agent },
          connector: { type: 'bridge', protocol: 'websocket', connector_id: 'mcp-bridge', platform: 'recoder' },
          payload: { intent: args.intent || 'execute', task: args.task },
        }),
      });
      return `Task created: ${data.data?.id || 'unknown'}\nState: ${data.data?.state || 'submitted'}\nTarget: ${args.target_agent}`;
    }

    case 'recoder_create_thread': {
      const authHeaders = API_TOKEN ? { 'Authorization': `Bearer ${API_TOKEN}` } : {};
      const agentId = args.agent_id || '7e91f872-2407-42ac-bfcb-ea69a496e85c';

      const threadRes = await fetch(`${API_URL}/v1/threads`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const threadData = await threadRes.json();
      if (!threadData.thread_id) return `Error: ${JSON.stringify(threadData)}`;

      if (args.prompt) {
        const form = new URLSearchParams();
        form.append('prompt', args.prompt);
        form.append('thread_id', threadData.thread_id);
        form.append('agent_id', agentId);
        const startRes = await fetch(`${API_URL}/v1/agent/start`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        const startData = await startRes.json();
        return `Thread: ${threadData.thread_id}\nStatus: ${startData.status || 'created'}\nRun: ${startData.agent_run_id || 'none'}\nView: https://agents.recoder.xyz/thread/${threadData.thread_id}`;
      }
      return `Thread: ${threadData.thread_id}\nView: https://agents.recoder.xyz/thread/${threadData.thread_id}`;
    }

    case 'recoder_get_thread': {
      const authHeaders = API_TOKEN ? { 'Authorization': `Bearer ${API_TOKEN}` } : {};
      const res = await fetch(`${API_URL}/v1/threads/${args.thread_id}/messages`, { headers: authHeaders });
      const messages = await res.json();
      const msgs = Array.isArray(messages) ? messages : messages.messages || messages.items || [];
      if (!msgs.length) return 'No messages in this thread yet.';
      return msgs.map(m => {
        const role = m.role || m.type || '?';
        const content = typeof m.content === 'string' ? m.content : m.content?.content || JSON.stringify(m.content)?.slice(0, 200);
        return `[${role}] ${content}`;
      }).join('\n\n');
    }

    case 'recoder_sandbox_exec': {
      if (!DAYTONA_KEY) return 'Error: DAYTONA_API_KEY not configured.';
      const dHeaders = { 'Authorization': `Bearer ${DAYTONA_KEY}`, 'Content-Type': 'application/json' };
      const baseUrl = DAYTONA_URL.replace('/api', '');

      let sandboxId = args.sandbox_id;
      let createdNew = false;

      if (!sandboxId) {
        const createRes = await fetch(`${DAYTONA_URL}/sandbox`, {
          method: 'POST', headers: dHeaders,
          body: JSON.stringify({ image: 'daytonaio/sandbox:0.5.0-slim', public: true, auto_stop_interval: 10 }),
        });
        const sb = await createRes.json();
        if (!sb.id) return `Error creating sandbox: ${JSON.stringify(sb)}`;
        sandboxId = sb.id;
        createdNew = true;
        await new Promise(r => setTimeout(r, 5000));
      }

      const execRes = await fetch(`${baseUrl}/sandbox/${sandboxId}/toolbox/process/exec`, {
        method: 'POST', headers: dHeaders,
        body: JSON.stringify({ command: args.command }),
      });
      const result = await execRes.json();

      // Auto-cleanup if we created it
      if (createdNew) {
        fetch(`${DAYTONA_URL}/sandbox/${sandboxId}`, { method: 'DELETE', headers: dHeaders }).catch(() => {});
      }

      const output = result.result || result.output || result.stdout || JSON.stringify(result);
      return `Sandbox: ${sandboxId}${createdNew ? ' (auto-created)' : ''}\nExit: ${result.exitCode ?? result.exit_code ?? '?'}\n\n${output}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP Message Handler ──

async function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'recoder-a2a', version: '2.0.0' },
      });
      break;
    case 'notifications/initialized':
      process.stderr.write(`[recoder-a2a] Ready. ${TOOLS.length} tools | bridge: ${A2A_URL}\n`);
      break;
    case 'tools/list':
      respond(id, { tools: TOOLS });
      break;
    case 'tools/call':
      try {
        const text = await handleToolCall(params.name, params.arguments || {});
        respond(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        respond(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
      }
      break;
    default:
      if (id) respondError(id, -32601, `Method not found: ${method}`);
      break;
  }
}

process.stderr.write('[recoder-a2a] Recoder A2A MCP Server v2.0\n');
process.stderr.write(`[recoder-a2a] API: ${API_URL} | A2A: ${A2A_URL}\n`);
if (DAYTONA_KEY) process.stderr.write('[recoder-a2a] Daytona sandbox enabled\n');
if (API_TOKEN) process.stderr.write('[recoder-a2a] API auth configured\n');
