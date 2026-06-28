/**
 * stub-conductor — a REAL in-process HTTP server that speaks the conductor
 * control-plane wire protocol the cockpit's api client talks to.
 *
 * This is an EXTERNAL SEAM the integration test owns, NOT a mock of the cockpit:
 * the cockpit's production `api` client, `usePoll`, state machine, and Preact
 * components run unmodified and hit this server over a real TCP socket with a
 * real `fetch`. The server returns the exact `{ success, data }` envelopes and
 * the exact JSON shapes documented in:
 *   - packages/agent-os/src/domain/workspace.ts (Workspace, WorkspaceState)
 *   - packages/agent-os/src/domain/event.ts (RunEvent)
 *   - docker-backend/src/conductor/conductor.routes.ts (routes + envelopes)
 *
 * State is mutable and driven by the cockpit's real requests so the integration
 * test can walk the create -> events -> diff -> terminate lifecycle and assert
 * the board reflects each transition — the same way the live backend would, only
 * deterministic and offline.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type {
  ConnectorsHealth,
  CreateWorkspaceBody,
  RunEvent,
  RuntimeAvailability,
  SubstrateAvailability,
  Workspace,
  WorkspaceDiff,
  WorkspaceState,
} from '../types';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}${Date.now().toString(36)}`;
}

/** A stub conductor instance: a running server plus operator-side controls. */
export interface StubConductor {
  /** Origin the cockpit should be pointed at, e.g. http://127.0.0.1:53121 */
  baseUrl: string;
  /** Snapshot the current workspaces (what GET /workspaces would return). */
  workspaces(): Workspace[];
  /**
   * Drive a server-side state transition for a workspace, as the live conductor
   * would when the agent/substrate makes progress. Also appends a real
   * state_transition RunEvent so the cockpit's event log reflects it.
   */
  advance(workspaceId: string, state: WorkspaceState, message?: string): void;
  /** Append an arbitrary RunEvent for a workspace (e.g. a log line). */
  emit(workspaceId: string, event: Omit<RunEvent, 'eventId' | 'createdAt' | 'taskId'>): void;
  /** How many times POST /workspaces/:id/archive was called. */
  archiveCalls(): number;
  /** Stop listening and free the port. */
  close(): Promise<void>;
}

interface StubState {
  workspaces: Map<string, Workspace>;
  events: Map<string, RunEvent[]>;
  archiveCount: number;
}

const RUNTIMES: RuntimeAvailability[] = [
  { runtimeId: 'claude', bin: 'claude', available: true, path: '/usr/local/bin/claude' },
  { runtimeId: 'codex', bin: 'codex', available: false },
];

const SUBSTRATES: SubstrateAvailability[] = [
  { id: 'tmux_worktree', available: true },
  { id: 'daytona', available: false, reason: 'DAYTONA_API_KEY not set' },
];

const CONNECTORS: ConnectorsHealth = { active: false, dispatchReady: false, channels: [] };

function nowIso(): string {
  return new Date().toISOString();
}

function makeWorkspace(body: CreateWorkspaceBody): Workspace {
  const id = nextId('ws');
  const branch = body.branch || `conductor/${id}`;
  return {
    workspaceId: id,
    spaceId: body.spaceId,
    projectId: body.projectId,
    taskId: body.taskId,
    runtimeId: body.runtimeId,
    substrate: body.substrate || 'tmux_worktree',
    branch,
    baseRef: body.baseRef || 'main',
    worktreePath: `/tmp/worktrees/${id}`,
    sessionName: `recoder-${id}`,
    state: 'created',
    createdBy: body.createdBy,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    metadata: {},
  };
}

function makeEvent(
  taskId: string,
  partial: Omit<RunEvent, 'eventId' | 'createdAt' | 'taskId'>,
): RunEvent {
  return { eventId: nextId('evt'), createdAt: nowIso(), taskId, ...partial };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Build the diff a workspace exposes once it has produced work. Deterministic so
 * the test can assert the cockpit renders the real patch text it received.
 */
function diffFor(ws: Workspace): WorkspaceDiff {
  const patch = [
    `diff --git a/README.md b/README.md`,
    `index 0000001..0000002 100644`,
    `--- a/README.md`,
    `+++ b/README.md`,
    `@@ -1,1 +1,2 @@`,
    ` # ${ws.projectId}`,
    `+Added by ${ws.runtimeId} on ${ws.branch}`,
  ].join('\n');
  return {
    workspaceId: ws.workspaceId,
    baseRef: ws.baseRef,
    branch: ws.branch,
    stat: ' README.md | 1 +\n 1 file changed, 1 insertion(+)',
    patch,
    untracked: [],
    changedFiles: 1,
  };
}

function handle(state: StubState, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', 'http://stub.local');
  const path = url.pathname;
  const method = (req.method || 'GET').toUpperCase();

  // --- conductor health/availability strip ---
  if (method === 'GET' && path === '/api/conductor/health') {
    return sendJson(res, 200, { success: true, data: { available: true, git: true, tmux: true, tmuxBin: '/usr/bin/tmux' } });
  }
  if (method === 'GET' && path === '/api/conductor/runtimes') {
    return sendJson(res, 200, { success: true, data: RUNTIMES });
  }
  if (method === 'GET' && path === '/api/conductor/substrates') {
    return sendJson(res, 200, { success: true, data: SUBSTRATES });
  }
  if (method === 'GET' && path === '/api/connectors/') {
    return sendJson(res, 200, { success: true, data: CONNECTORS });
  }
  if (method === 'GET' && path === '/api/conductor/dmux') {
    // Real-shaped DmuxStatus: dmux available, observing no extra sessions.
    return sendJson(res, 200, {
      success: true,
      data: {
        available: true,
        bin: '/usr/local/bin/dmux',
        vendored: false,
        tmuxBin: '/usr/bin/tmux',
        tmuxPinned: false,
        visibleSessions: [],
      },
    });
  }

  // --- board ---
  if (method === 'GET' && path === '/api/conductor/workspaces') {
    return sendJson(res, 200, { success: true, data: [...state.workspaces.values()] });
  }
  if (method === 'POST' && path === '/api/conductor/workspaces') {
    void readBody(req).then((body) => {
      const ws = makeWorkspace(body as CreateWorkspaceBody);
      state.workspaces.set(ws.workspaceId, ws);
      state.events.set(ws.workspaceId, [
        makeEvent(ws.taskId, { type: 'started', state: 'created', message: 'workspace created' }),
      ]);
      sendJson(res, 200, { success: true, data: ws });
    });
    return;
  }

  // --- per-workspace routes ---
  const wsMatch = path.match(/^\/api\/conductor\/workspaces\/([^/]+)(\/(events|diff|pr|merge|archive))?$/);
  if (wsMatch) {
    const id = decodeURIComponent(wsMatch[1]);
    const sub = wsMatch[3];
    const ws = state.workspaces.get(id);
    if (!ws) {
      return sendJson(res, 404, { success: false, error: `workspace ${id} not found` });
    }

    if (method === 'GET' && !sub) {
      return sendJson(res, 200, { success: true, data: ws });
    }
    if (method === 'GET' && sub === 'events') {
      return sendJson(res, 200, { success: true, data: state.events.get(id) || [] });
    }
    if (method === 'GET' && sub === 'diff') {
      return sendJson(res, 200, { success: true, data: diffFor(ws) });
    }
    if (method === 'POST' && sub === 'archive') {
      state.archiveCount += 1;
      const archived: Workspace = { ...ws, state: 'archived', updatedAt: nowIso(), archivedAt: nowIso() };
      state.workspaces.set(id, archived);
      const log = state.events.get(id) || [];
      log.push(makeEvent(ws.taskId, { type: 'state_transition', state: 'archived', message: 'archived by operator' }));
      state.events.set(id, log);
      return sendJson(res, 200, { success: true, data: archived });
    }
    // pr/merge are not exercised by this test; reply with a truthful 405.
    return sendJson(res, 405, { success: false, error: `${method} ${path} not handled by stub` });
  }

  if (method === 'POST' && path === '/api/conductor/reconcile') {
    return sendJson(res, 200, { success: true });
  }

  sendJson(res, 404, { success: false, error: `no stub route for ${method} ${path}` });
}

/** Boot a stub conductor on an ephemeral port and resolve once it is listening. */
export async function startStubConductor(): Promise<StubConductor> {
  const state: StubState = { workspaces: new Map(), events: new Map(), archiveCount: 0 };
  const server: Server = createServer((req, res) => {
    try {
      handle(state, req, res);
    } catch (err) {
      sendJson(res, 500, { success: false, error: err instanceof Error ? err.message : 'stub error' });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('stub conductor failed to bind a TCP port');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    workspaces: () => [...state.workspaces.values()],
    advance(workspaceId, nextState, message) {
      const ws = state.workspaces.get(workspaceId);
      if (!ws) throw new Error(`advance: unknown workspace ${workspaceId}`);
      const updated: Workspace = { ...ws, state: nextState, updatedAt: nowIso() };
      state.workspaces.set(workspaceId, updated);
      const log = state.events.get(workspaceId) || [];
      log.push(makeEvent(ws.taskId, { type: 'state_transition', state: nextState, message: message || `-> ${nextState}` }));
      state.events.set(workspaceId, log);
    },
    emit(workspaceId, event) {
      const ws = state.workspaces.get(workspaceId);
      if (!ws) throw new Error(`emit: unknown workspace ${workspaceId}`);
      const log = state.events.get(workspaceId) || [];
      log.push(makeEvent(ws.taskId, event));
      state.events.set(workspaceId, log);
    },
    archiveCalls: () => state.archiveCount,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
