/**
 * Conductor API client — every panel renders from a REAL fetch to
 * `${backendUrl}/api/conductor/...`. No mock data anywhere.
 *
 * Endpoints wired (docker-backend/src/conductor/conductor.routes.ts, mounted at
 * /api/conductor in server.ts):
 *   GET  /workspaces                      list board cards
 *   POST /workspaces                      create a workspace
 *   GET  /workspaces/:id                  detail
 *   GET  /workspaces/:id/events           live RunEvent log
 *   GET  /workspaces/:id/diff             reviewable diff
 *   POST /workspaces/:id/pr               open PR
 *   POST /workspaces/:id/merge            merge
 *   POST /workspaces/:id/archive          archive
 *   GET  /runtimes                        runtime availability strip
 *   GET  /substrates                      substrate availability strip
 *   POST /reconcile                       reconcile persisted state vs substrate
 *   GET  /health                          conductor availability
 *   GET  /sessions                        live tmux+worktree agent sessions
 *   POST /sessions                        start an interactive tmux session
 *   GET  /sessions/:id/output             capture the tmux pane output
 *   POST /sessions/:id/keys               drive the session (send keys)
 *   DELETE /sessions/:id                  kill a session
 *   GET  /dmux                            dmux operator-console status + grid
 *   POST /dmux/launch                     launch the dmux console for a repo
 *
 * Sibling control-plane route (NOT under /api/conductor):
 *   GET  /api/connectors                  per-channel connector health
 */
import type {
  ApiEnvelope,
  ConductorSession,
  ConnectorsHealth,
  CreatePrResult,
  CreateWorkspaceBody,
  DmuxLaunchBody,
  DmuxLaunchResult,
  DmuxStatus,
  MergeResult,
  RunEvent,
  RuntimeAvailability,
  SessionOutput,
  StartSessionBody,
  SubstrateAvailability,
  Workspace,
  WorkspaceDiff,
} from '../types';
import { readConfig } from './config';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Raised when the backend reachably rejects the request as unauthenticated
 * (HTTP 401/403). Distinct from BackendUnreachableError so the cockpit can show
 * a real "Sign in" panel instead of a misleading "backend unreachable" banner.
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'UnauthorizedError';
  }
}

/** Raised when the backend cannot be reached at all (no HTTP response). */
export class BackendUnreachableError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'BackendUnreachableError';
    this.cause = cause;
  }
}

function buildHeaders(hasBody: boolean): Record<string, string> {
  const { token } = readConfig();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Core request against an absolute API base under the backend origin. Shared by
 * the conductor client (`/api/conductor`) and sibling control-plane routes that
 * live elsewhere (e.g. `/api/connectors`). Same envelope handling, same
 * BackendUnreachable/Unauthorized classification — no mock fallbacks.
 */
async function requestAt<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const { backendUrl } = readConfig();
  const url = `${backendUrl}${base}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new BackendUnreachableError(
      `Cannot reach Recoder backend at ${backendUrl}`,
      err,
    );
  }

  let envelope: ApiEnvelope<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      envelope = null;
    }
  }

  if (!res.ok || (envelope && envelope.success === false)) {
    const message =
      (envelope && envelope.error) ||
      `${method} ${path} failed with status ${res.status}`;
    // 401/403 means the backend is reachable but the request is unauthenticated.
    // Surface this distinctly so the cockpit prompts a real sign-in.
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedError(message, res.status);
    }
    throw new ApiError(message, res.status);
  }

  if (envelope && 'data' in envelope) {
    return envelope.data as T;
  }
  // Some success responses (e.g. DELETE) carry no data field.
  return undefined as unknown as T;
}

/** Conductor-scoped request: every call hits `${backendUrl}/api/conductor/...`. */
function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/conductor', method, path, body);
}

export const api = {
  health: () =>
    request<{ available: boolean; git?: boolean; tmux?: boolean; tmuxBin?: string; reason?: string }>(
      'GET',
      '/health',
    ),
  listWorkspaces: () => request<Workspace[]>('GET', '/workspaces'),
  getWorkspace: (id: string) => request<Workspace>('GET', `/workspaces/${encodeURIComponent(id)}`),
  createWorkspace: (body: CreateWorkspaceBody) => request<Workspace>('POST', '/workspaces', body),
  listEvents: (id: string) =>
    request<RunEvent[]>('GET', `/workspaces/${encodeURIComponent(id)}/events`),
  diff: (id: string) => request<WorkspaceDiff>('GET', `/workspaces/${encodeURIComponent(id)}/diff`),
  openPr: (id: string, body: { title: string; body?: string; base?: string; draft?: boolean }) =>
    request<CreatePrResult>('POST', `/workspaces/${encodeURIComponent(id)}/pr`, body),
  merge: (id: string, body: { strategy?: 'squash' | 'merge' | 'rebase'; deleteBranch?: boolean }) =>
    request<MergeResult>('POST', `/workspaces/${encodeURIComponent(id)}/merge`, body),
  archive: (id: string) => request<Workspace>('POST', `/workspaces/${encodeURIComponent(id)}/archive`),
  reconcile: () => request<unknown>('POST', '/reconcile'),
  runtimes: () => request<RuntimeAvailability[]>('GET', '/runtimes'),
  substrates: () => request<SubstrateAvailability[]>('GET', '/substrates'),

  // --- Interactive tmux sessions ---
  listSessions: () => request<ConductorSession[]>('GET', '/sessions'),
  startSession: (body: StartSessionBody) => request<ConductorSession>('POST', '/sessions', body),
  sessionOutput: (id: string, lines = 200) =>
    request<SessionOutput>('GET', `/sessions/${encodeURIComponent(id)}/output?lines=${lines}`),
  sessionKeys: (id: string, keys: string) =>
    request<void>('POST', `/sessions/${encodeURIComponent(id)}/keys`, { keys }),
  killSession: (id: string, keepWorktree = false) =>
    request<void>('DELETE', `/sessions/${encodeURIComponent(id)}${keepWorktree ? '?keepWorktree=true' : ''}`),

  // --- dmux operator console ---
  dmux: () => request<DmuxStatus>('GET', '/dmux'),
  dmuxLaunch: (body: DmuxLaunchBody) => request<DmuxLaunchResult>('POST', '/dmux/launch', body),

  // --- connectors (chat-channel bridge) ---
  // NOTE: this route is mounted at /api/connectors, NOT under /api/conductor.
  connectors: () => requestAt<ConnectorsHealth>('/api/connectors', 'GET', '/'),
};
