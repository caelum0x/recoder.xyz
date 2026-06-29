/**
 * ConductorClient — the typed web client for the Recoder Conductor control plane.
 *
 * Wraps the real routes in docker-backend/src/conductor/conductor.routes.ts
 * (mounted under /api/conductor). Every response uses the {success,data}
 * envelope; this client unwraps `data` and throws a typed {@link ConductorError}
 * on `{success:false}` or a non-2xx status.
 */
import type {
  ConductorAvailability,
  ConductorClientOptions,
  CreatePrResult,
  CreateWorkspaceInput,
  MergeResult,
  RunEvent,
  RunEventHandler,
  RuntimeAvailability,
  StreamHandle,
  Workspace,
  WorkspaceDiff,
  WorkspaceOutput,
  WorkspaceStatus,
  WebSocketCtor,
} from './types.js';

/** Thrown when the conductor backend returns `{success:false}` or a non-2xx status. */
export class ConductorError extends Error {
  /** HTTP status code, when the failure came from an HTTP response. */
  readonly status?: number;
  /** Structured `data` the backend attached to the failure (e.g. delivery-gate detail). */
  readonly data?: unknown;

  constructor(message: string, options?: { status?: number; data?: unknown }) {
    super(message);
    this.name = 'ConductorError';
    this.status = options?.status;
    this.data = options?.data;
  }
}

const DEFAULT_BASE_PATH = '/api/conductor';
const DEFAULT_POLL_INTERVAL_MS = 1500;

/** Typed client for the conductor control plane. */
export class ConductorClient {
  readonly #baseUrl: string;
  readonly #basePath: string;
  readonly #apiKey?: string;
  readonly #fetch: typeof fetch;
  readonly #WebSocketImpl?: WebSocketCtor;

  constructor(options: ConductorClientOptions) {
    if (!options?.baseUrl) {
      throw new ConductorError('ConductorClient requires a baseUrl');
    }
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#basePath = (options.basePath ?? DEFAULT_BASE_PATH).replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    const resolvedFetch = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!resolvedFetch) {
      throw new ConductorError('No fetch implementation available; pass options.fetch');
    }
    this.#fetch = resolvedFetch;
    this.#WebSocketImpl =
      options.WebSocketImpl ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  }

  // --- Availability / capability surfaces ---

  /** GET /health — truthful substrate availability (git + tmux). */
  health(): Promise<ConductorAvailability> {
    return this.#request<ConductorAvailability>('GET', '/health');
  }

  /** GET /runtimes — which installed agent CLIs the conductor can launch. */
  listRuntimes(): Promise<RuntimeAvailability[]> {
    return this.#request<RuntimeAvailability[]>('GET', '/runtimes');
  }

  // --- Workspaces: the persisted unit of parallel work ---

  /** GET /workspaces — the board. */
  listWorkspaces(): Promise<Workspace[]> {
    return this.#request<Workspace[]>('GET', '/workspaces');
  }

  /** GET /workspaces/:id — a single workspace record. */
  getWorkspace(id: string): Promise<Workspace> {
    return this.#request<Workspace>('GET', `/workspaces/${encodeURIComponent(id)}`);
  }

  /** POST /workspaces — launch a new parallel workspace. */
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    if (!input?.prompt && !input?.command) {
      throw new ConductorError('createWorkspace requires one of (prompt | command)');
    }
    return this.#request<Workspace>('POST', '/workspaces', input);
  }

  /** GET /workspaces/:id/output?lines= — captured pane text. */
  getOutput(id: string, lines?: number): Promise<WorkspaceOutput> {
    const query = typeof lines === 'number' ? `?lines=${encodeURIComponent(String(lines))}` : '';
    return this.#request<WorkspaceOutput>(
      'GET',
      `/workspaces/${encodeURIComponent(id)}/output${query}`,
    );
  }

  /** GET /workspaces/:id/status — live agent status (alive + exit code + recent output). */
  getStatus(id: string): Promise<WorkspaceStatus> {
    return this.#request<WorkspaceStatus>('GET', `/workspaces/${encodeURIComponent(id)}/status`);
  }

  /** POST /workspaces/:id/steer — send keys/input to a running agent. */
  steer(id: string, keys: string): Promise<void> {
    return this.#request<void>('POST', `/workspaces/${encodeURIComponent(id)}/steer`, { keys });
  }

  /** GET /workspaces/:id/diff — reviewable worktree diff vs base ref. */
  getDiff(id: string): Promise<WorkspaceDiff> {
    return this.#request<WorkspaceDiff>('GET', `/workspaces/${encodeURIComponent(id)}/diff`);
  }

  /** POST /workspaces/:id/pr — open a PR (approval-gated; may throw ConductorError 409). */
  createPr(
    id: string,
    body?: { title?: string; body?: string; base?: string; draft?: boolean; remote?: string },
  ): Promise<CreatePrResult> {
    return this.#request<CreatePrResult>(
      'POST',
      `/workspaces/${encodeURIComponent(id)}/pr`,
      body ?? {},
    );
  }

  /** POST /workspaces/:id/merge — merge the PR (approval-gated; may throw ConductorError 409). */
  merge(
    id: string,
    body?: { strategy?: string; deleteBranch?: boolean },
  ): Promise<MergeResult> {
    return this.#request<MergeResult>(
      'POST',
      `/workspaces/${encodeURIComponent(id)}/merge`,
      body ?? {},
    );
  }

  /** POST /workspaces/:id/archive — stop session, remove worktree, mark archived. */
  archive(id: string): Promise<Workspace> {
    return this.#request<Workspace>('POST', `/workspaces/${encodeURIComponent(id)}/archive`, {});
  }

  /**
   * Open a live event stream for a workspace.
   *
   * Prefers the WS upgrade at `/workspaces/:id/stream`; if no WebSocket
   * implementation is available, the socket fails to open, or it later errors,
   * falls back to polling {@link getOutput} and synthesizing `log` RunEvents from
   * newly appended output. Returns a {@link StreamHandle} to stop streaming.
   */
  openStream(
    id: string,
    onEvent: RunEventHandler,
    opts?: { pollIntervalMs?: number; lines?: number },
  ): StreamHandle {
    const pollIntervalMs = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const lines = opts?.lines;
    let closed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let socket: InstanceType<WebSocketCtor> | undefined;
    let lastOutput = '';

    const handle: { transport: 'websocket' | 'poll' } = { transport: 'poll' };

    const startPolling = (): void => {
      if (closed || timer) return;
      handle.transport = 'poll';
      const poll = async (): Promise<void> => {
        if (closed) return;
        try {
          const { output } = await this.getOutput(id, lines);
          if (output && output !== lastOutput) {
            const delta = output.startsWith(lastOutput)
              ? output.slice(lastOutput.length)
              : output;
            lastOutput = output;
            if (delta) {
              onEvent(synthesizeLogEvent(id, delta));
            }
          }
        } catch {
          // Swallow transient poll errors; the next tick retries.
        }
      };
      void poll();
      timer = setInterval(() => void poll(), pollIntervalMs);
    };

    if (this.#WebSocketImpl) {
      try {
        socket = new this.#WebSocketImpl(this.#streamUrl(id));
        handle.transport = 'websocket';
        socket.onmessage = (event: { data: unknown }) => {
          const parsed = parseRunEvent(event.data);
          if (parsed) onEvent(parsed);
        };
        socket.onerror = () => {
          // Drop the broken socket and fall back to polling.
          try {
            socket?.close();
          } catch {
            /* ignore */
          }
          socket = undefined;
          startPolling();
        };
      } catch {
        socket = undefined;
        startPolling();
      }
    } else {
      startPolling();
    }

    return {
      get transport() {
        return handle.transport;
      },
      close() {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        if (socket) {
          try {
            socket.close();
          } catch {
            /* ignore */
          }
        }
      },
    };
  }

  // --- internals ---

  #streamUrl(id: string): string {
    const httpUrl = `${this.#baseUrl}${this.#basePath}/workspaces/${encodeURIComponent(id)}/stream`;
    return httpUrl.replace(/^http/i, 'ws');
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.#baseUrl}${this.#basePath}${path}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.#apiKey) headers['x-api-key'] = this.#apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ConductorError(
        `conductor request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 204 No Content — nothing to unwrap (e.g. memory-candidate absent).
    if (response.status === 204) {
      return undefined as T;
    }

    let envelope: { success?: boolean; data?: unknown; error?: string } | undefined;
    try {
      envelope = (await response.json()) as typeof envelope;
    } catch {
      if (!response.ok) {
        throw new ConductorError(`conductor request failed (${response.status})`, {
          status: response.status,
        });
      }
      throw new ConductorError('conductor returned a non-JSON response', {
        status: response.status,
      });
    }

    if (!response.ok || envelope?.success === false) {
      throw new ConductorError(envelope?.error || `conductor request failed (${response.status})`, {
        status: response.status,
        data: envelope?.data,
      });
    }

    return envelope?.data as T;
  }
}

/** Best-effort parse of a WS frame payload into a {@link RunEvent}. */
function parseRunEvent(data: unknown): RunEvent | undefined {
  let raw = data;
  if (typeof raw !== 'string') {
    if (raw && typeof (raw as { toString?: () => string }).toString === 'function') {
      raw = (raw as { toString: () => string }).toString();
    } else {
      return undefined;
    }
  }
  try {
    const parsed = JSON.parse(raw as string) as unknown;
    // The live stream may wrap the event in an envelope or send it bare.
    const candidate =
      parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)
        ? (parsed as { data: unknown }).data
        : parsed;
    if (candidate && typeof candidate === 'object' && 'eventId' in (candidate as object)) {
      return candidate as RunEvent;
    }
  } catch {
    /* not a JSON RunEvent frame */
  }
  return undefined;
}

/** Build a synthetic `log` RunEvent from a chunk of polled output. */
function synthesizeLogEvent(workspaceId: string, message: string): RunEvent {
  return {
    eventId: `poll_${workspaceId}_${Date.now().toString(36)}`,
    type: 'log',
    taskId: workspaceId,
    message,
    createdAt: new Date().toISOString(),
    data: { source: 'poll' },
  };
}
