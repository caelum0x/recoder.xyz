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
 *   POST /workspaces/:id/message          send a chat message → starts the next agent run
 *   GET  /workspaces/:id/diff             reviewable diff
 *   POST /workspaces/:id/pr               open PR
 *   POST /workspaces/:id/merge            merge
 *   POST /workspaces/:id/archive          archive
 *   GET  /runtimes                        runtime availability strip
 *   GET  /substrates                      substrate availability strip
 *   POST /reconcile                       reconcile persisted state vs substrate
 *   GET  /health                          conductor availability
 *   GET  /health/full                     unified health (substrate+runtimes+resources+tails)
 *   GET  /sessions                        live tmux+worktree agent sessions
 *   POST /sessions                        start an interactive tmux session
 *   GET  /sessions/:id/output             capture the tmux pane output
 *   POST /sessions/:id/keys               drive the session (send keys)
 *   DELETE /sessions/:id                  kill a session
 *   GET  /dmux                            dmux operator-console status + grid
 *   POST /dmux/launch                     launch the dmux console for a repo
 *
 * Sibling control-plane routes (NOT under /api/conductor):
 *   GET  /api/connectors                              per-channel connector health
 *   GET  /api/agent-os/brain/stats                    shared-brain reuse + governance audit
 *   POST /api/agent-os/policy/evaluate                real @recoder/agent-policy decision
 *   GET  /api/agent-os/memory/lifecycle/candidates    reviewed memory candidates
 *   POST /api/agent-os/memory/lifecycle/candidates             propose a candidate (with evidence)
 *   POST /api/agent-os/memory/lifecycle/candidates/:id/review  accept/reject a candidate
 */
import { ConductorClient } from '@recoder/conductor-ui';
import type {
  RunEventHandler as ConductorRunEventHandler,
  StreamHandle as ConductorStreamHandle,
} from '@recoder/conductor-ui';
import type {
  ApiEnvelope,
  BrainStats,
  ConductorHealth,
  ConductorSession,
  ConnectorsHealth,
  CreatePrResult,
  CreateWorkspaceBody,
  DmuxLaunchBody,
  DmuxLaunchResult,
  DmuxStatus,
  GatewayHealth,
  GatewayInferenceBody,
  GatewayInferenceResult,
  GatewayStatus,
  GovernanceAuditTrail,
  McpHostSummary,
  McpServer,
  McpToolCheckResult,
  McpToolEntry,
  MemoryCandidate,
  MergeResult,
  MulticaSquadsResult,
  MulticaStatus,
  OpenfangAgentCard,
  OpenfangHealth,
  PolicyDecision,
  PolicyEvaluateBody,
  ProposeMemoryCandidateBody,
  RetrievalHealth,
  RetrievalSearchBody,
  RetrievalSearchResult,
  ReviewMemoryCandidateBody,
  ReviewMemoryResult,
  RunEvent,
  RuntimeAvailability,
  SessionOutput,
  StartSessionBody,
  SubstrateAvailability,
  DevCommand,
  Workspace,
  WorkspaceDiff,
  WorkspaceTree,
  ZitiHealth,
  ZitiIdentityList,
} from '../types';
import { readConfig } from './config';

export class ApiError extends Error {
  readonly status: number;
  /**
   * The `data` payload the backend attached to a non-ok envelope, when present.
   * Some control-plane rejections are *structured*, not just a message: the
   * conductor PR/merge delivery gate returns a 409 with
   * `{ success:false, error, data:{ state, action, approvalId, transitioned } }`
   * (conductor.routes.ts). Carrying that `data` here lets the Governance panel
   * surface the real awaiting_approval verdict instead of only the message —
   * without inventing a route or faking the gate.
   */
  readonly data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Raised when the backend reachably rejects the request as unauthenticated
 * (HTTP 401/403). Distinct from BackendUnreachableError so the cockpit can show
 * a real "Sign in" panel instead of a misleading "backend unreachable" banner.
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string, status: number, data?: unknown) {
    super(message, status, data);
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
    // Unwrap the error field safely: the backend may send a plain string OR a
    // structured object { code, message, timestamp }. Using the object directly
    // as a string would produce "[object Object]" in the UI.
    const rawError = envelope && (envelope.error as unknown);
    const message =
      typeof rawError === 'string'
        ? rawError
        : rawError !== null &&
            rawError !== undefined &&
            typeof rawError === 'object' &&
            'message' in rawError &&
            typeof (rawError as { message?: unknown }).message === 'string'
          ? (rawError as { message: string }).message
          : rawError !== null && rawError !== undefined
            ? String(rawError)
            : `${method} ${path} failed with status ${res.status}`;
    // Preserve any structured `data` the backend attached to the rejection (e.g.
    // the delivery gate's awaiting_approval verdict on a 409). It is genuinely
    // part of a failed envelope, so it rides on the thrown error, not the value.
    const data = envelope && 'data' in envelope ? envelope.data : undefined;
    // 401/403 means the backend is reachable but the request is unauthenticated.
    // Surface this distinctly so the cockpit prompts a real sign-in.
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedError(message, res.status, data);
    }
    throw new ApiError(message, res.status, data);
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

/** Agent OS control-plane request: every call hits `${backendUrl}/api/agent-os/...`. */
function agentOsRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/agent-os', method, path, body);
}

/** MCP control-plane request: every call hits `${backendUrl}/api/mcp/...`. */
function mcpRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/mcp', method, path, body);
}

/** Gateway (TensorZero) request: every call hits `${backendUrl}/api/gateway/...`. */
function gatewayRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/gateway', method, path, body);
}

/** OpenFang agent request: every call hits `${backendUrl}/api/agents/openfang/...`. */
function openfangRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/agents/openfang', method, path, body);
}

/** Ziti networking request: every call hits `${backendUrl}/api/ziti/...`. */
function zitiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/ziti', method, path, body);
}

/** Multica managed-agents request: every call hits `${backendUrl}/api/multica/...`. */
function multicaRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/multica', method, path, body);
}

/** Retrieval (RAG) request: every call hits `${backendUrl}/api/retrieval/...`. */
function retrievalRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestAt<T>('/api/retrieval', method, path, body);
}

/**
 * Build the shared, typed {@link ConductorClient} from `@recoder/conductor-ui`,
 * configured for the cockpit's runtime.
 *
 * The package is the canonical web front door for the conductor control plane.
 * The cockpit reuses it instead of re-deriving the same workspace/stream contract
 * a second time. Two cockpit-specific adaptations are wired in here, never faked:
 *
 *  - Auth: the cockpit authenticates with `Authorization: Bearer <session>`
 *    (real recoder.xyz session), not the package's default `x-api-key`. We inject
 *    a `fetch` wrapper that stamps the live Bearer token from {@link readConfig}
 *    on every request — so the typed client speaks the cockpit's auth dialect.
 *  - Origin: the client reads the same injected backendUrl the rest of api.ts uses.
 *
 * A fresh client is built per call so a token refreshed by a desktop login (see
 * config.ts) is always honored — there is no stale captured token.
 */
function conductorClient(): ConductorClient {
  const { backendUrl } = readConfig();
  const baseFetch: typeof fetch =
    typeof fetch !== 'undefined'
      ? fetch
      : ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch);
  const authedFetch: typeof fetch = (input, init) => {
    const { token } = readConfig();
    const headers = new Headers(init?.headers ?? {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return baseFetch(input, { ...init, headers });
  };
  return new ConductorClient({ baseUrl: backendUrl, fetch: authedFetch });
}

export const api = {
  health: () =>
    request<{ available: boolean; git?: boolean; tmux?: boolean; tmuxBin?: string; reason?: string }>(
      'GET',
      '/health',
    ),
  /** Unified conductor health: substrate + runtimes + resources + tails + workspaces. */
  healthFull: () => request<ConductorHealth>('GET', '/health/full'),
  /**
   * Whether the backend can forward a GitHub token into agent sessions (so
   * agents run `gh` without a local `gh auth login`). Token-free by contract:
   * only `{ connected, source }` is returned — never the token value. Drives the
   * calm "GitHub" chip near the account block.
   */
  githubStatus: () =>
    request<{ connected: boolean; source: 'GH_TOKEN' | 'GITHUB_TOKEN' | null }>(
      'GET',
      '/github/status',
    ),
  /**
   * Tamper-evident governance audit trail: sealed Merkle-chain entries
   * (newest-first) + a genuine full-chain verification result.
   */
  governanceAudit: (limit = 100) =>
    request<GovernanceAuditTrail>('GET', `/governance/audit?limit=${limit}`),
  listWorkspaces: () => request<Workspace[]>('GET', '/workspaces'),
  getWorkspace: (id: string) => request<Workspace>('GET', `/workspaces/${encodeURIComponent(id)}`),
  createWorkspace: (body: CreateWorkspaceBody) => request<Workspace>('POST', '/workspaces', body),
  listEvents: (id: string) =>
    request<RunEvent[]>('GET', `/workspaces/${encodeURIComponent(id)}/events`),
  /**
   * Send a chat message to a workspace. The backend (POST /workspaces/:id/message)
   * appends the message to the conversation and starts the next agent run with it
   * as the prompt — turning the cockpit's steer box into a real chat. The user's
   * message bubble is rendered optimistically by the caller before this resolves,
   * so a 404 (route not yet deployed) is surfaced truthfully without losing the
   * bubble. Returns whatever the backend echoes (kept loose: the contract is still
   * being finalized server-side; we only depend on success vs failure here).
   */
  sendMessage: (id: string, text: string, model?: string) =>
    request<unknown>('POST', `/workspaces/${encodeURIComponent(id)}/message`, {
      text,
      ...(model ? { model } : {}),
    }),
  /**
   * Open a LIVE RunEvent stream for a workspace via the shared
   * `@recoder/conductor-ui` {@link ConductorClient}. The client upgrades to the
   * conductor WS endpoint (`/workspaces/:id/stream`) when a WebSocket is
   * available and transparently falls back to polling captured pane output —
   * capability the cockpit's bespoke `listEvents` polling alone does not provide.
   * Returns a {@link ConductorStreamHandle}; call `.close()` to stop streaming.
   */
  openStream: (
    id: string,
    onEvent: ConductorRunEventHandler,
    opts?: { pollIntervalMs?: number; lines?: number },
  ): ConductorStreamHandle => conductorClient().openStream(id, onEvent, opts),
  diff: (id: string) => request<WorkspaceDiff>('GET', `/workspaces/${encodeURIComponent(id)}/diff`),
  tree: (id: string) => request<WorkspaceTree>('GET', `/workspaces/${encodeURIComponent(id)}/tree`),
  devCommand: (id: string) =>
    request<DevCommand | null>('GET', `/workspaces/${encodeURIComponent(id)}/dev-command`),
  /**
   * Persist a sniffed dev-server preview URL to the workspace
   * (POST /workspaces/:id/preview-url → `metadata.previewUrl`), so the
   * agent-facing preview engine (preview.health) and the board can light up.
   * The backend accepts only a http(s) localhost/loopback URL; callers post the
   * URL the Run tab detected once it appears. Returns the updated workspace.
   */
  setPreviewUrl: (id: string, url: string) =>
    request<Workspace>('POST', `/workspaces/${encodeURIComponent(id)}/preview-url`, { url }),
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

  // --- Agent OS control plane (mounted at /api/agent-os, NOT /api/conductor) ---

  /**
   * Shared-brain reuse accounting + governance audit integrity.
   * GET /api/agent-os/brain/stats -> { brain: { enabled, report }, governance }.
   */
  brainStats: () => agentOsRequest<BrainStats>('GET', '/brain/stats'),

  /** Run the real @recoder/agent-policy engine -> PolicyDecision (allow|needs_approval|deny). */
  evaluatePolicy: (body: PolicyEvaluateBody) =>
    agentOsRequest<PolicyDecision>('POST', '/policy/evaluate', body),

  /** List reviewed memory candidates from the lifecycle surface. */
  listMemoryCandidates: () =>
    agentOsRequest<MemoryCandidate[]>('GET', '/memory/lifecycle/candidates'),

  /** Propose a memory candidate WITH evidence (taskId + artifactId required server-side). */
  proposeMemoryCandidate: (body: ProposeMemoryCandidateBody) =>
    agentOsRequest<MemoryCandidate>('POST', '/memory/lifecycle/candidates', body),

  /** Accept/reject a candidate; on accept the backend materializes a durable MemoryItem. */
  reviewMemoryCandidate: (candidateId: string, body: ReviewMemoryCandidateBody) =>
    agentOsRequest<ReviewMemoryResult>(
      'POST',
      `/memory/lifecycle/candidates/${encodeURIComponent(candidateId)}/review`,
      body,
    ),

  // --- MCP control plane (mounted at /api/mcp, NOT /api/conductor or /api/agent-os) ---

  /** GET /api/mcp/ — top-level MCP host summary (server count, tool count). */
  mcpSummary: () => mcpRequest<McpHostSummary>('GET', '/'),

  /** GET /api/mcp/servers — all registered MCP servers (name, kind, tools, enabled). */
  mcpServers: () => mcpRequest<McpServer[]>('GET', '/servers'),

  /** GET /api/mcp/tools — flat list of all tools across registered servers. */
  mcpTools: () => mcpRequest<McpToolEntry[]>('GET', '/tools'),

  /**
   * POST /api/mcp/tools/:serverId/:toolName/check — policy gate check.
   * Requires a real actor AgentProfile; returns the decision + audit event.
   * Does NOT execute the tool.
   */
  mcpCheckTool: (
    serverId: string,
    toolName: string,
    body: {
      actor: Record<string, unknown>;
      task?: Record<string, unknown>;
      args?: Record<string, unknown>;
    },
  ) =>
    mcpRequest<McpToolCheckResult>(
      'POST',
      `/tools/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}/check`,
      body,
    ),

  // --- TensorZero LLM gateway (mounted at /api/gateway, NOT /api/conductor or /api/agent-os) ---

  /**
   * GET /api/gateway/health — truthful health snapshot. Public (no auth).
   * Returns 503 when the gateway is not running; callers must handle both cases.
   * NOTE: This route is not under /api/conductor, so it uses requestAt directly.
   */
  gatewayHealth: () => requestAt<GatewayHealth>('/api/gateway', 'GET', '/health'),

  /**
   * GET /api/gateway/status — authenticated status including gateway mode,
   * baseUrl, listenAddr, and whether the binary was found on disk.
   */
  gatewayStatus: () => gatewayRequest<GatewayStatus>('GET', '/status'),

  /**
   * POST /api/gateway/inference — proxy an inference call through TensorZero.
   * On success includes `inference_id` for observability. Falls back to 503
   * when the gateway is not running (callers must handle that case).
   */
  gatewayInference: (body: GatewayInferenceBody) =>
    gatewayRequest<GatewayInferenceResult>('POST', '/inference', body),

  // --- OpenFang agent surface (mounted at /api/agents/openfang) ---

  /**
   * GET /api/agents/openfang/health — truthful daemon health snapshot.
   * Returns 503 when the openfang binary is absent; callers must handle both cases.
   * NOTE: This route is not under /api/conductor, so it uses openfangRequest.
   */
  openfangHealth: () => openfangRequest<OpenfangHealth>('GET', '/health'),

  /**
   * GET /api/agents/openfang — agent card + current runtime status.
   * Always returns 200; the `status` field reflects daemon availability.
   * Read-only — respects the A2A boundary (Recoder owns task/approval/memory state).
   */
  openfangAgent: () => openfangRequest<OpenfangAgentCard>('GET', '/'),

  // --- Zero-Trust Networking (OpenZiti) surface (mounted at /api/ziti) ---

  /**
   * GET /api/ziti/health — truthful mesh health.
   * Returns { available: false } when ZITI_CONTROLLER_URL is absent or the
   * controller is unreachable. No auth required (public liveness check).
   */
  zitiHealth: () => zitiRequest<ZitiHealth>('GET', '/health'),

  /**
   * GET /api/ziti/identities — list of provisioned zero-trust identities.
   * Requires auth. Returns { available: false, identities: [] } when Ziti is
   * unconfigured — never fabricates identity data.
   */
  zitiIdentities: () => zitiRequest<ZitiIdentityList>('GET', '/identities'),

  // --- Multica managed-agents/squads (mounted at /api/multica) ---

  /**
   * GET /api/multica/status — truthful Multica seam health.
   * Returns 503 when unconfigured (no MULTICA_URL or binary). Authenticated.
   * Callers must handle 503 — the panel degrades safely when Multica is absent.
   */
  multicaStatus: () => multicaRequest<MulticaStatus>('GET', '/status'),

  /**
   * GET /api/multica/squads — list squads from the Multica loopback.
   * Returns 503 when Multica is unconfigured; the panel surfaces a truthful
   * "unavailable" state. Never fabricates squad data.
   */
  multicaSquads: () => multicaRequest<MulticaSquadsResult>('GET', '/squads'),

  // --- Retrieval (RAG) surface (mounted at /api/retrieval) ---

  /**
   * GET /api/retrieval/health — truthful retrieval capability health.
   * Public (no auth). Returns 503 when neither COLBERT_RERANK_URL nor
   * LANCE_DB_PATH is configured. Callers must handle 503.
   */
  retrievalHealth: () => requestAt<RetrievalHealth>('/api/retrieval', 'GET', '/health'),

  /**
   * POST /api/retrieval/search — vector search with optional ColBERT reranking.
   * Authenticated. Returns 503 when the retrieval surface is unconfigured.
   * Callers must handle 503 — the panel degrades safely when RAG is absent.
   */
  retrievalSearch: (body: RetrievalSearchBody) =>
    retrievalRequest<RetrievalSearchResult>('POST', '/search', body),
};
