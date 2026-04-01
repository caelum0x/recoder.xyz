#!/usr/bin/env node
/**
 * Recoder A2A MCP Server for Claude Code, Codex, and Cursor
 *
 * Core A2A tools:
 * - recoder_list_agents: List connected A2A agents
 * - recoder_list_tasks: View A2A task queue
 * - recoder_send_task: Send task to another agent via A2A
 * - recoder_create_thread: Create agent thread with Daytona sandbox
 * - recoder_sandbox_exec: Execute code in isolated sandbox
 * - recoder_get_thread: Get thread messages (including AI responses)
 * - recoder_inbox: Check inbound tasks assigned to this agent
 * - recoder_task_respond: Respond to an inbound task
 *
 * Data & inference tools:
 * - recoder_search_code: Search codebase
 * - recoder_search: Meilisearch full-text search
 * - recoder_local_llm: Call local Ollama model in sandbox
 * - recoder_canvas_update: Push live Excalidraw updates
 * - recoder_query_data: Run SQL against DuckDB session
 * - recoder_load_csv: Load CSV into DuckDB
 * - recoder_load_json: Load JSON into DuckDB
 *
 * ACI (Agent-Computer Interface) tools:
 * - recoder_aci_edit: Targeted search/replace file edit
 * - recoder_aci_create_file: Create new file in sandbox
 * - recoder_aci_test_fix: Test-run-fix loop (auto-fixes failing tests)
 * - recoder_aci_git: Git operations (status, diff, branch, commit)
 */

const DOCKER_URL = process.env.RECODER_DOCKER_URL || 'https://docker.recoder.xyz';
const API_URL = process.env.RECODER_API_URL || 'https://api.recoder.xyz';
const A2A_URL = process.env.RECODER_A2A_URL || `${DOCKER_URL.replace('https:', 'wss:').replace('http:', 'ws:')}/agent-bridge`;
const DAYTONA_URL = process.env.RECODER_DAYTONA_URL || 'http://localhost:3900/api';
const DAYTONA_KEY = process.env.DAYTONA_API_KEY || '';
const RAW_AUTH_TOKEN = process.env.RECODER_API_TOKEN || '';
const AGENT_ID = process.env.RECODER_AGENT_ID || 'claude_code';
const SESSION_ID = process.env.RECODER_SESSION_ID || `${AGENT_ID}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function isRecoderApiKeyPair(value) {
  if (!value || typeof value !== 'string' || !value.includes(':')) return false;
  const [publicKey, secretKey] = value.split(':', 2);
  return publicKey.startsWith('pk_') && secretKey.startsWith('sk_');
}

const PYTHON_API_KEY = isRecoderApiKeyPair(RAW_AUTH_TOKEN) ? RAW_AUTH_TOKEN : '';
const _rawSessionToken = process.env.RECODER_SESSION_TOKEN || (PYTHON_API_KEY ? '' : RAW_AUTH_TOKEN);
const PLATFORM_TOKEN = (() => {
  try { return decodeURIComponent(_rawSessionToken); } catch { return _rawSessionToken; }
})();

function buildPlatformHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (PLATFORM_TOKEN) headers.Authorization = `Bearer ${PLATFORM_TOKEN}`;
  return headers;
}

function buildPythonApiHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (PYTHON_API_KEY) headers['x-api-key'] = PYTHON_API_KEY;
  else if (PLATFORM_TOKEN) headers.Authorization = `Bearer ${PLATFORM_TOKEN}`;
  return headers;
}

// ── WebSocket A2A Bridge Connection ──

let ws = null;
let wsConnected = false;
let wsReconnectTimer = null;
let wsHeartbeatInterval = null;
let wsRetries = 0;
const WS_MAX_RETRIES = 9999; // effectively unlimited — reconnect until process exits

// Inbound task queue
const inboundTasks = [];
const MAX_INBOUND_TASKS = 50;
let mcpReady = false; // set to true after notifications/initialized

function pushNotification(level, data) {
  if (!mcpReady) return;
  try {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level, logger: 'recoder-a2a', data },
    }) + '\n');
  } catch {}
}

function handleBridgeMessage(msg) {
  switch (msg.type) {
    case 'registered':
      process.stderr.write(`[recoder-a2a] Registered: ${msg.agentId} session:${msg.sessionId || SESSION_ID} workspaces: ${JSON.stringify(msg.workspaces || [])}\n`);
      break;
    case 'task.assigned': {
      const task = {
        taskId: msg.taskId,
        prompt: msg.prompt || msg.task || '',
        context: msg.context || {},
        from: msg.from || msg.context?.source || 'unknown',
        worktreeBranch: msg.worktreeBranch || null,
        receivedAt: new Date().toISOString(),
        status: 'pending',
      };
      inboundTasks.unshift(task);
      if (inboundTasks.length > MAX_INBOUND_TASKS) inboundTasks.pop();
      process.stderr.write(`[recoder-a2a] Task assigned: ${task.taskId} from ${task.from}\n`);
      wsSend({ type: 'task.progress', taskId: task.taskId, progress: 0, output: `Task received by ${AGENT_ID}` });
      // Push MCP notification so Claude Code sees the task immediately without polling
      const preview = task.prompt.slice(0, 120);
      pushNotification('info', `📨 New task [${task.taskId}] from ${task.from}: ${preview}${task.prompt.length > 120 ? '...' : ''} — run recoder_inbox to view`);
      break;
    }
    case 'task.cancelled': {
      const idx = inboundTasks.findIndex(t => t.taskId === msg.taskId);
      if (idx >= 0) inboundTasks[idx].status = 'cancelled';
      break;
    }
    case 'ping':
      wsSend({ type: 'heartbeat' });
      break;
    default:
      break;
  }
}

function wsSend(obj) {
  if (ws && wsConnected) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

function connectBridge() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  if (wsHeartbeatInterval) { clearInterval(wsHeartbeatInterval); wsHeartbeatInterval = null; }
  try {
    const WebSocket = require('ws');
    if (ws) { try { ws.removeAllListeners(); ws.terminate(); } catch {} ws = null; }
    const bridgeUrl = PLATFORM_TOKEN
      ? `${A2A_URL}?token=${encodeURIComponent(PLATFORM_TOKEN)}&agentId=${AGENT_ID}&sessionId=${encodeURIComponent(SESSION_ID)}&capabilities=execute,plan,edit`
      : `${A2A_URL}?agentId=${AGENT_ID}&sessionId=${encodeURIComponent(SESSION_ID)}`;
    ws = new WebSocket(bridgeUrl, {
      headers: { 'x-agent-id': AGENT_ID, 'x-capabilities': JSON.stringify(['execute', 'plan', 'edit']) },
      handshakeTimeout: 10000,
    });
    ws.on('open', () => {
      wsConnected = true;
      wsRetries = 0;
      process.stderr.write(`[recoder-a2a] Connected to A2A bridge as ${AGENT_ID}\n`);
      wsHeartbeatInterval = setInterval(() => wsSend({ type: 'heartbeat' }), 25000);
    });
    ws.on('message', (data) => {
      try { handleBridgeMessage(JSON.parse(data.toString())); } catch {}
    });
    ws.on('close', () => {
      wsConnected = false;
      if (wsHeartbeatInterval) { clearInterval(wsHeartbeatInterval); wsHeartbeatInterval = null; }
      if (wsRetries < WS_MAX_RETRIES) {
        wsRetries++;
        wsReconnectTimer = setTimeout(connectBridge, Math.min(5000 * wsRetries, 30000));
      }
    });
    ws.on('error', () => { wsConnected = false; });
  } catch {
    process.stderr.write('[recoder-a2a] ws module not found — A2A bridge disabled (install: npm install ws)\n');
  }
}

setTimeout(connectBridge, 500);

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
  {
    name: 'recoder_inbox',
    description: 'Check inbound tasks assigned to this agent via the A2A bridge. Shows pending tasks from other agents.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'recoder_task_respond',
    description: 'Respond to an inbound task — complete it with a result or mark it as failed.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID from recoder_inbox' },
        result: { type: 'string', description: 'Result/response to send back' },
        status: { type: 'string', enum: ['complete', 'failed'], default: 'complete' },
      },
      required: ['task_id', 'result'],
    },
  },
  {
    name: 'recoder_remember',
    description: 'Store a persistent memory entry for this user. Memories survive across sessions and are semantically searchable. Use for preferences, facts, decisions, and patterns worth remembering.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remember (a fact, preference, decision, or pattern)' },
        type: { type: 'string', enum: ['preference', 'fact', 'task', 'code', 'decision', 'error'], default: 'fact', description: 'Memory type for filtering' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization' },
      },
      required: ['content'],
    },
  },
  {
    name: 'recoder_recall',
    description: 'Search persistent memory semantically. Returns the most relevant stored memories for a query. Use at session start to inject user context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query to search memories' },
        limit: { type: 'number', default: 10, description: 'Max results to return (1-50)' },
        type: { type: 'string', enum: ['preference', 'fact', 'task', 'code', 'decision', 'error'], description: 'Filter by memory type (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recoder_forget',
    description: 'Delete a specific memory entry by ID (returned by recoder_recall).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory entry ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'recoder_search_code',
    description: 'Semantic code search across an indexed project. Finds code by intent, not just exact text match. Example: "find all places where auth is checked".',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID to search within' },
        query: { type: 'string', description: 'Natural language query describing what you want to find' },
        limit: { type: 'number', default: 10, description: 'Max results (1-20)' },
      },
      required: ['project_id', 'query'],
    },
  },
  {
    name: 'recoder_search',
    description: 'Search across all Recoder platform content: threads, files, PM features, and agency projects. Uses Meilisearch hybrid (text + semantic) search. Results are cached per session for 1 hour.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query (natural language or keywords)' },
        sources: {
          type: 'array',
          items: { type: 'string', enum: ['threads', 'files', 'pm_features', 'agency_items'] },
          description: 'Content sources to search (default: all)',
        },
        limit: { type: 'number', default: 10, description: 'Max results (1-50)' },
      },
      required: ['q'],
    },
  },
  {
    name: 'recoder_local_llm',
    description: 'Call a local Ollama model inside the sandbox for cheap inference. Use for docstrings, code comments, simple Q&A. Saves expensive API calls for complex reasoning.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Prompt for the local model' },
        model: { type: 'string', default: 'qwen2.5-coder:3b', description: 'Ollama model name' },
        sandbox_id: { type: 'string', description: 'Sandbox ID where Ollama is running' },
      },
      required: ['prompt', 'sandbox_id'],
    },
  },
  {
    name: 'recoder_canvas_update',
    description: 'Push live Excalidraw element updates to a canvas board open in the Recoder agents UI. The browser\'s CanvasPanel will call updateScene() immediately, adding or replacing elements without a full reload.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project/workspace ID the canvas belongs to' },
        thread_id: { type: 'string', description: 'Thread ID that owns the canvas (optional, used for routing)' },
        elements: {
          type: 'array',
          description: 'Excalidraw elements array (shapes, text, arrows). Each element must have type, id, x, y, width, height at minimum.',
          items: { type: 'object' },
        },
      },
      required: ['project_id', 'elements'],
    },
  },
  {
    name: 'recoder_query_data',
    description: 'Run SQL against the session\'s in-memory DuckDB instance. Use for data analysis, aggregations, and joins. Results are available in the scratchpad if scratchpad_key is provided.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute against DuckDB (SELECT, CREATE TABLE, etc.)' },
        scratchpad_key: { type: 'string', description: 'Optional key to store results in scratchpad for other agents' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'recoder_load_csv',
    description: 'Load CSV data into a named DuckDB table in the session. After loading, query with recoder_query_data.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Name for the new table (alphanumeric and underscore only)' },
        csv_content: { type: 'string', description: 'Raw CSV content (first row treated as header by default)' },
        has_header: { type: 'boolean', default: true, description: 'Whether the first row is a header' },
      },
      required: ['table_name', 'csv_content'],
    },
  },
  {
    name: 'recoder_load_json',
    description: 'Load a JSON array of objects into a named DuckDB table in the session. After loading, query with recoder_query_data.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Name for the new table' },
        records: { type: 'array', items: { type: 'object' }, description: 'Array of objects to load as rows' },
      },
      required: ['table_name', 'records'],
    },
  },
  {
    name: 'recoder_aci_edit',
    description: 'Apply a targeted search/replace edit to a file in the sandbox. The old_text must appear exactly once. Use instead of overwriting entire files — minimal, safe, reviewable diffs.',
    inputSchema: {
      type: 'object',
      properties: {
        sandbox_id: { type: 'string', description: 'Daytona sandbox ID' },
        file_path: { type: 'string', description: 'Absolute path to the file inside the sandbox' },
        old_text: { type: 'string', description: 'Exact text to find (must be unique in the file)' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      required: ['sandbox_id', 'file_path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'recoder_aci_create_file',
    description: 'Create a new file in the sandbox with specified content. Creates parent directories automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        sandbox_id: { type: 'string', description: 'Daytona sandbox ID' },
        file_path: { type: 'string', description: 'Absolute path for the new file' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['sandbox_id', 'file_path', 'content'],
    },
  },
  {
    name: 'recoder_aci_test_fix',
    description: 'Run the test-run-fix loop: execute test_command, ask LLM to generate a fix on failure, apply it, repeat until tests pass or max_iterations. Use after writing code to validate and auto-fix.',
    inputSchema: {
      type: 'object',
      properties: {
        sandbox_id: { type: 'string', description: 'Daytona sandbox ID' },
        test_command: { type: 'string', description: 'Shell command to run tests (e.g. "pytest tests/" or "npm test")' },
        context: { type: 'string', description: 'Additional context about the codebase for the LLM fixer' },
        max_iterations: { type: 'number', default: 5, description: 'Max fix attempts (1-10)' },
        model: { type: 'string', default: 'anthropic/claude-sonnet-4-20250514', description: 'LLM model for fix generation' },
      },
      required: ['sandbox_id', 'test_command'],
    },
  },
  {
    name: 'recoder_aci_git',
    description: 'Git operations in the sandbox: status, diff, branch creation, and commit. Use to inspect and commit work after ACI edits.',
    inputSchema: {
      type: 'object',
      properties: {
        sandbox_id: { type: 'string', description: 'Daytona sandbox ID' },
        operation: {
          type: 'string',
          enum: ['status', 'diff', 'diff_unstaged', 'branch', 'commit'],
          description: 'Operation: status=show changes, diff=staged diff, diff_unstaged=unstaged diff, branch=create branch, commit=stage+commit',
        },
        branch_name: { type: 'string', description: 'Branch name (required for branch operation)' },
        commit_message: { type: 'string', description: 'Commit message (required for commit operation)' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Specific paths to stage for commit (default: all)' },
      },
      required: ['sandbox_id', 'operation'],
    },
  },
  {
    name: 'recoder_workflow_run',
    description: 'Execute a multi-step workflow inline. Supports step types: llm (call AI model), http (make HTTP request), code (run code in sandbox), branch (conditional), trigger (run another workflow). Steps execute sequentially with shared context.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'Ordered list of workflow steps',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Human-readable step name' },
              type: { type: 'string', enum: ['llm', 'http', 'code', 'branch', 'trigger'], description: 'Step type' },
              config: {
                type: 'object',
                description: 'Step configuration. llm: {prompt, model?, system?}. http: {url, method?, headers?, body?}. code: {code, language?, sandboxId?}. branch: {condition}. trigger: {workflowId, input?}.',
              },
            },
            required: ['name', 'type', 'config'],
          },
        },
        context: { type: 'object', description: 'Initial context variables (accessible via {{key}} in prompts/URLs)' },
      },
      required: ['steps'],
    },
  },
];

// ── Helpers ──

async function apiFetch(url, options = {}) {
  const headers = buildPlatformHeaders(options.headers);
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
      const lines = [];
      lines.push(`This session: ${AGENT_ID}:${SESSION_ID}`);
      lines.push(`A2A bridge: ${wsConnected ? 'connected' : 'disconnected'}`);

      // Live bridge sessions (shows unique session IDs per terminal)
      try {
        const bridgeData = await apiFetch(`${DOCKER_URL}/api/a2a/bridge/agents`);
        const sessions = bridgeData.data?.sessions || [];
        if (sessions.length) {
          lines.push(`\n── Live Bridge Sessions (${sessions.length}) ──`);
          for (const s of sessions) {
            const isMe = s.sessionId === SESSION_ID;
            lines.push(`• ${s.agentId} session:${s.sessionId}${isMe ? ' [this terminal]' : ''} status:${s.status} since:${s.connectedAt?.slice(0, 16)}`);
          }
        } else {
          lines.push('\n── No live bridge sessions ──');
        }
      } catch {
        lines.push('\n── Bridge sessions unavailable ──');
      }

      // Registered agents from agent registry (platform-wide, may include offline)
      try {
        const data = await apiFetch(`${DOCKER_URL}/api/a2a/agents`);
        const agents = data.agents || [];
        if (agents.length) {
          lines.push(`\n── Registered Agents (${agents.length}) ──`);
          for (const a of agents) {
            lines.push(`• ${a.agent_id} (${a.platform}) health:${a.health}`);
          }
        }
      } catch {}

      return lines.join('\n');
    }

    case 'recoder_list_tasks': {
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/tasks`);
      const tasks = data.data?.tasks || [];
      if (!tasks.length) return 'No tasks in queue.';
      return tasks.map(t => `• ${t.id?.slice(0,12)} state:${t.state} from:${t.requester?.agent_id} to:${t.assignee?.agent_id}`).join('\n');
    }

    case 'recoder_send_task': {
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
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: 'ws_default',
          thread_id: `thread_${Date.now()}`,
          requester: { agent_id: AGENT_ID, platform: AGENT_ID },
          assignee: { agent_id: args.target_agent, platform: args.target_agent },
          connector: { type: 'bridge', protocol: 'websocket', connector_id: 'mcp-bridge', platform: 'recoder' },
          payload: { intent: args.intent || 'execute', task: args.task },
        }),
      });
      return `Task created: ${data.data?.id || 'unknown'}\nState: ${data.data?.state || 'submitted'}\nTarget: ${args.target_agent}`;
    }

    case 'recoder_create_thread': {
      const authHeaders = buildPythonApiHeaders();
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
          headers: buildPythonApiHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
          body: form.toString(),
        });
        const startData = await startRes.json();
        return `Thread: ${threadData.thread_id}\nStatus: ${startData.status || 'created'}\nRun: ${startData.agent_run_id || 'none'}\nView: https://agents.recoder.xyz/thread/${threadData.thread_id}`;
      }
      return `Thread: ${threadData.thread_id}\nView: https://agents.recoder.xyz/thread/${threadData.thread_id}`;
    }

    case 'recoder_get_thread': {
      const authHeaders = buildPythonApiHeaders();
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
      const baseUrl = DAYTONA_URL.replace(/\/api\/?$/, '');
      let sandboxId = args.sandbox_id;
      let createdNew = false;
      if (!sandboxId) {
        const createUrl = `${DAYTONA_URL}/sandbox`;
        let createRes;
        try {
          createRes = await fetch(createUrl, {
            method: 'POST', headers: dHeaders,
            body: JSON.stringify({ image: 'daytonaio/sandbox:0.5.0-slim', public: true, auto_stop_interval: 10 }),
          });
        } catch (fetchErr) {
          return `Sandbox fetch error: ${fetchErr.message}\nURL: ${createUrl}`;
        }
        const createText = await createRes.text();
        if (!createRes.ok) return `Error creating sandbox (HTTP ${createRes.status}): ${createText.slice(0, 300)}`;
        let sb;
        try { sb = JSON.parse(createText); } catch { return `Sandbox response not JSON:\n${createText.slice(0, 500)}`; }
        if (!sb.id) return `Error creating sandbox: ${JSON.stringify(sb)}`;
        sandboxId = sb.id;
        createdNew = true;
        await new Promise(r => setTimeout(r, 5000));
      }
      const execUrl = `${baseUrl}/api/toolbox/${sandboxId}/toolbox/process/execute`;
      const shellCommand = `sh -c ${JSON.stringify(args.command)}`;
      let execRes;
      try {
        execRes = await fetch(execUrl, { method: 'POST', headers: dHeaders, body: JSON.stringify({ command: shellCommand }) });
      } catch (fetchErr) {
        return `Sandbox exec error: ${fetchErr.message}\nURL: ${execUrl}`;
      }
      const execText = await execRes.text();
      let result;
      try { result = JSON.parse(execText); } catch { return `Exec not JSON (HTTP ${execRes.status}):\n${execText.slice(0, 500)}`; }
      if (createdNew) {
        fetch(`${DAYTONA_URL}/sandbox/${sandboxId}`, { method: 'DELETE', headers: dHeaders }).catch(() => {});
      }
      const output = result.result || result.output || result.stdout || JSON.stringify(result);
      return `Sandbox: ${sandboxId}${createdNew ? ' (auto-created)' : ''}\nExit: ${result.exitCode ?? result.exit_code ?? '?'}\n\n${output}`;
    }

    case 'recoder_inbox': {
      const pending = inboundTasks.filter(t => t.status === 'pending');
      const recent = inboundTasks.filter(t => t.status !== 'pending').slice(0, 5);

      // Also fetch unclaimed REST tasks assigned to this agent (works when bridge is disconnected)
      let restPending = [];
      try {
        const restData = await apiFetch(`${DOCKER_URL}/api/a2a/tasks?assignee_agent_id=${encodeURIComponent(AGENT_ID)}&state=submitted&limit=20`);
        const allRest = restData.data?.tasks || [];
        restPending = allRest.filter(t => {
          const claim = t.metadata?.claimedBy;
          return !claim || claim.sessionId === SESSION_ID;
        });
      } catch {}

      if (!pending.length && !recent.length && !restPending.length) {
        return `No inbound tasks.\nSession: ${SESSION_ID}\nBridge: ${wsConnected ? 'connected' : 'disconnected'}`;
      }

      const lines = [`Session: ${SESSION_ID}`];
      if (pending.length) {
        lines.push(`\n── Bridge Tasks (${pending.length}) ──`);
        for (const t of pending) {
          lines.push(`• [${t.taskId}] from:${t.from} at:${t.receivedAt}`);
          lines.push(`  ${t.prompt.slice(0, 200)}`);
          if (t.worktreeBranch) lines.push(`  branch: ${t.worktreeBranch}`);
        }
      }
      if (restPending.length) {
        lines.push(`\n── REST Tasks (${restPending.length}) ──`);
        for (const t of restPending) {
          const claimedByMe = t.metadata?.claimedBy?.sessionId === SESSION_ID;
          const payload = t.payload;
          const prompt = (typeof payload === 'object' && payload !== null)
            ? (payload.text || payload.prompt || payload.task || JSON.stringify(payload)).slice(0, 150)
            : String(payload || '').slice(0, 150);
          lines.push(`• [${t.id}] from:${t.requester?.agent_id} state:${t.state}${claimedByMe ? ' [claimed:mine]' : ''}`);
          lines.push(`  ${prompt}`);
        }
      }
      if (recent.length) {
        lines.push(`\n── Recent (${recent.length}) ──`);
        for (const t of recent) lines.push(`• [${t.taskId}] ${t.status} from:${t.from}`);
      }
      lines.push(`\nBridge: ${wsConnected ? 'connected' : 'disconnected'}`);
      return lines.join('\n');
    }

    case 'recoder_task_respond': {
      const wsTask = inboundTasks.find(t => t.taskId === args.task_id);
      if (wsTask) {
        const isComplete = (args.status || 'complete') === 'complete';
        if (isComplete) {
          wsSend({ type: 'task.complete', taskId: args.task_id, result: args.result });
          wsTask.status = 'completed';
        } else {
          wsSend({ type: 'task.failed', taskId: args.task_id, error: args.result });
          wsTask.status = 'failed';
        }
        return `Task ${args.task_id} marked as ${wsTask.status}. Response sent via bridge.`;
      }
      // REST task: claim then transition
      const isComplete = (args.status || 'complete') === 'complete';
      const targetState = isComplete ? 'completed' : 'failed';
      try {
        await apiFetch(`${DOCKER_URL}/api/a2a/tasks/${args.task_id}/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: SESSION_ID, agent_id: AGENT_ID }),
        });
      } catch (claimErr) {
        if ((claimErr.message || '').includes('409')) return `Task ${args.task_id} is claimed by another session.`;
      }
      const transData = await apiFetch(`${DOCKER_URL}/api/a2a/tasks/${args.task_id}/transition`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_state: targetState,
          triggered_by: `${AGENT_ID}:${SESSION_ID}`,
          ...(isComplete
            ? { result: { output: args.result }, reason: 'Task completed' }
            : { error: { message: args.result, code: 'agent_error' }, reason: 'Task failed' }),
        }),
      });
      return `Task ${args.task_id} → ${targetState}.\nState: ${transData.data?.state || transData.state}`;
    }

    case 'recoder_remember': {
      const body = {
        content: args.content,
        type: args.type || 'fact',
        tags: args.tags || [],
        agentId: AGENT_ID,
      };
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const entry = data.data;
      return `Memory stored.\nID: ${entry.id}\nType: ${entry.type}\nContent: ${entry.content.slice(0, 120)}`;
    }

    case 'recoder_recall': {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const body = { query: args.query, limit, ...(args.type ? { type: args.type } : {}) };
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const entries = data.data || [];
      if (!entries.length) return 'No relevant memories found.';
      return entries.map((e, i) =>
        `[${i + 1}] ID:${e.id} type:${e.type} score:${e.score?.toFixed(2) ?? '?'} tags:${(e.tags || []).join(',') || 'none'}\n    ${e.content.slice(0, 200)}`
      ).join('\n\n');
    }

    case 'recoder_forget': {
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/memory/${encodeURIComponent(args.id)}`, {
        method: 'DELETE',
      });
      return data.data?.deleted ? `Memory ${args.id} deleted.` : `Memory ${args.id} not found.`;
    }

    case 'recoder_search_code': {
      if (!args.project_id || !args.query) throw new Error('project_id and query are required');
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/code-search/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: args.project_id, query: args.query, limit }),
      });
      const results = data.data || [];
      if (!results.length) return 'No code matches found. The project may not be indexed yet.';
      return results.map((r, i) =>
        `[${i + 1}] ${r.filePath} lines ${r.lineStart}-${r.lineEnd} (score:${r.score?.toFixed(2) ?? '?'})\n${r.content.slice(0, 300)}`
      ).join('\n\n---\n\n');
    }

    case 'recoder_search': {
      if (!args.q) throw new Error('q (query) is required');
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const body = { q: args.q, limit, ...(args.sources ? { sources: args.sources } : {}) };
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const results = data.data || [];
      if (!results.length) return 'No results found.';
      return results.map((r, i) =>
        `[${i + 1}] [${r.source}] ${r.title} (score:${r.score?.toFixed(2) ?? '?'})\n    ${r.snippet.replace(/\n/g, ' ').slice(0, 200)}`
      ).join('\n\n');
    }

    case 'recoder_local_llm': {
      if (!args.prompt || !args.sandbox_id) throw new Error('prompt and sandbox_id required');
      const model = args.model || 'qwen2.5-coder:3b';
      const dHeaders = { 'Authorization': `Bearer ${DAYTONA_KEY}`, 'Content-Type': 'application/json' };
      const baseUrl = DAYTONA_URL.replace(/\/api\/?$/, '');
      const execUrl = `${baseUrl}/api/toolbox/${args.sandbox_id}/toolbox/process/execute`;

      const sandboxExec = async (cmd) => {
        const res = await fetch(execUrl, { method: 'POST', headers: dHeaders, body: JSON.stringify({ command: cmd }) });
        return res.json();
      };

      // 1. Install Ollama if missing (idempotent, ~3s if already installed)
      await sandboxExec('sh -c "command -v ollama || curl -fsSL https://ollama.ai/install.sh | sh"').catch(() => {});

      // 2. Start Ollama server if not running (nohup, idempotent)
      await sandboxExec('sh -c "pgrep -x ollama || (nohup ollama serve > /tmp/ollama.log 2>&1 &) && sleep 2"').catch(() => {});

      // 3. Pull model if not already present (idempotent, ~30s first time)
      const listResult = await sandboxExec(`sh -c "ollama list 2>/dev/null | grep -q '${model.replace(/[^a-zA-Z0-9._:-]/g, '')}' && echo FOUND || echo MISSING"`).catch(() => ({}));
      const listOut = listResult.result || listResult.stdout || '';
      if (!listOut.includes('FOUND')) {
        await sandboxExec(`sh -c "ollama pull ${model.replace(/[^a-zA-Z0-9._:-]/g, '')} 2>&1"`).catch(() => {});
      }

      // 4. Use Ollama HTTP API for structured prompt (more reliable than piping)
      const ollamaApiRes = await sandboxExec(
        `sh -c "curl -s http://localhost:11434/api/generate -d '${JSON.stringify({ model, prompt: args.prompt, stream: false }).replace(/'/g, "'\\''")}'"`,
      );
      const apiOutput = ollamaApiRes.result || ollamaApiRes.stdout || '';

      // Parse Ollama API JSON response
      let response;
      try {
        const parsed = JSON.parse(apiOutput);
        response = parsed.response || apiOutput;
      } catch {
        // Fallback: raw output (e.g. if curl didn't get JSON)
        response = apiOutput;
      }

      return `Model: ${model}\n\n${response}`;
    }

    case 'recoder_canvas_update': {
      if (!args.project_id || !Array.isArray(args.elements)) {
        throw new Error('project_id and elements[] are required');
      }
      await apiFetch(`${DOCKER_URL}/api/a2a/canvas-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: args.project_id,
          threadId: args.thread_id || '',
          elements: args.elements,
        }),
      });
      return `Canvas updated: ${args.elements.length} element(s) pushed to project ${args.project_id}. The board in the Recoder UI will update live.`;
    }

    case 'recoder_query_data': {
      if (!args.sql) throw new Error('sql is required');
      const body = {
        sql: args.sql,
        ...(args.scratchpad_key ? { scratchpad_key: args.scratchpad_key } : {}),
        agent_id: AGENT_ID,
      };
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/data/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = data.data;
      const header = `Rows: ${result.rowCount}${result.truncated ? ` (truncated to ${result.rows.length})` : ''}\nColumns: ${result.columns.join(', ')}\n`;
      if (!result.rows.length) return header + '\n(no rows returned)';
      const rows = result.rows.slice(0, 20).map((r, i) =>
        `[${i + 1}] ${JSON.stringify(r)}`
      ).join('\n');
      return header + '\n' + rows + (result.rows.length > 20 ? `\n... and ${result.rows.length - 20} more rows` : '');
    }

    case 'recoder_load_csv': {
      if (!args.table_name || !args.csv_content) throw new Error('table_name and csv_content are required');
      const body = {
        table_name: args.table_name,
        csv_content: args.csv_content,
        has_header: args.has_header !== false,
        agent_id: AGENT_ID,
      };
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/data/load/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = data.data;
      return `Table "${args.table_name}" created: ${result.rowCount} rows, columns: ${result.columns.join(', ')}. Use recoder_query_data to query it.`;
    }

    case 'recoder_load_json': {
      if (!args.table_name || !Array.isArray(args.records)) throw new Error('table_name and records[] are required');
      const body = {
        table_name: args.table_name,
        records: args.records,
        agent_id: AGENT_ID,
      };
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/data/load/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = data.data;
      return `Table "${args.table_name}" created: ${result.rowCount} rows, columns: ${result.columns.join(', ')}. Use recoder_query_data to query it.`;
    }

    case 'recoder_aci_edit': {
      if (!args.sandbox_id || !args.file_path || args.old_text === undefined || args.new_text === undefined) {
        throw new Error('sandbox_id, file_path, old_text, and new_text are required');
      }
      const data = await apiFetch(`${API_URL}/v1/aci/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox_id: args.sandbox_id,
          file_path: args.file_path,
          old_text: args.old_text,
          new_text: args.new_text,
        }),
      });
      return data.success
        ? `Edit applied: ${data.message}`
        : `Edit failed: ${data.message}`;
    }

    case 'recoder_aci_create_file': {
      if (!args.sandbox_id || !args.file_path || args.content === undefined) {
        throw new Error('sandbox_id, file_path, and content are required');
      }
      const data = await apiFetch(`${API_URL}/v1/aci/create-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox_id: args.sandbox_id,
          file_path: args.file_path,
          content: args.content,
        }),
      });
      return data.success
        ? `File created: ${data.message}`
        : `File creation failed: ${data.message}`;
    }

    case 'recoder_aci_test_fix': {
      if (!args.sandbox_id || !args.test_command) {
        throw new Error('sandbox_id and test_command are required');
      }
      const data = await apiFetch(`${API_URL}/v1/aci/test-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox_id: args.sandbox_id,
          test_command: args.test_command,
          context: args.context || '',
          max_iterations: args.max_iterations || 5,
          model: args.model || 'anthropic/claude-sonnet-4-20250514',
        }),
      });
      const status = data.passed ? 'PASSED' : 'FAILED';
      const fixes = data.fixes_applied?.length
        ? `\n\nFixes applied (${data.fixes_applied.length}):\n${data.fixes_applied.join('\n')}`
        : '';
      return `Tests ${status} after ${data.iterations} iteration(s).\n\n${data.output.slice(0, 3000)}${fixes}`;
    }

    case 'recoder_aci_git': {
      if (!args.sandbox_id || !args.operation) {
        throw new Error('sandbox_id and operation are required');
      }
      const op = args.operation;
      if (op === 'status') {
        const data = await apiFetch(`${API_URL}/v1/aci/git/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandbox_id: args.sandbox_id }),
        });
        return data.is_repo
          ? `Git status (${data.is_repo ? 'repo' : 'not a repo'}):\n${data.status || '(clean)'}`
          : 'Not a git repository';
      }
      if (op === 'diff' || op === 'diff_unstaged') {
        const data = await apiFetch(`${API_URL}/v1/aci/git/diff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandbox_id: args.sandbox_id, staged: op === 'diff' }),
        });
        return data.diff || '(no changes)';
      }
      if (op === 'branch') {
        if (!args.branch_name) throw new Error('branch_name is required for branch operation');
        const data = await apiFetch(`${API_URL}/v1/aci/git/branch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandbox_id: args.sandbox_id, branch_name: args.branch_name }),
        });
        return data.success
          ? `Branch created: ${data.branch_name}`
          : `Branch failed: ${data.message}`;
      }
      if (op === 'commit') {
        if (!args.commit_message) throw new Error('commit_message is required for commit operation');
        const data = await apiFetch(`${API_URL}/v1/aci/git/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sandbox_id: args.sandbox_id,
            message: args.commit_message,
            paths: args.paths || null,
          }),
        });
        return data.success
          ? `Committed: ${data.message}`
          : `Commit failed: ${data.message}`;
      }
      throw new Error(`Unknown git operation: ${op}`);
    }

    case 'recoder_workflow_run': {
      if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
        throw new Error('steps[] is required (non-empty array)');
      }
      const data = await apiFetch(`${DOCKER_URL}/api/a2a/workflows/run-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: args.steps,
          context: args.context || {},
        }),
      });
      const result = data.data;
      const summary = result.results?.map((r, i) => {
        const output = typeof r.output === 'object'
          ? JSON.stringify(r.output).slice(0, 300)
          : String(r.output ?? '').slice(0, 300);
        return `${i + 1}. [${r.type}] ${r.step} (${r.durationMs}ms): ${output}`;
      }).join('\n') ?? 'No results';
      return `Workflow ${result.success ? 'SUCCEEDED' : 'FAILED'} (${result.results?.length ?? 0} steps)\n\n${summary}`;
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
        serverInfo: { name: 'recoder-a2a', version: '3.0.0' },
      });
      break;
    case 'notifications/initialized':
      mcpReady = true;
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

// Prevent uncaught errors from killing the MCP server
process.on('uncaughtException', (err) => { process.stderr.write(`[recoder-a2a] uncaught: ${err.message}\n`); });
process.on('unhandledRejection', (err) => { process.stderr.write(`[recoder-a2a] unhandled rejection: ${err}\n`); });

process.stderr.write('[recoder-a2a] Recoder A2A MCP Server v3.0.0\n');
process.stderr.write(`[recoder-a2a] API: ${API_URL} | A2A: ${A2A_URL}\n`);
if (DAYTONA_KEY) process.stderr.write('[recoder-a2a] Daytona sandbox enabled\n');
if (PLATFORM_TOKEN || PYTHON_API_KEY) process.stderr.write('[recoder-a2a] API auth configured\n');
