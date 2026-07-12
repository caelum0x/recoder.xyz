#!/usr/bin/env node
/**
 * Recoder A2A MCP Server for Claude Code
 *
 * Provides 11 tools to interact with the Recoder platform. This is the
 * documented Agents-in surface (list / run / inbox / sandbox-exec / respond +
 * workspace create / diff / merge):
 * - recoder_list_agents: List connected A2A agents          [list]
 * - recoder_list_tasks: View A2A task queue                 [list]
 * - recoder_send_task: Send task to another agent via A2A   [run]
 * - recoder_create_thread: Create agent thread with Daytona sandbox [run]
 * - recoder_get_thread: Get thread messages (including AI responses)
 * - recoder_sandbox_exec: Execute code in isolated sandbox  [sandbox-exec]
 * - recoder_inbox: Check inbound tasks assigned to this agent [inbox]
 * - recoder_task_respond: Respond to / complete an inbound task [respond]
 * - recoder_workspace_create: Provision a conductor coding workspace [workspace-create]
 * - recoder_workspace_diff: Reviewable worktree diff vs base ref     [workspace-diff]
 * - recoder_workspace_merge: Merge a workspace PR (approval-gated)    [workspace-merge]
 */

const {
  resolveCredentials,
  buildPlatformHeaders: coreBuildPlatformHeaders,
  buildPythonApiHeaders: coreBuildPythonApiHeaders,
  hasPythonApiAuth: coreHasPythonApiAuth,
  hasPlatformAuth: coreHasPlatformAuth,
  readJsonResponse,
  extractApiError,
  buildDaytonaCreateBody,
} = require('./lib/recoder-mcp-core');

// Bridge/control-plane URL resolution is LOCAL-FIRST. A desktop-spawned agent
// should register against the LOCAL backend's A2A bridge by default, not prod.
// Resolution priority for the docker/bridge base:
//   1. explicit env (RECODER_DOCKER_URL / RECODER_BRIDGE_URL)
//   2. local default derived from the local backend port (RECODER_BACKEND_PORT
//      or PORT, falling back to 3100 — the Express backend's default port)
//   3. only the cloud URL when explicitly opted in (RECODER_USE_CLOUD=true)
// The production URL is never the silent default; it is reachable only by
// configuring it explicitly, so behavior is preserved for cloud deployments.
const LOCAL_BACKEND_PORT = process.env.RECODER_BACKEND_PORT || process.env.PORT || '3100';
const LOCAL_BACKEND_URL = `http://127.0.0.1:${LOCAL_BACKEND_PORT}`;
const CLOUD_DOCKER_URL = 'https://docker.recoder.xyz';
const DOCKER_URL =
  process.env.RECODER_DOCKER_URL ||
  process.env.RECODER_BRIDGE_URL ||
  (process.env.RECODER_USE_CLOUD === 'true' ? CLOUD_DOCKER_URL : LOCAL_BACKEND_URL);
const API_URL =
  process.env.RECODER_API_URL ||
  (process.env.RECODER_USE_CLOUD === 'true' ? 'https://api.recoder.xyz' : LOCAL_BACKEND_URL);
// The WS bridge lives at <docker base>/agent-bridge. Honor RECODER_BRIDGE_URL as a
// direct bridge override (it may already be a ws:// URL or a base) before deriving.
const A2A_URL =
  process.env.RECODER_A2A_URL ||
  (process.env.RECODER_BRIDGE_URL && /\/agent-bridge\/?$/.test(process.env.RECODER_BRIDGE_URL)
    ? process.env.RECODER_BRIDGE_URL.replace('https:', 'wss:').replace('http:', 'ws:')
    : `${DOCKER_URL.replace('https:', 'wss:').replace('http:', 'ws:').replace(/\/+$/, '')}/agent-bridge`);
// Conductor (coding workspaces) lives on the backend Express server (PORT, default
// :3100) under /api/conductor. Accept either RECODER_CONDUCTOR_URL or the shorter
// CONDUCTOR_URL alias; both should point at that mount (e.g.
// http://localhost:3100/api/conductor). When only a backend base is given via
// RECODER_BACKEND_URL, derive the conductor mount from it. Falls back to the
// docker reverse-proxy path for hosted use.
const BACKEND_URL = process.env.RECODER_BACKEND_URL || '';
const CONDUCTOR_URL =
  process.env.RECODER_CONDUCTOR_URL ||
  process.env.CONDUCTOR_URL ||
  (BACKEND_URL ? `${BACKEND_URL.replace(/\/+$/, '')}/api/conductor` : `${DOCKER_URL}/api/conductor`);
const DAYTONA_URL = process.env.RECODER_DAYTONA_URL || 'http://localhost:3900/api';
const DAYTONA_KEY = process.env.DAYTONA_API_KEY || '';
const RAW_AUTH_TOKEN = process.env.RECODER_API_TOKEN || '';
const AGENT_ID = process.env.RECODER_AGENT_ID || 'claude_code';
const SESSION_ID = process.env.RECODER_SESSION_ID || `${AGENT_ID}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Bearer/session credential for the control plane + conductor. Accept the
// documented PLATFORM_TOKEN alias in addition to RECODER_SESSION_TOKEN.
const _creds = resolveCredentials({
  apiToken: RAW_AUTH_TOKEN,
  sessionToken: process.env.RECODER_SESSION_TOKEN || process.env.PLATFORM_TOKEN || '',
});
const PYTHON_API_KEY = _creds.pythonApiKey;
const PLATFORM_TOKEN = _creds.platformToken;

const buildPlatformHeaders = (extra = {}) => coreBuildPlatformHeaders(_creds, extra);
const buildPythonApiHeaders = (extra = {}) => coreBuildPythonApiHeaders(_creds, extra);
const hasPythonApiAuth = () => coreHasPythonApiAuth(_creds);
const hasPlatformAuth = () => coreHasPlatformAuth(_creds);

// ── Recoder capability tools (governed MCP interop host) ──
// The conductor injects RECODER_INTERNAL_URL + INTERNAL_SERVICE_KEY into the
// agent's launch env, so this stdio server can call the backend's gated MCP host
// (/api/mcp/tools/:server/:tool/call) on the agent's behalf. This bridges the
// polyglot capability stack (memory, and later beads/repo/browser) to the agent
// through the tools it already has — every call runs the authorize→risk→
// execute→audit gate. No secret is written anywhere; it lives only in env.
const INTERNAL_URL = process.env.RECODER_INTERNAL_URL || DOCKER_URL;
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const hasInteropAuth = () => Boolean(INTERNAL_SERVICE_KEY);

/**
 * Call one governed interop-host tool and return its `content`. Auth via the
 * internal service key the conductor injected. Throws a truthful error string
 * for the tool result when unconfigured or the gate denies.
 */
async function callInteropTool(serverId, toolName, args) {
  if (!hasInteropAuth()) {
    throw new Error('Recoder capability host not configured (no INTERNAL_SERVICE_KEY in this run).');
  }
  const actor = { agentId: AGENT_ID, permissions: { toolRules: [] } };
  const res = await fetch(
    `${INTERNAL_URL.replace(/\/+$/, '')}/api/mcp/tools/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}/call`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-service-key': INTERNAL_SERVICE_KEY },
      body: JSON.stringify({ actor, args }),
    },
  );
  const body = await res.json().catch(() => ({}));
  const data = body?.data ?? {};
  // The governance gate can deny or require approval — surface that truthfully.
  if (data.status === 'denied') {
    throw new Error(`capability denied by policy: ${data.reason || 'not allowed'}`);
  }
  if (data.status === 'needs_approval') {
    throw new Error(`capability needs approval before it can run: ${data.reason || ''}`.trim());
  }
  if (!res.ok || data.status !== 'completed') {
    throw new Error(data.error || body?.error || `capability call failed (HTTP ${res.status})`);
  }
  // Completed: the McpToolResult carries the real content.
  return data.result?.content ?? data.result ?? data;
}

// ── WebSocket A2A Bridge Connection ──

let ws = null;
let wsConnected = false;
let wsReconnectTimer = null;
let wsHeartbeatInterval = null;
let wsRetries = 0;
// Set when the bridge REJECTED the upgrade for auth (401/403): retrying cannot
// succeed until the operator provides a token, so reconnects are disabled.
let wsAuthRejected = false;
const WS_MAX_RETRIES = 9999; // effectively unlimited — reconnect until process exits

// Inbound task queue — tasks assigned to this agent by the bridge
const inboundTasks = [];    // { taskId, prompt, context, from, receivedAt, status: 'pending'|'accepted'|'completed'|'failed' }
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
      process.stderr.write(`[recoder-a2a] Registered on bridge: ${msg.agentId} session:${msg.sessionId || SESSION_ID} workspaces: ${JSON.stringify(msg.workspaces || [])}\n`);
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
      // Auto-acknowledge receipt
      wsSend({ type: 'task.progress', taskId: task.taskId, progress: 0, output: `Task received by ${AGENT_ID}` });
      // Push MCP notification so Claude Code sees the task immediately without polling
      const preview = task.prompt.slice(0, 120);
      pushNotification('info', `📨 New task [${task.taskId}] from ${task.from}: ${preview}${task.prompt.length > 120 ? '...' : ''} — run recoder_inbox to view`);
      break;
    }

    case 'task.cancelled': {
      const idx = inboundTasks.findIndex(t => t.taskId === msg.taskId);
      if (idx >= 0) inboundTasks[idx].status = 'cancelled';
      process.stderr.write(`[recoder-a2a] Task cancelled: ${msg.taskId}\n`);
      break;
    }

    case 'channel.message':
      process.stderr.write(`[recoder-a2a] Channel ${msg.channelId} from ${msg.from}: ${(msg.content || '').slice(0, 100)}\n`);
      break;

    case 'workspace.updated':
      process.stderr.write(`[recoder-a2a] Workspace updated: ${msg.workspaceId}\n`);
      break;

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
      // Heartbeat every 25s (server expects within 60s)
      wsHeartbeatInterval = setInterval(() => wsSend({ type: 'heartbeat' }), 25000);
    });
    ws.on('message', (data) => {
      try { handleBridgeMessage(JSON.parse(data.toString())); } catch {}
    });
    // An auth-rejected upgrade (401/403) will not fix itself by retrying —
    // surface the fix (set a token) once and disable the bridge quietly.
    ws.on('unexpected-response', (_req, res) => {
      wsConnected = false;
      if (res && (res.statusCode === 401 || res.statusCode === 403)) {
        wsAuthRejected = true;
        process.stderr.write(
          `[recoder-a2a] A2A bridge rejected the connection (${res.statusCode}) — set RECODER_SESSION_TOKEN/PLATFORM_TOKEN to enable the bridge. Not retrying.\n`,
        );
      }
      try { ws.terminate(); } catch {}
    });
    ws.on('close', () => {
      wsConnected = false;
      if (wsHeartbeatInterval) { clearInterval(wsHeartbeatInterval); wsHeartbeatInterval = null; }
      if (!wsAuthRejected && wsRetries < WS_MAX_RETRIES) {
        wsRetries++;
        const delay = Math.min(5000 * wsRetries, 30000);
        wsReconnectTimer = setTimeout(connectBridge, delay);
      }
    });
    ws.on('error', () => { wsConnected = false; });
  } catch {
    process.stderr.write('[recoder-a2a] ws module not found — A2A bridge disabled\n');
  }
}

// Connect in background (don't block MCP startup)
setTimeout(connectBridge, 500);

// ── MCP Protocol (JSON-RPC over stdio) ──

let buffer = '';
process.stdin.setEncoding('utf8');
// When the MCP host (Claude Code / the parent process) goes away, stdin ends.
// Exit instead of lingering as an orphan that keeps a bridge socket + timers
// alive forever (observed: orphaned servers pinning a CPU core).
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
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
    description: 'Check inbound tasks assigned to this agent via the A2A bridge. Shows pending tasks from other agents (Codex, recoder_web, etc).',
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
        status: { type: 'string', enum: ['complete', 'failed'], default: 'complete', description: 'Mark as complete or failed' },
      },
      required: ['task_id', 'result'],
    },
  },
  {
    name: 'recoder_workspace_create',
    description: 'Provision a conductor coding workspace (git worktree + agent run) for a task. Returns the workspace id and state.',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: { type: 'string', description: 'Owning Agent OS space id' },
        project_id: { type: 'string', description: 'Project id the workspace belongs to' },
        task_id: { type: 'string', description: 'Task id this workspace delivers' },
        repo_path: { type: 'string', description: 'Repo checkout path the conductor worktrees from' },
        prompt: { type: 'string', description: 'Task/prompt for the workspace agent (or provide command)' },
        command: { type: 'string', description: 'Raw command to run instead of an agent prompt' },
        branch: { type: 'string', description: 'Worktree branch name (optional)' },
        base_ref: { type: 'string', description: 'Base git ref to branch from (optional)' },
        runtime_id: { type: 'string', description: 'Runtime team id (optional — pal defaults it)' },
      },
      required: ['space_id', 'project_id', 'task_id', 'repo_path'],
    },
  },
  {
    name: 'recoder_workspace_diff',
    description: 'Get the reviewable diff of a workspace worktree against its base ref (stat + unified patch + untracked files).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace id to diff' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'recoder_workspace_status',
    description:
      'Observe conductor coding workspaces: list them all with their run state (queued/running/awaiting_review/merged…), or report one by id. Read-only — completes create→observe→diff→merge.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Optional: report a single workspace by id; omit to list all.',
        },
      },
      required: [],
    },
  },
  {
    name: 'recoder_workspace_events',
    description:
      'Read the RunEvents of a conductor workspace (lifecycle + agent output) — watch progress after create. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace id whose events to read' },
        limit: {
          type: 'number',
          description: 'Max most-recent events to return (default 40, max 200)',
        },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'recoder_workspace_merge',
    description: 'Merge a workspace PR. APPROVAL-GATED: the conductor enforces a delivery approval record and surfaces awaiting_approval instead of merging without one.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace id to merge' },
        strategy: { type: 'string', enum: ['squash', 'merge', 'rebase'], default: 'squash' },
        delete_branch: { type: 'boolean', description: 'Delete the branch after merge', default: false },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'recoder_memory_search',
    description: "Search Recoder's durable, reviewed memory for facts learned in prior runs (project conventions, gotchas, decisions). Use this BEFORE asking the user things that may already be known. Returns accepted memory items matching the query.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall (keywords or a question)' },
        scope: { type: 'string', description: 'Optional scope filter: repo | user | org | space | path | agent | task-type' },
        limit: { type: 'number', description: 'Max results (default all matches)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recoder_remember',
    description: "Propose a durable memory for Recoder to remember in future runs (a reusable fact/convention/gotcha). Requires evidence (a taskId + artifactId). The proposal is REVIEWED before it becomes durable — it is not written blindly. Use when you learn something worth persisting across sessions.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title of the fact' },
        body: { type: 'string', description: 'The fact/convention/gotcha to remember' },
        scope: { type: 'string', description: 'repo | user | org | space | path | agent | task-type (default repo)' },
        taskId: { type: 'string', description: 'Evidence: the task this was learned in' },
        artifactId: { type: 'string', description: 'Evidence: an artifact backing the fact' },
      },
      required: ['title', 'body', 'taskId', 'artifactId'],
    },
  },
  {
    name: 'recoder_issues_ready',
    description: "List the READY issues from Recoder's issue graph (beads/bd) — the unblocked work you can pick up. Use this to decide what to work on next.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'recoder_issue_create',
    description: 'Log a new issue in the Recoder issue graph (beads/bd) — e.g. discovered follow-up work. Returns the new issue id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Issue title' },
        description: { type: 'string', description: 'Optional details' },
      },
      required: ['title'],
    },
  },
  {
    name: 'recoder_issue_close',
    description: 'Close an issue in the Recoder issue graph (beads/bd) when its work is done.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue id (e.g. recoder-abcd)' },
        reason: { type: 'string', description: 'Why it is closed (e.g. "Completed")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'recoder_repo_search',
    description: "Search code — the local project (git grep, gitignore-aware) OR any GitHub repository. Pass `github` (owner/name) to search a remote repo, or `githubOwner` to search across an owner's repos; otherwise it searches the current project. Returns file:line (local) or repo/path + fragments (GitHub).",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pattern / code to search for' },
        repo: { type: 'string', description: 'Optional absolute LOCAL repo path (defaults to the current project)' },
        github: { type: 'string', description: 'Optional GitHub repo to search, as "owner/name" (uses gh code search)' },
        githubOwner: { type: 'string', description: "Optional GitHub owner/org to search across their repos" },
        language: { type: 'string', description: 'Optional language filter for GitHub search (e.g. typescript)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recoder_repo_diff',
    description: "See the repository's working-tree diff (stat + patch). Optionally against a base ref, or in another absolute repo path.",
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Optional base ref to diff against' },
        repo: { type: 'string', description: 'Optional absolute repo path' },
      },
    },
  },
  {
    name: 'recoder_browser_open',
    description: 'Open a URL in a real browser (headless) so you can VERIFY your own work — e.g. a preview or deployed page. Reuses one page per turn.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The URL to open' } },
      required: ['url'],
    },
  },
  {
    name: 'recoder_browser_verify',
    description: "Assert that text is present on the currently-open page (open one first with recoder_browser_open). Returns whether the expected content rendered — use it to CHECK your UI changes actually work.",
    inputSchema: {
      type: 'object',
      properties: {
        contains: { type: 'string', description: 'The text you expect to see on the page' },
        selector: { type: 'string', description: 'Optional CSS selector to scope the check (default body)' },
      },
      required: ['contains'],
    },
  },
  {
    name: 'recoder_request_approval',
    description: 'Request human approval before a sensitive action (e.g. pushing, deleting, a risky command). Records a pending approval in the control plane that a reviewer resolves. Use this instead of proceeding on your own for high-risk steps.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task this approval is for' },
        reason: { type: 'string', description: 'What you want to do and why it needs approval' },
        requiredAt: { type: 'string', description: 'before_push | before_pr | before_write | before_sensitive_action (default)' },
      },
      required: ['taskId', 'reason'],
    },
  },
  {
    name: 'recoder_attach_artifact',
    description: "Attach an output artifact (a report, summary, log, or result) to the task's audit trail so it is reviewable in the cockpit and provenance-tracked. Use this to record what you produced.",
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to attach the artifact to' },
        content: { type: 'string', description: 'The artifact content (text)' },
        kind: { type: 'string', description: 'report | log | diff | summary | … (default report)' },
        mimeType: { type: 'string', description: 'Default text/plain' },
      },
      required: ['taskId', 'content'],
    },
  },
  {
    name: 'recoder_github_search_repos',
    description: 'Find GitHub repositories by query (name, topic, description). Returns fullName, description, url, stars. Complements recoder_repo_search (which searches CODE).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Repo search query' } },
      required: ['query'],
    },
  },
  {
    name: 'recoder_github_pr_create',
    description: 'Open a GitHub pull request via gh (from the current repo/branch by default). APPROVAL-GATED — a PR is a customer-visible action; policy may require approval. Returns the PR url.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description' },
        repo: { type: 'string', description: 'owner/name (default: current repo)' },
        head: { type: 'string', description: 'Head branch (default: current)' },
        base: { type: 'string', description: 'Base branch' },
        draft: { type: 'boolean', description: 'Open as draft' },
      },
      required: ['title'],
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
      if (!hasPlatformAuth()) {
        return 'Error: A2A control plane not configured. Set RECODER_SESSION_TOKEN (or RECODER_API_TOKEN) to list tasks.';
      }
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
          requester: { agent_id: AGENT_ID, platform: AGENT_ID },
          assignee: { agent_id: args.target_agent, platform: args.target_agent },
          connector: { type: 'bridge', protocol: 'websocket', connector_id: 'mcp-bridge', platform: 'recoder' },
          payload: { intent: args.intent || 'execute', task: args.task },
        }),
      });
      return `Task created: ${data.data?.id || 'unknown'}\nState: ${data.data?.state || 'submitted'}\nTarget: ${args.target_agent}`;
    }

    case 'recoder_create_thread': {
      if (!hasPythonApiAuth()) {
        return 'Error: Recoder agents API not configured. Set RECODER_API_TOKEN (pk_/sk_ pair) or RECODER_SESSION_TOKEN to create threads.';
      }
      const authHeaders = buildPythonApiHeaders();
      const agentId = args.agent_id || process.env.RECODER_DEFAULT_AGENT_ID || '7e91f872-2407-42ac-bfcb-ea69a496e85c';

      const threadRes = await fetch(`${API_URL}/v1/threads`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const threadParsed = await readJsonResponse(threadRes);
      if (!threadParsed.ok || !threadParsed.data?.thread_id) {
        return `Error creating thread (HTTP ${threadParsed.status}): ${extractApiError(threadParsed)}`;
      }
      const threadId = threadParsed.data.thread_id;

      if (args.prompt) {
        const form = new URLSearchParams();
        form.append('prompt', args.prompt);
        form.append('thread_id', threadId);
        form.append('agent_id', agentId);
        const startRes = await fetch(`${API_URL}/v1/agent/start`, {
          method: 'POST',
          headers: buildPythonApiHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
          body: form.toString(),
        });
        const startParsed = await readJsonResponse(startRes);
        if (!startParsed.ok) {
          return `Thread: ${threadId} (created), but agent start failed (HTTP ${startParsed.status}): ${extractApiError(startParsed)}\nView: https://agents.recoder.xyz/thread/${threadId}`;
        }
        const startData = startParsed.data || {};
        return `Thread: ${threadId}\nStatus: ${startData.status || 'created'}\nRun: ${startData.agent_run_id || 'none'}\nView: https://agents.recoder.xyz/thread/${threadId}`;
      }
      return `Thread: ${threadId}\nView: https://agents.recoder.xyz/thread/${threadId}`;
    }

    case 'recoder_get_thread': {
      if (!hasPythonApiAuth()) {
        return 'Error: Recoder agents API not configured. Set RECODER_API_TOKEN (pk_/sk_ pair) or RECODER_SESSION_TOKEN to read threads.';
      }
      const authHeaders = buildPythonApiHeaders();
      const res = await fetch(`${API_URL}/v1/threads/${encodeURIComponent(args.thread_id)}/messages`, { headers: authHeaders });
      const parsed = await readJsonResponse(res);
      if (!parsed.ok) {
        return `Error fetching thread (HTTP ${parsed.status}): ${extractApiError(parsed)}`;
      }
      const messages = parsed.data;
      const msgs = Array.isArray(messages) ? messages : messages?.messages || messages?.items || [];
      if (!msgs.length) return 'No messages in this thread yet.';
      return msgs.map(m => {
        const role = m.role || m.type || '?';
        const content = typeof m.content === 'string' ? m.content : m.content?.content || JSON.stringify(m.content)?.slice(0, 200);
        return `[${role}] ${content}`;
      }).join('\n\n');
    }

    case 'recoder_sandbox_exec': {
      if (!DAYTONA_KEY) return `Error: DAYTONA_API_KEY not configured. DAYTONA_URL=${DAYTONA_URL}`;
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
            body: JSON.stringify(buildDaytonaCreateBody({
              snapshot: process.env.DAYTONA_SNAPSHOT || 'daytonaio/sandbox:0.5.0-slim',
              autoStopInterval: 10,
            })),
          });
        } catch (fetchErr) {
          return `Sandbox fetch error: ${fetchErr.message}\nURL: ${createUrl}\nDAYTONA_URL: ${DAYTONA_URL}`;
        }
        const createText = await createRes.text();
        if (!createRes.ok) {
          return `Error creating sandbox (HTTP ${createRes.status}): ${createText.slice(0, 300)}\nURL: ${createUrl}`;
        }
        let sb;
        try { sb = JSON.parse(createText); } catch { return `Sandbox response not JSON (HTTP ${createRes.status}):\n${createText.slice(0, 500)}\nURL: ${createUrl}\nDAYTONA_URL: ${DAYTONA_URL}`; }
        if (!sb.id) return `Error creating sandbox: ${JSON.stringify(sb)}`;
        sandboxId = sb.id;
        createdNew = true;
        await new Promise(r => setTimeout(r, 5000));
      }

      let execRes;
      const execUrl = `${baseUrl}/api/toolbox/${sandboxId}/toolbox/process/execute`;
      const shellCommand = `sh -c ${JSON.stringify(args.command)}`;
      try {
        execRes = await fetch(execUrl, {
          method: 'POST', headers: dHeaders,
          body: JSON.stringify({ command: shellCommand }),
        });
      } catch (fetchErr) {
        return `Sandbox exec fetch error: ${fetchErr.message}\nURL: ${execUrl}`;
      }
      const execText = await execRes.text();
      let result;
      try { result = JSON.parse(execText); } catch { return `Exec response not JSON (HTTP ${execRes.status}):\n${execText.slice(0, 500)}\nURL: ${execUrl}`; }

      // Auto-cleanup if we created it
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
        for (const t of recent) {
          lines.push(`• [${t.taskId}] ${t.status} from:${t.from}`);
        }
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
      // REST task: claim, then working, then completed/failed
      // State machine: submitted → working → completed|failed
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

      // First transition: submitted → working (required by state machine)
      // Ignore errors here — if task is already 'working', the next transition still succeeds
      try {
        await apiFetch(`${DOCKER_URL}/api/a2a/tasks/${args.task_id}/transition`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_state: 'working',
            triggered_by: `${AGENT_ID}:${SESSION_ID}`,
            reason: 'Task claimed and started',
          }),
        });
      } catch (workingErr) {
        // If already working or past it, continue — only fail if it's a real error
        if (!(workingErr.message || '').includes('422')) throw workingErr;
      }

      // Second transition: working → completed|failed
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

    case 'recoder_workspace_create': {
      if (!hasPlatformAuth()) {
        return 'Error: conductor not configured. Set RECODER_SESSION_TOKEN (or RECODER_API_TOKEN) to create a workspace.';
      }
      if (!args.prompt && !args.command) {
        return 'Error: provide one of prompt or command to launch a workspace.';
      }
      const body = {
        spaceId: args.space_id,
        projectId: args.project_id,
        taskId: args.task_id,
        repoPath: args.repo_path,
        createdBy: AGENT_ID,
      };
      if (args.prompt) body.prompt = args.prompt;
      if (args.command) body.command = args.command;
      if (args.branch) body.branch = args.branch;
      if (args.base_ref) body.baseRef = args.base_ref;
      if (args.runtime_id) body.runtimeId = args.runtime_id;
      const data = await apiFetch(`${CONDUCTOR_URL}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const ws = data.data || {};
      return `Workspace: ${ws.id || ws.workspaceId || 'unknown'}\nState: ${ws.state || 'created'}\nBranch: ${ws.branch || '(default)'}\nBase: ${ws.baseRef || '(default)'}`;
    }

    case 'recoder_workspace_diff': {
      if (!hasPlatformAuth()) {
        return 'Error: conductor not configured. Set RECODER_SESSION_TOKEN (or RECODER_API_TOKEN) to diff a workspace.';
      }
      const data = await apiFetch(`${CONDUCTOR_URL}/workspaces/${encodeURIComponent(args.workspace_id)}/diff`);
      const diff = data.data || {};
      const lines = [
        `Workspace: ${diff.workspaceId || args.workspace_id}`,
        `Base: ${diff.baseRef || '?'} | Branch: ${diff.branch || '?'} | Changed files: ${diff.changedFiles ?? '?'}`,
      ];
      if (diff.stat) lines.push(`\n── Stat ──\n${diff.stat}`);
      if (Array.isArray(diff.untracked) && diff.untracked.length) {
        lines.push(`\n── Untracked (${diff.untracked.length}) ──\n${diff.untracked.join('\n')}`);
      }
      if (diff.patch) lines.push(`\n── Patch ──\n${diff.patch.slice(0, 8000)}${diff.patch.length > 8000 ? '\n…(truncated)' : ''}`);
      return lines.join('\n');
    }

    case 'recoder_workspace_merge': {
      if (!hasPlatformAuth()) {
        return 'Error: conductor not configured. Set RECODER_SESSION_TOKEN (or RECODER_API_TOKEN) to merge a workspace.';
      }
      const data = await apiFetch(`${CONDUCTOR_URL}/workspaces/${encodeURIComponent(args.workspace_id)}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: args.strategy || 'squash',
          deleteBranch: args.delete_branch === true,
        }),
      });
      const res = data.data || {};
      return `Workspace: ${res.workspaceId || args.workspace_id}\nBranch: ${res.branch || '?'}\nMerged: ${res.merged === true ? 'yes' : 'no'}`;
    }

    case 'recoder_memory_search': {
      if (!hasInteropAuth()) {
        return 'Recoder memory is not available in this run (no INTERNAL_SERVICE_KEY). It works inside a Recoder workspace.';
      }
      try {
        const content = await callInteropTool('recoder.memory', 'memory.search', {
          query: String(args.query || ''),
          scope: args.scope,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        });
        const items = Array.isArray(content) ? content : [];
        if (!items.length) return `No durable memory found for "${args.query}".`;
        return items
          .map((m) => `• [${m.scope || '?'}] ${m.title || '(untitled)'}\n  ${(m.body || '').slice(0, 400)}`)
          .join('\n');
      } catch (err) {
        return `memory search: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_remember': {
      if (!hasInteropAuth()) {
        return 'Recoder memory is not available in this run (no INTERNAL_SERVICE_KEY). It works inside a Recoder workspace.';
      }
      try {
        const candidate = await callInteropTool('recoder.memory', 'memory.candidate.create', {
          title: String(args.title || ''),
          body: String(args.body || ''),
          scope: args.scope || 'repo',
          evidence: { taskId: String(args.taskId || ''), artifactId: String(args.artifactId || '') },
        });
        const id = candidate?.candidateId || candidate?.id || '(pending)';
        return `Proposed memory "${args.title}" (candidate ${id}). It will become durable after review — not written blindly.`;
      } catch (err) {
        return `remember: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_issues_ready': {
      if (!hasInteropAuth()) {
        return 'Recoder issue graph is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.beads', 'beads.ready', {});
        const items = Array.isArray(content) ? content : [];
        if (!items.length) return 'No ready issues.';
        return items
          .map((i) => `• ${i.id || '?'} [${i.priority ?? '?'}] ${i.title || '(untitled)'}`)
          .join('\n');
      } catch (err) {
        return `issues: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_issue_create': {
      if (!hasInteropAuth()) {
        return 'Recoder issue graph is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.beads', 'beads.create', {
          title: String(args.title || ''),
          description: args.description,
        });
        const id = content?.id || content?.issueId || '(created)';
        return `Created issue ${id}: ${args.title}`;
      } catch (err) {
        return `issue create: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_issue_close': {
      if (!hasInteropAuth()) {
        return 'Recoder issue graph is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        await callInteropTool('recoder.beads', 'beads.close', {
          id: String(args.id || ''),
          reason: args.reason,
        });
        return `Closed issue ${args.id}.`;
      } catch (err) {
        return `issue close: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_repo_search': {
      if (!hasInteropAuth()) {
        return 'Recoder repo search is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.repo', 'repo.search', {
          query: String(args.query || ''),
          repo: args.repo,
          github: args.github,
          githubOwner: args.githubOwner,
          language: args.language,
        });
        const matches = content?.matches || [];
        if (!matches.length) return `No matches for "${args.query}".`;
        // GitHub results are objects (repo/path/fragments); local are strings.
        if (content?.source === 'github') {
          return matches
            .map((m) => `• ${m.repo}/${m.path}${m.fragments?.length ? `\n  ${m.fragments.join('\n  ')}` : ''}`)
            .join('\n');
        }
        return matches.join('\n');
      } catch (err) {
        return `repo search: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_repo_diff': {
      if (!hasInteropAuth()) {
        return 'Recoder repo diff is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.repo', 'repo.diff', {
          base: args.base,
          repo: args.repo,
        });
        const stat = content?.stat || '(no changes)';
        const patch = content?.patch || '';
        return `${stat}\n\n${patch}`.trim();
      } catch (err) {
        return `repo diff: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_request_approval': {
      if (!hasInteropAuth()) {
        return 'Recoder approvals are not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.approvals', 'approvals.request', {
          taskId: String(args.taskId || ''),
          reason: String(args.reason || ''),
          requiredAt: args.requiredAt,
        });
        const id = content?.approvalId || '(pending)';
        return `Requested approval ${id} (status: ${content?.status || 'pending'}). A reviewer must resolve it before the action proceeds.`;
      } catch (err) {
        return `request approval: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_attach_artifact': {
      if (!hasInteropAuth()) {
        return 'Recoder artifacts are not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.artifacts', 'artifacts.create', {
          taskId: String(args.taskId || ''),
          content: String(args.content || ''),
          kind: args.kind,
          mimeType: args.mimeType,
        });
        const id = content?.artifactId || '(created)';
        return `Attached artifact ${id} to task ${args.taskId}.`;
      } catch (err) {
        return `attach artifact: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_github_search_repos': {
      if (!hasInteropAuth()) {
        return 'Recoder GitHub is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.github', 'github.search', {
          query: String(args.query || ''),
        });
        const repos = Array.isArray(content) ? content : [];
        if (!repos.length) return `No repositories found for "${args.query}".`;
        return repos
          .map((r) => `• ${r.fullName} ★${r.stargazersCount ?? '?'} — ${(r.description || '').slice(0, 100)}\n  ${r.url || ''}`)
          .join('\n');
      } catch (err) {
        return `github search: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_github_pr_create': {
      if (!hasInteropAuth()) {
        return 'Recoder GitHub is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.github', 'github.pr.create', {
          title: String(args.title || ''),
          body: args.body,
          repo: args.repo,
          head: args.head,
          base: args.base,
          draft: args.draft === true,
        });
        return `Opened PR: ${content?.url || '(created)'}`;
      } catch (err) {
        return `github pr create: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_browser_open': {
      if (!hasInteropAuth()) {
        return 'Recoder browser is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.browser', 'browser.open', {
          url: String(args.url || ''),
        });
        return `Opened ${content?.url || args.url}. Use recoder_browser_verify to check the page content.`;
      } catch (err) {
        return `browser open: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_browser_verify': {
      if (!hasInteropAuth()) {
        return 'Recoder browser is not available in this run (no INTERNAL_SERVICE_KEY).';
      }
      try {
        const content = await callInteropTool('recoder.browser', 'browser.verify', {
          contains: String(args.contains || ''),
          selector: args.selector,
        });
        return content?.present
          ? `✓ Present: the page contains "${args.contains}".`
          : `✗ Not found: the page does NOT contain "${args.contains}".`;
      } catch (err) {
        return `browser verify: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case 'recoder_workspace_status': {
      if (!hasPlatformAuth()) {
        return 'Error: conductor not configured. Set RECODER_SESSION_TOKEN (or RECODER_API_TOKEN) to view workspaces.';
      }
      // Read the conductor board (GET /workspaces). With workspace_id, report that
      // one; otherwise list them all. Uses only the list endpoint (degrade-safe).
      const data = await apiFetch(`${CONDUCTOR_URL}/workspaces`);
      const list = Array.isArray(data.data) ? data.data : [];
      if (args.workspace_id) {
        const ws = list.find((w) => (w.workspaceId || w.id) === args.workspace_id);
        if (!ws) return `Workspace ${args.workspace_id} not found.`;
        return `Workspace: ${ws.workspaceId || ws.id}\nState: ${ws.state || '?'}\nRuntime: ${ws.runtimeId || '?'} | Substrate: ${ws.substrate || '?'}\nBranch: ${ws.branch || '(default)'} | Base: ${ws.baseRef || '(default)'}`;
      }
      if (!list.length) return 'No conductor workspaces.';
      const lines = list.map(
        (ws) =>
          `• ${ws.workspaceId || ws.id || '?'} [${ws.state || '?'}] ${ws.runtimeId || ''}${ws.branch ? ` (${ws.branch})` : ''}`,
      );
      return `Conductor workspaces (${list.length}):\n${lines.join('\n')}`;
    }

    case 'recoder_workspace_events': {
      if (!hasPlatformAuth()) {
        return 'Error: conductor not configured. Set RECODER_SESSION_TOKEN (or RECODER_API_TOKEN) to read workspace events.';
      }
      const data = await apiFetch(
        `${CONDUCTOR_URL}/workspaces/${encodeURIComponent(args.workspace_id)}/events`,
      );
      const events = Array.isArray(data.data) ? data.data : [];
      if (!events.length) return `No events yet for workspace ${args.workspace_id}.`;
      const limit = Math.max(1, Math.min(Number(args.limit) || 40, 200));
      const recent = events.slice(-limit);
      const lines = recent.map((e) => {
        const t = e.timestamp || e.at || '';
        const type = e.type || e.kind || 'event';
        const msg =
          e.message || e.text || e.summary || (e.data ? JSON.stringify(e.data).slice(0, 200) : '');
        return `[${t}] ${type}${msg ? ` — ${msg}` : ''}`;
      });
      return `Events for ${args.workspace_id} (${recent.length}/${events.length}):\n${lines.join('\n')}`;
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
        serverInfo: { name: 'recoder-a2a', version: '3.2.0' },
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

process.stderr.write('[recoder-a2a] Recoder A2A MCP Server v3.2.0\n');
process.stderr.write(`[recoder-a2a] API: ${API_URL} | A2A: ${A2A_URL}\n`);
process.stderr.write(`[recoder-a2a] Conductor: ${CONDUCTOR_URL}\n`);
if (DAYTONA_KEY) process.stderr.write('[recoder-a2a] Daytona sandbox enabled\n');
if (PLATFORM_TOKEN || PYTHON_API_KEY) process.stderr.write('[recoder-a2a] API auth configured\n');
else process.stderr.write('[recoder-a2a] No platform auth — set PLATFORM_TOKEN/RECODER_SESSION_TOKEN/RECODER_API_TOKEN for conductor + task tools\n');
