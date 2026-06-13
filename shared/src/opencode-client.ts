/**
 * @module opencode-client
 *
 * Recoder's client for talking to an opencode backend service.
 *
 * This is the single integration point that recoder-agents,
 * docker-backend, and recoder-code all use to dispatch coding work to
 * the opencode runtime. The opencode server runs as a persistent HTTP
 * service (Bun/Hono) — this client speaks its REST API.
 *
 * Usage:
 *   const client = createRecoderOpencodeClient({ baseUrl: 'http://localhost:4096' });
 *   const session = await client.createSession({ directory: '/workspace' });
 *   const result = await client.prompt(session.id, { content: 'Fix the failing tests' });
 */

// ── Types ──────────────────────────────────────────────────────────

export interface OpencodeClientConfig {
  /** Base URL of the opencode HTTP server (e.g. http://localhost:4096) */
  baseUrl: string;
  /** Optional basic auth password (OPENCODE_SERVER_PASSWORD) */
  password?: string;
  /** Optional basic auth username (defaults to 'opencode') */
  username?: string;
  /** Custom fetch implementation (for Node.js or test mocks) */
  fetchFn?: typeof fetch;
  /** Default timeout in ms for requests (default: 120000) */
  timeout?: number;
}

export interface SessionInfo {
  id: string;
  title?: string;
  parentID?: string;
  share?: string;
  version: number;
  time: {
    created: number;
    updated: number;
    archived?: number;
  };
}

export interface MessagePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  [key: string]: unknown;
}

export interface MessageInfo {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant' | 'system';
  time: { created: number };
  [key: string]: unknown;
}

export interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

export interface PromptInput {
  content: string;
  /** Optional provider+model override */
  providerID?: string;
  modelID?: string;
  /** Optional agent to use */
  agent?: string;
  /** System prompt additions */
  system?: string;
}

export interface FileDiff {
  path: string;
  status: string;
  hunks: Array<{
    header: string;
    lines: string[];
  }>;
}

export interface SessionStatus {
  status: 'idle' | 'busy' | 'error';
  [key: string]: unknown;
}

export interface ProviderAuth {
  type: string;
  clientID?: string;
  token?: string;
  [key: string]: unknown;
}

interface OpencodeFileContentResponse {
  type?: string;
  content?: string;
  encoding?: string;
}

// ── Client ─────────────────────────────────────────────────────────

export function createRecoderOpencodeClient(config: OpencodeClientConfig) {
  const { baseUrl, password, username = 'opencode', timeout = 120_000 } = config;
  const fetchFn = config.fetchFn ?? globalThis.fetch;

  function headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };

    if (password) {
      h['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    }

    return h;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { directory?: string; timeoutMs?: number },
  ): Promise<T> {
    const url = new URL(path, baseUrl);

    if (opts?.directory) {
      url.searchParams.set('directory', opts.directory);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? timeout);

    try {
      const res = await fetchFn(url.toString(), {
        method,
        headers: headers(opts?.directory ? { 'x-opencode-directory': encodeURIComponent(opts.directory) } : undefined),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`opencode ${method} ${path} failed (${res.status}): ${text}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      const rawText = await res.text();

      if (contentType.includes('application/json')) {
        if (!rawText || rawText.length === 0) {
          throw new Error(`opencode ${method} ${path} returned empty JSON body (status ${res.status})`);
        }
        try {
          return JSON.parse(rawText) as T;
        } catch (parseErr) {
          throw new Error(`opencode ${method} ${path} JSON parse failed: ${(parseErr as Error).message}. Body (first 200 chars): ${rawText.slice(0, 200)}`);
        }
      }

      return rawText as unknown as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    // ── Session management ───────────────────────────────────────

    /** Create a new coding session */
    async createSession(opts?: {
      directory?: string;
      title?: string;
      parentID?: string;
    }): Promise<SessionInfo> {
      // Always send a body — OpenCode service rejects POST /session without one
      return request<SessionInfo>('POST', '/session', { title: opts?.title, parentID: opts?.parentID }, {
        directory: opts?.directory,
      });
    },

    /** Get a session by ID */
    async getSession(sessionID: string, directory?: string): Promise<SessionInfo> {
      return request<SessionInfo>('GET', `/session/${sessionID}`, undefined, { directory });
    },

    /** List all sessions */
    async listSessions(opts?: {
      directory?: string;
      roots?: boolean;
      search?: string;
      limit?: number;
    }): Promise<SessionInfo[]> {
      const params = new URLSearchParams();
      if (opts?.roots) params.set('roots', 'true');
      if (opts?.search) params.set('search', opts.search);
      if (opts?.limit) params.set('limit', String(opts.limit));

      const path = `/session${params.toString() ? `?${params}` : ''}`;
      return request<SessionInfo[]>('GET', path, undefined, { directory: opts?.directory });
    },

    /** Delete a session */
    async deleteSession(sessionID: string): Promise<boolean> {
      return request<boolean>('DELETE', `/session/${sessionID}`);
    },

    /** Abort an active session */
    async abortSession(sessionID: string): Promise<boolean> {
      return request<boolean>('POST', `/session/${sessionID}/abort`);
    },

    /** Get session status */
    async getSessionStatus(): Promise<Record<string, SessionStatus>> {
      return request<Record<string, SessionStatus>>('GET', '/session/status');
    },

    // ── Prompt / Message ─────────────────────────────────────────

    /** Send a prompt to a session and wait for the response */
    async prompt(sessionID: string, input: PromptInput, directory?: string): Promise<MessageWithParts> {
      // Transform PromptInput into the opencode server's expected format:
      // { parts: [{ type: "text", text: "..." }], providerID?, modelID?, agent?, system? }
      const body = {
        parts: [{ type: 'text' as const, text: input.content }],
        ...(input.providerID && { providerID: input.providerID }),
        ...(input.modelID && { modelID: input.modelID }),
        ...(input.agent && { agent: input.agent }),
        ...(input.system && { system: input.system }),
      };
      return request<MessageWithParts>(
        'POST',
        `/session/${sessionID}/message`,
        body,
        { directory, timeoutMs: 300_000 }, // 5 min for coding tasks
      );
    },

    /** Send a prompt asynchronously (returns immediately, results via events) */
    async promptAsync(sessionID: string, input: PromptInput, directory?: string): Promise<void> {
      const body = {
        parts: [{ type: 'text' as const, text: input.content }],
        ...(input.providerID && { providerID: input.providerID }),
        ...(input.modelID && { modelID: input.modelID }),
        ...(input.agent && { agent: input.agent }),
        ...(input.system && { system: input.system }),
      };
      await request<void>('POST', `/session/${sessionID}/prompt_async`, body, { directory });
    },

    /** Send a command to a session */
    async command(sessionID: string, input: { command: string }): Promise<MessageWithParts> {
      return request<MessageWithParts>('POST', `/session/${sessionID}/command`, input, { timeoutMs: 300_000 });
    },

    /** Run a shell command in the session context */
    async shell(sessionID: string, input: { command: string }): Promise<MessageInfo> {
      return request<MessageInfo>('POST', `/session/${sessionID}/shell`, input, { timeoutMs: 300_000 });
    },

    /** Get all messages in a session */
    async getMessages(sessionID: string): Promise<MessageWithParts[]> {
      return request<MessageWithParts[]>('GET', `/session/${sessionID}/message`);
    },

    /** Get a specific message */
    async getMessage(sessionID: string, messageID: string): Promise<MessageWithParts> {
      return request<MessageWithParts>('GET', `/session/${sessionID}/message/${messageID}`);
    },

    // ── Diff & Revert ────────────────────────────────────────────

    /** Get file changes from a specific message */
    async getDiff(sessionID: string, messageID: string): Promise<FileDiff[]> {
      return request<FileDiff[]>('GET', `/session/${sessionID}/diff?messageID=${messageID}`);
    },

    /** Revert a message */
    async revert(sessionID: string, input: { messageID: string }): Promise<SessionInfo> {
      return request<SessionInfo>('POST', `/session/${sessionID}/revert`, input);
    },

    /** Fork a session at a specific point */
    async fork(sessionID: string, input?: { messageID?: string }): Promise<SessionInfo> {
      return request<SessionInfo>('POST', `/session/${sessionID}/fork`, input);
    },

    // ── Auth / Provider ──────────────────────────────────────────

    /** Set provider auth credentials (BYOK) */
    async setAuth(providerID: string, auth: ProviderAuth): Promise<boolean> {
      return request<boolean>('PUT', `/auth/${providerID}`, auth);
    },

    /** Remove provider auth credentials */
    async removeAuth(providerID: string): Promise<boolean> {
      return request<boolean>('DELETE', `/auth/${providerID}`);
    },

    // ── File operations ──────────────────────────────────────────

    /** List files in the workspace */
    async listFiles(directory?: string): Promise<unknown[]> {
      return request<unknown[]>('GET', '/file', undefined, { directory });
    },

    /** Read a file */
    async readFile(path: string, directory?: string): Promise<string> {
      const normalizedPath = path.replace(/^\/+/, '');
      const response = await request<OpencodeFileContentResponse>(
        'GET',
        `/file/content?path=${encodeURIComponent(normalizedPath)}`,
        undefined,
        { directory },
      );

      if (typeof response === 'string') {
        return response;
      }

      return typeof response?.content === 'string' ? response.content : '';
    },

    // ── Server health ────────────────────────────────────────────

    /** Check if the opencode server is reachable */
    async ping(): Promise<boolean> {
      try {
        await request<unknown>('GET', '/session', undefined, { timeoutMs: 5_000 });
        return true;
      } catch {
        return false;
      }
    },

    /** Get the base URL */
    get url(): string {
      return baseUrl;
    },
  };
}

export type RecoderOpencodeClient = ReturnType<typeof createRecoderOpencodeClient>;
