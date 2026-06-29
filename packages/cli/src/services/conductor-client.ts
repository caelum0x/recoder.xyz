/**
 * Conductor API client — typed end-to-end client for `/api/conductor/*`.
 *
 * The conductor is the parallel-agent control plane: workspaces (isolated git
 * worktree + branch + tmux session) and raw tmux sessions. This client mirrors
 * the backend route contract in docker-backend/src/conductor/conductor.routes.ts
 * exactly, including the `{ success, data, error }` response envelope.
 *
 * Auth + base URL are resolved via `recoder-config` (env-first, then the
 * device-flow token store). Degrade-safe: every method surfaces a typed result
 * and never throws raw Axios errors at the command layer.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { resolveBackendUrl, resolveCredential } from './recoder-config';

/** Mirror of the agent-os Workspace domain (subset the CLI renders). */
export interface ConductorWorkspace {
  workspaceId: string;
  spaceId: string;
  projectId: string;
  taskId: string;
  runId?: string;
  runtimeId: string;
  substrate: string;
  branch: string;
  baseRef: string;
  worktreePath?: string;
  sessionName?: string;
  state: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateWorkspaceInput {
  spaceId: string;
  projectId: string;
  taskId: string;
  repoPath: string;
  createdBy: string;
  /** One of command|prompt is required. */
  command?: string;
  prompt?: string;
  /** Optional — when omitted the backend planner (@recoder/pal) defaults it. */
  runtimeId?: string;
  substrate?: string;
  model?: string;
  branch?: string;
  baseRef?: string;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceDiff {
  files?: Array<{ path: string; additions?: number; deletions?: number; status?: string }>;
  patch?: string;
  [k: string]: unknown;
}

export interface MergeResult {
  state?: string;
  merged?: boolean;
  [k: string]: unknown;
}

export interface PrResult {
  url?: string;
  number?: number;
  state?: string;
  [k: string]: unknown;
}

export interface ConductorSession {
  sessionId: string;
  [k: string]: unknown;
}

export interface ConductorHealth {
  available?: boolean;
  reason?: string;
  [k: string]: unknown;
}

/**
 * Typed result so callers can branch on `ok` without try/catch noise.
 *
 * Deliberately a flat shape (not a discriminated union) so that field access
 * works under both `strict: true` and `strict: false` compilers — the build
 * config disables control-flow narrowing, so `result.error` must be reachable
 * without first narrowing on `result.ok`. On success `data` is set and
 * `error` is undefined; on failure `data` is undefined and `error` is set.
 */
export interface ClientResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  needsAuth?: boolean;
}

export interface ConductorClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class ConductorClient {
  private readonly http: AxiosInstance;
  readonly baseUrl: string;

  constructor(options: ConductorClientOptions = {}) {
    this.baseUrl = resolveBackendUrl(options.baseUrl);
    this.http = axios.create({
      baseURL: `${this.baseUrl}/api/conductor`,
      timeout: options.timeoutMs ?? 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-cli-conductor/1.0.0',
      },
      // We interpret non-2xx ourselves to read the error envelope.
      validateStatus: () => true,
    });

    this.http.interceptors.request.use((config) => {
      const cred = resolveCredential();
      if (cred && config.headers) {
        config.headers.set(cred.header, cred.value);
      }
      return config;
    });
  }

  /** True when a credential is resolvable (env or device-flow store). */
  hasCredential(): boolean {
    return resolveCredential() !== null;
  }

  // --- Health + sessions ---------------------------------------------------

  async health(): Promise<ClientResult<ConductorHealth>> {
    return this.request<ConductorHealth>('get', '/health');
  }

  async listSessions(): Promise<ClientResult<ConductorSession[]>> {
    return this.request<ConductorSession[]>('get', '/sessions');
  }

  // --- Workspaces ----------------------------------------------------------

  async listWorkspaces(): Promise<ClientResult<ConductorWorkspace[]>> {
    return this.request<ConductorWorkspace[]>('get', '/workspaces');
  }

  async getWorkspace(workspaceId: string): Promise<ClientResult<ConductorWorkspace>> {
    return this.request<ConductorWorkspace>('get', `/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<ClientResult<ConductorWorkspace>> {
    return this.request<ConductorWorkspace>('post', '/workspaces', input);
  }

  async diffWorkspace(workspaceId: string): Promise<ClientResult<WorkspaceDiff>> {
    return this.request<WorkspaceDiff>('get', `/workspaces/${encodeURIComponent(workspaceId)}/diff`);
  }

  async mergeWorkspace(
    workspaceId: string,
    options: { strategy?: string; deleteBranch?: boolean } = {},
  ): Promise<ClientResult<MergeResult>> {
    return this.request<MergeResult>(
      'post',
      `/workspaces/${encodeURIComponent(workspaceId)}/merge`,
      options,
    );
  }

  async openPr(
    workspaceId: string,
    options: { title?: string; body?: string; base?: string; draft?: boolean; remote?: string } = {},
  ): Promise<ClientResult<PrResult>> {
    return this.request<PrResult>(
      'post',
      `/workspaces/${encodeURIComponent(workspaceId)}/pr`,
      options,
    );
  }

  async archiveWorkspace(workspaceId: string): Promise<ClientResult<ConductorWorkspace>> {
    return this.request<ConductorWorkspace>(
      'post',
      `/workspaces/${encodeURIComponent(workspaceId)}/archive`,
    );
  }

  // --- Transport -----------------------------------------------------------

  private async request<T>(
    method: 'get' | 'post' | 'delete',
    url: string,
    body?: unknown,
  ): Promise<ClientResult<T>> {
    try {
      const response = await this.http.request({ method, url, data: body });
      const status = response.status;
      const payload = response.data as { success?: boolean; data?: T; error?: string } | undefined;

      if (status >= 200 && status < 300 && payload?.success !== false) {
        return { ok: true, data: (payload?.data ?? (payload as unknown)) as T };
      }

      const error = payload?.error || `request failed with status ${status}`;
      const needsAuth = status === 401 || status === 403;
      return { ok: false, error, status, needsAuth };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
        return { ok: false, error: `cannot reach backend at ${this.baseUrl} (${axiosErr.code})` };
      }
      return { ok: false, error: axiosErr.message || 'request failed' };
    }
  }
}

export function createConductorClient(options?: ConductorClientOptions): ConductorClient {
  return new ConductorClient(options);
}
