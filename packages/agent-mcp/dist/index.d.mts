import { PolicyDecision, AgentProfile, TaskSpec, TaskService, TaskRunState, TaskRun, RunService, RunEvent, WorkLock, WorkLockService } from '@recoder/agent-os';
import { MemoryStore, MemoryReviewWorkflow } from '@recoder/agent-memory';
import { RepoIndexer } from '@recoder/recodergit';
export { ContextPack, ImpactResult } from '@recoder/recodergit';

type McpServerKind = 'github' | 'repo' | 'tasks' | 'runs' | 'workspace' | 'artifacts' | 'approvals' | 'browser' | 'memory' | 'deploy' | 'billing' | 'preview' | 'logs' | 'git_nexus' | 'recoder_code_graph' | 'beads' | 'oss' | 'custom';
type McpServerRegistration = {
    serverId: string;
    kind: McpServerKind;
    displayName: string;
    transport: 'stdio' | 'http' | 'sse' | 'custom';
    endpoint?: string;
    enabled: boolean;
    toolNames: string[];
    metadata?: Record<string, unknown>;
};
declare class McpRegistry {
    private readonly servers;
    register(server: McpServerRegistration): McpServerRegistration;
    list(): McpServerRegistration[];
    get(serverId: string): McpServerRegistration | null;
}

type McpToolCallInput = {
    server: McpServerRegistration;
    toolName: string;
    actor: AgentProfile;
    task?: TaskSpec;
    args: Record<string, unknown>;
};
type McpToolCallDecision = {
    allowed: boolean;
    requiresApproval?: boolean;
    reason: string;
    policyDecision?: PolicyDecision;
};
declare function canCallMcpTool(input: McpToolCallInput): McpToolCallDecision;

type McpToolResult = {
    content: unknown;
    metadata?: Record<string, unknown>;
};
interface McpToolExecutor {
    call(input: McpToolCallInput): Promise<McpToolResult>;
}
type McpToolAuditRecord = {
    callId: string;
    serverId: string;
    toolName: string;
    actorAgentId: string;
    taskId?: string;
    decision: McpToolCallDecision;
    status: 'denied' | 'needs_approval' | 'completed' | 'failed';
    startedAt: string;
    completedAt: string;
    error?: string;
};
type McpToolAuditSink = (record: McpToolAuditRecord) => void | Promise<void>;
/**
 * Observe a failure of the (best-effort) audit sink. The audit sink is an
 * observability side-channel — its failure must NEVER change the truthful
 * outcome of a tool call — so a throwing/rejecting sink is contained inside the
 * host. This optional hook lets a consumer notice the dropped audit record
 * (metrics, dead-letter log) without the failure propagating to the caller.
 * The hook itself is also invoked defensively; a throwing hook is swallowed.
 */
type McpToolAuditErrorSink = (error: unknown, record: McpToolAuditRecord) => void;
declare class RecoderMcpHost {
    private readonly executor;
    private readonly audit?;
    private readonly onAuditError?;
    constructor(executor: McpToolExecutor, audit?: McpToolAuditSink | undefined, onAuditError?: McpToolAuditErrorSink | undefined);
    authorize(input: McpToolCallInput): McpToolCallDecision;
    call(input: McpToolCallInput): Promise<McpToolResult>;
    private emitAudit;
    /** Report a dropped audit record without letting the report itself throw. */
    private reportAuditError;
}

type McpSession = {
    sessionId: string;
    agentId: string;
    spaceId?: string;
    connectedAt: string;
    lastSeenAt: string;
    metadata?: Record<string, unknown>;
};
declare class McpSessionManager {
    private readonly sessions;
    upsert(input: {
        sessionId: string;
        agent: AgentProfile;
        spaceId?: string;
        now?: string;
        metadata?: Record<string, unknown>;
    }): McpSession;
    list(): McpSession[];
    get(sessionId: string): McpSession | null;
    remove(sessionId: string): boolean;
}

type McpToolHandler = (input: McpToolCallInput) => Promise<McpToolResult> | McpToolResult;
declare class McpToolRouter implements McpToolExecutor {
    private readonly registry;
    private readonly handlers;
    constructor(registry: McpRegistry);
    register(server: McpServerRegistration, toolName: string, handler: McpToolHandler): void;
    call(input: McpToolCallInput): Promise<McpToolResult>;
}

declare const githubMcpServer: McpServerRegistration;

declare const repoMcpServer: McpServerRegistration;

declare const tasksMcpServer: McpServerRegistration;
/**
 * The injected agent-os task repository port. This is the SAME read/write
 * contract a runtime backend (backend) implements over its store of
 * record. agent-mcp stays runtime-agnostic: it never owns task state, it only
 * operates over the port the host injects. All transitions go through the
 * agent-os {@link TaskService} so only legal state changes are persisted.
 */
type TaskRepositoryPort = {
    listTasks(filter: {
        spaceId?: string;
        intent?: string;
    }): Promise<TaskSpec[]>;
    getTask(taskId: string): Promise<TaskSpec | null>;
    saveTask(task: TaskSpec): Promise<TaskSpec>;
    getRunForTask(taskId: string): Promise<TaskRun | null>;
    saveRun(run: TaskRun): Promise<TaskRun>;
};
type RegisterTasksOptions = {
    service?: TaskService;
};
/**
 * Register the REAL Tasks tool handlers over an injected agent-os repository
 * port. list/get are real reads; create/update/claim are real writes through
 * the port, with run lifecycle transitions validated by the agent-os
 * {@link TaskService}. No fabricated success: a missing task yields a truthful
 * not-found error; an illegal transition is rejected by the domain service.
 */
declare function registerTasksMcpTools(router: McpToolRouter, repo: TaskRepositoryPort, options?: RegisterTasksOptions): void;
declare const TASK_RUN_STATES: readonly TaskRunState[];

declare const runsMcpServer: McpServerRegistration;
/**
 * The injected agent-os run repository port — the SAME read/write contract a
 * runtime backend implements over its store of record. agent-mcp never owns run
 * state; it operates over the port the host injects. Transitions are validated
 * by agent-os {@link transitionTaskRun} / {@link RunService} so only legal state
 * changes are persisted.
 */
type RunRepositoryPort = {
    listRuns(filter: {
        spaceId?: string;
        taskId?: string;
    }): Promise<TaskRun[]>;
    getRun(runId: string): Promise<TaskRun | null>;
    saveRun(run: TaskRun): Promise<TaskRun>;
    appendRunEvent?(runId: string, event: RunEvent): Promise<void>;
};
type RegisterRunsOptions = {
    service?: RunService;
};
/**
 * Register the REAL Runs tool handlers over an injected agent-os repository
 * port. list/get are real reads. transition moves a run through the legal
 * agent-os state machine (illegal transitions are rejected, not faked).
 * append_log/attach_evidence apply real {@link RunEvent}s via {@link RunService}.
 */
declare function registerRunsMcpTools(router: McpToolRouter, repo: RunRepositoryPort, options?: RegisterRunsOptions): void;

declare const artifactsMcpServer: McpServerRegistration;

declare const approvalsMcpServer: McpServerRegistration;

declare const browserMcpServer: McpServerRegistration;

/**
 * `recoder.browser-use` — the MCP skin over the Browser engine (RECODER-ENGINES
 * E9 browser-use). Three tools: `browser.navigate` (open a URL → status/title/url),
 * `browser.extract` (extract a page's visible text) and `browser.screenshot`
 * (base64 PNG, optional/heavy).
 *
 * This is DISTINCT from the older `recoder.browser` server (open/snapshot/verify,
 * a puppeteer session an agent verifies its own work in). This one is the owned,
 * Phase-2-style engine: the package owns NO engine logic and assumes no backing
 * browser. The host (backend) injects a concrete `BrowserEnginePort` built
 * over `@recoder/agent-browser` (puppeteer, lazily imported; or a browser-use HTTP
 * service). Every handler degrades truthfully — the engine returns a
 * `not_configured` status (never throws, never fabricates) when no driver is wired.
 */
declare const browserEngineMcpServer: McpServerRegistration;
/**
 * The host-injected browser engine. Structurally satisfied by
 * `@recoder/agent-browser`'s `BrowserEngine`; typed loosely (`unknown` results) so
 * this package needs no dependency on the engine implementation.
 */
type BrowserEnginePort = {
    navigate(url: string): Promise<unknown>;
    extractText(url?: string): Promise<unknown>;
    screenshot(url?: string): Promise<unknown>;
};
declare function registerBrowserEngineMcpTools(router: McpToolRouter, port: BrowserEnginePort): void;

declare const memoryMcpServer: McpServerRegistration;
declare function registerMemoryMcpTools(router: McpToolRouter, store: MemoryStore, workflow?: MemoryReviewWorkflow): void;

declare const workLocksMcpServer: McpServerRegistration;
type WorkLocksMcpState = {
    listWorkLocks(): WorkLock[];
    replaceWorkLocks(locks: WorkLock[]): WorkLock[] | void | Promise<WorkLock[] | void>;
};
declare function registerWorkLocksMcpTools(router: McpToolRouter, state: WorkLocksMcpState, service?: WorkLockService): void;

declare const deploymentMcpServer: McpServerRegistration;

declare const billingMcpServer: McpServerRegistration;

declare const gitNexusMcpServer: McpServerRegistration;
/**
 * The host injects how Git Nexus tools resolve a repository on disk. The package
 * stays runtime-agnostic: it never assumes the backend's filesystem layout or a
 * default repo root. The host (backend) supplies the concrete resolver.
 */
type GitNexusPort = {
    /**
     * Resolve a repo root to an absolute, scannable directory. May validate that
     * the path exists / is allowed. Return a string the recodergit indexer can
     * walk. Throw a truthful error when the repo is unknown/unconfigured.
     */
    resolveRepoRoot(input: {
        repo?: string;
        spaceId?: string;
    }): Promise<string> | string;
};
type RegisterGitNexusOptions = {
    /** Real recodergit indexer. Defaults to the package's on-disk indexer. */
    indexer?: RepoIndexer;
};
/**
 * Register the REAL Git Nexus tool handlers, backed by the `@recoder/recodergit`
 * indexer. `context_pack`/`impact_report` walk the repo on disk, parse real
 * import edges, and compute graph-reachability impact. `search_code` greps the
 * indexed source files. Every handler degrades truthfully (empty results, not
 * fabricated success) when the repo cannot be resolved or scanned.
 */
declare function registerGitNexusMcpTools(router: McpToolRouter, port: GitNexusPort, options?: RegisterGitNexusOptions): void;

/**
 * recodergit code-knowledge-graph MCP server registration.
 *
 * Exposes the read-only code-graph tools of the vendored `recodergit` engine
 * (Streamable HTTP at POST /mcp) to Recoder agents THROUGH the host's existing
 * permission/risk/audit path. Every tool here is read-only over code; none match
 * the host's high/medium-risk keyword heuristics, so they score `low` risk.
 *
 * Registration is governed and FLAG-GATED: this object is only added to the live
 * server list by the host when RECODER_CODE_GRAPH_ENABLED is on AND the
 * supervised `mcp --http` process is being brought up (see the host wiring in
 * backend). It is never a raw passthrough — calls still flow through
 * checkMcpToolPermission + audit.
 */
declare const recodergitMcpServer: McpServerRegistration;

declare const beadsMcpServer: McpServerRegistration;

declare const ossMcpServer: McpServerRegistration;

declare const previewMcpServer: McpServerRegistration;

declare const logsMcpServer: McpServerRegistration;

/**
 * `recoder.retrieval` — the MCP skin over the Retrieval/RAG engine (E2). Two
 * tools: `retrieval.ingest` (chunk → embed → store a document) and
 * `retrieval.search` (embed the query → vector search → ColBERT rerank → passages).
 *
 * The package stays runtime-agnostic: it owns NO engine logic and assumes no
 * backing service. The host (backend) injects a concrete `RetrievalPort`
 * built over the shared vector foundation (`vector-store.ts`) + `@recoder/retrieval`.
 * Every handler degrades truthfully — the engine returns a `not_configured` status
 * (never throws, never fabricates) when no embedder/vector store is present.
 */
declare const retrievalMcpServer: McpServerRegistration;
/**
 * The host-injected retrieval engine. Structurally satisfied by
 * `@recoder/retrieval`'s `RetrievalEngine`; typed loosely (`unknown` results) so
 * this package needs no dependency on the engine implementation.
 */
type RetrievalPort = {
    ingest(input: {
        text?: string;
        path?: string;
        docId?: string;
        source?: string;
        metadata?: Record<string, unknown>;
    }): Promise<unknown>;
    search(query: string, topK?: number): Promise<unknown>;
};
declare function registerRetrievalMcpTools(router: McpToolRouter, port: RetrievalPort): void;

/**
 * The documented coding-workspace surface of the Recoder MCP host:
 * `workspace.create` / `workspace.diff` / `workspace.merge`. These are the
 * Agent OS control-plane counterparts of the conductor workspace endpoints
 * (`POST /workspaces`, `GET /workspaces/:id/diff`, `POST /workspaces/:id/merge`).
 *
 * agent-mcp stays runtime-agnostic: it never owns workspace state, never assumes
 * a substrate, worktree layout, or git remote. It operates ONLY over the
 * {@link WorkspaceRepositoryPort} the host (backend) injects, exactly like
 * the tasks and git_nexus servers inject their ports.
 */
declare const workspaceMcpServer: McpServerRegistration;
/**
 * Create a coding workspace. Mirrors the conductor `createWorkspace` input
 * surface, but owned by this package so core packages do not couple to a runtime.
 */
type WorkspaceCreateInput = {
    /** Free-form task/prompt the workspace agent should work on. */
    prompt: string;
    /** Owning Agent OS space / project. */
    spaceId?: string;
    /** Logical repo identifier the host resolves to a checkout. */
    repo?: string;
    /** Base git ref to branch the worktree from (defaults host-side). */
    baseRef?: string;
    /** Branch name to use for the worktree (defaults host-side). */
    branch?: string;
    /** Agent id that should run inside the workspace. */
    agentId?: string;
    /** Identity creating the workspace, for audit/ownership. */
    createdBy?: string;
    metadata?: Record<string, unknown>;
};
/** A created/known workspace record. Minimal, runtime-agnostic shape. */
type WorkspaceRecord = {
    workspaceId: string;
    state: string;
    branch?: string;
    baseRef?: string;
    spaceId?: string;
    repo?: string;
    worktreePath?: string;
};
/** Reviewable diff of a workspace worktree against its base ref. */
type WorkspaceDiffResult = {
    workspaceId: string;
    baseRef: string;
    branch: string;
    /** `git diff --stat` summary against the base. */
    stat: string;
    /** Full unified patch of tracked changes against the base. */
    patch: string;
    /** Untracked files in the worktree (not yet in the patch). */
    untracked: string[];
    changedFiles: number;
};
type WorkspaceMergeInput = {
    strategy?: 'squash' | 'merge' | 'rebase';
    deleteBranch?: boolean;
};
type WorkspaceMergeResult = {
    workspaceId: string;
    branch: string;
    merged: boolean;
};
/**
 * The injected workspace control-plane port. A runtime backend (backend's
 * conductor) implements this over its store of record. Every method must degrade
 * truthfully: a missing workspace yields a real not-found error; an un-approved
 * merge throws an approval error rather than fabricating `merged: true`.
 */
type WorkspaceRepositoryPort = {
    createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceRecord>;
    diffWorkspace(workspaceId: string): Promise<WorkspaceDiffResult>;
    mergeWorkspace(workspaceId: string, input: WorkspaceMergeInput): Promise<WorkspaceMergeResult>;
};
/**
 * Register the REAL workspace tool handlers over an injected control-plane port.
 *
 * - `workspace.create` provisions a coding workspace through the host port.
 * - `workspace.diff` returns the reviewable worktree diff against the base ref.
 * - `workspace.merge` is the customer-visible delivery action; it is risk-gated
 *   by {@link estimateMcpToolRisk} and the host MUST enforce approval before the
 *   injected port performs the merge. The handler never fabricates success — it
 *   surfaces whatever truthful result/error the port returns.
 */
declare function registerWorkspaceMcpTools(router: McpToolRouter, port: WorkspaceRepositoryPort): void;

/**
 * `recoder.coordination` — the MCP skin over the advisory Coordination engine
 * (RECODER-ENGINES E13: work-locks, conflict detection, handoff). Four tools:
 * `coordination.acquire_lock`, `coordination.release_lock`,
 * `coordination.list_locks`, `coordination.detect_conflict`.
 *
 * This SUPERSEDES the older `recoder.work_locks` server (`work_locks.list/acquire/
 * release`), which throws on conflict and is bound to the agent-os `WorkLockService`
 * + in-memory state callbacks. This skin is the owned-engine mirror of
 * `retrieval-server.ts`: the package owns NO engine logic and assumes no backing
 * store. The host (backend) injects a concrete `CoordinationPort` built over
 * `@recoder/coordination`'s advisory engine + an injectable lock store (in-memory
 * default; a Go `multica` daemon or DB store later). Every handler degrades
 * truthfully — the engine returns a `not_configured` status (never throws, never
 * fabricates) when no lock store is wired.
 */
declare const coordinationMcpServer: McpServerRegistration;
/**
 * The host-injected coordination engine. Structurally satisfied by
 * `@recoder/coordination`'s `CoordinationLockEngine`; typed loosely (`unknown`
 * results) so this package needs no dependency on the engine implementation.
 */
type CoordinationPort = {
    acquireLock(resource: string, holder: string, opts?: {
        ttlMs?: number;
        metadata?: Record<string, unknown>;
        lockId?: string;
    }): Promise<unknown>;
    releaseLock(lockIdOrResource: string, holder: string): Promise<unknown>;
    listLocks(filter?: {
        resource?: string;
        holder?: string;
    }): Promise<unknown>;
    detectConflict(resource: string, holder: string): Promise<unknown>;
};
declare function registerCoordinationMcpTools(router: McpToolRouter, port: CoordinationPort): void;

/**
 * `recoder.workflow` — the MCP skin over the Workflow+Hooks engine (RECODER-ENGINES
 * E12). Two tools: `workflow.verify` (run a named verification workflow over a
 * TaskSpec/run → a truthful verdict `{ status, checks[], passed }`) and
 * `workflow.capture_hook` (capture a hook artifact + run a secret-scan →
 * `{ status, findings[] }`).
 *
 * The package stays runtime-agnostic: it owns NO engine logic. The host
 * (backend) injects a concrete `WorkflowPort` built over
 * `@recoder/workflow-engine` (which skins `@recoder/agent-workflows` +
 * `@recoder/agent-hooks`). Every handler degrades truthfully — the engine returns a
 * `not_configured` status (never throws, never fabricates) when no verification
 * runner / hook runner is wired.
 */
declare const workflowMcpServer: McpServerRegistration;
/**
 * The host-injected workflow engine. Structurally satisfied by
 * `@recoder/workflow-engine`'s `WorkflowEngine`; typed loosely (`unknown` results)
 * so this package needs no dependency on the engine implementation.
 */
type WorkflowPort = {
    verify(input: {
        workflow?: string;
        taskId?: string;
        runId?: string;
        task?: {
            taskId?: string;
            intent?: string;
        } & Record<string, unknown>;
        checks?: Array<{
            name: string;
            kind?: string;
            config?: Record<string, unknown>;
        }>;
    }): Promise<unknown>;
    captureHook(input: {
        hook?: string;
        content?: string;
        command?: string;
        changedFiles?: string[];
        output?: string;
        exitCode?: number;
        taskId?: string;
        runId?: string;
    }): Promise<unknown>;
};
declare function registerWorkflowMcpTools(router: McpToolRouter, port: WorkflowPort): void;

/**
 * `recoder.pal-plan` — the MCP skin over the in-proc PAL planning engine
 * (RECODER-ENGINES E11). One tool: `pal.plan` — given a task spec it returns a
 * governance decision `{ runtimeId, substrate, toolGrants[], risk, approvalRequired }`.
 *
 * This is a FAST, dependency-free complement to the external Python PAL MCP
 * server (`backend/engines/py/pal-mcp-server`); it does not replace or disturb it.
 *
 * The package stays runtime-agnostic: it owns NO planning logic and assumes no
 * config. The host (backend) injects a concrete `PalPlanPort` backed by
 * `@recoder/pal`'s pure decision functions. The handler is DENY-BIASED and
 * degrade-safe — it never throws on missing/invalid input; the engine returns a
 * conservative default decision (`approvalRequired: true`, no grants) instead.
 */
declare const palPlanMcpServer: McpServerRegistration;
/**
 * The host-injected PAL planning engine. Structurally satisfied by
 * `@recoder/pal`'s `computePalPlanDecision`; typed loosely (`unknown` result) so
 * this package needs no dependency on the engine implementation.
 */
type PalPlanPort = {
    plan(taskSpec: unknown): Promise<unknown> | unknown;
};
declare function registerPalPlanMcpTools(router: McpToolRouter, port: PalPlanPort): void;

/**
 * `recoder.notify` — the MCP skin over the NOTIFY engine. One tool: `notify.send`
 * (post a human-facing notification, e.g. "delivery ready for review", to a
 * configured webhook).
 *
 * The package stays runtime-agnostic: it owns NO engine logic and assumes no
 * backing service. The host (backend) injects a concrete `NotifyPort` built
 * over the owned `@recoder/agent-notify` engine. Every handler degrades truthfully
 * — the engine returns a `not_configured` status (never throws, never fabricates a
 * send) when no webhook url is resolvable.
 */
declare const notifyMcpServer: McpServerRegistration;
/**
 * The host-injected notify engine. Structurally satisfied by
 * `@recoder/agent-notify`'s `NotifyEngine`; typed loosely (`unknown` result) so
 * this package needs no dependency on the engine implementation.
 */
type NotifyPort = {
    notify(input: {
        message: string;
        title?: string;
        level?: 'info' | 'warn' | 'error';
        url?: string;
    }): Promise<unknown>;
};
declare function registerNotifyMcpTools(router: McpToolRouter, port: NotifyPort): void;

type McpToolRisk = 'low' | 'medium' | 'high';
declare function estimateMcpToolRisk(toolName: string): McpToolRisk;

declare function checkMcpToolPermission(input: McpToolCallInput): McpToolCallDecision;

type McpToolCallStatus = 'requested' | 'denied' | 'needs_approval' | 'approved' | 'completed' | 'failed';
type McpToolCall = {
    callId: string;
    serverId: string;
    toolName: string;
    actorAgentId: string;
    taskId?: string;
    args: Record<string, unknown>;
    requestedAt: string;
    completedAt?: string;
    status: McpToolCallStatus;
};
type McpToolAuditEvent = {
    eventId: string;
    call: McpToolCall;
    decision: McpToolCallDecision;
    policyDecision?: PolicyDecision;
    error?: string;
};
declare function createMcpToolCall(input: McpToolCallInput, now?: string): McpToolCall;
declare function createMcpToolAuditEvent(input: {
    call: McpToolCall;
    decision: McpToolCallDecision;
    status: McpToolCallStatus;
    error?: string;
    now?: string;
}): McpToolAuditEvent;

export { type BrowserEnginePort, type CoordinationPort, type GitNexusPort, McpRegistry, type McpServerKind, type McpServerRegistration, type McpSession, McpSessionManager, type McpToolAuditErrorSink, type McpToolAuditEvent, type McpToolAuditRecord, type McpToolAuditSink, type McpToolCall, type McpToolCallDecision, type McpToolCallInput, type McpToolCallStatus, type McpToolExecutor, type McpToolHandler, type McpToolResult, type McpToolRisk, McpToolRouter, type NotifyPort, type PalPlanPort, RecoderMcpHost, type RegisterGitNexusOptions, type RegisterRunsOptions, type RegisterTasksOptions, type RetrievalPort, type RunRepositoryPort, TASK_RUN_STATES, type TaskRepositoryPort, type WorkLocksMcpState, type WorkflowPort, type WorkspaceCreateInput, type WorkspaceDiffResult, type WorkspaceMergeInput, type WorkspaceMergeResult, type WorkspaceRecord, type WorkspaceRepositoryPort, approvalsMcpServer, artifactsMcpServer, beadsMcpServer, billingMcpServer, browserEngineMcpServer, browserMcpServer, canCallMcpTool, checkMcpToolPermission, coordinationMcpServer, createMcpToolAuditEvent, createMcpToolCall, deploymentMcpServer, estimateMcpToolRisk, gitNexusMcpServer, githubMcpServer, logsMcpServer, memoryMcpServer, notifyMcpServer, ossMcpServer, palPlanMcpServer, previewMcpServer, recodergitMcpServer, registerBrowserEngineMcpTools, registerCoordinationMcpTools, registerGitNexusMcpTools, registerMemoryMcpTools, registerNotifyMcpTools, registerPalPlanMcpTools, registerRetrievalMcpTools, registerRunsMcpTools, registerTasksMcpTools, registerWorkLocksMcpTools, registerWorkflowMcpTools, registerWorkspaceMcpTools, repoMcpServer, retrievalMcpServer, runsMcpServer, tasksMcpServer, workLocksMcpServer, workflowMcpServer, workspaceMcpServer };
