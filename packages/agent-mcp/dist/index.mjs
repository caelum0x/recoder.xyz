// src/registry.ts
var McpRegistry = class {
  servers = /* @__PURE__ */ new Map();
  register(server) {
    this.servers.set(server.serverId, server);
    return server;
  }
  list() {
    return [...this.servers.values()];
  }
  get(serverId) {
    return this.servers.get(serverId) ?? null;
  }
};

// src/permissions.ts
function canCallMcpTool(input) {
  if (!input.server.enabled) {
    return {
      allowed: false,
      reason: `MCP server disabled: ${input.server.serverId}`,
      policyDecision: createMcpPolicyDecision(input, "deny", `MCP server disabled: ${input.server.serverId}`)
    };
  }
  if (!input.server.toolNames.includes(input.toolName)) {
    return {
      allowed: false,
      reason: `Tool not registered on MCP server: ${input.toolName}`,
      policyDecision: createMcpPolicyDecision(input, "deny", `Tool not registered on MCP server: ${input.toolName}`)
    };
  }
  const rule = input.actor.permissions.toolRules.find((candidate) => candidate.toolName === input.toolName);
  if (rule?.effect === "deny") {
    const reason = rule.reason ?? `Tool denied: ${input.toolName}`;
    return {
      allowed: false,
      reason,
      policyDecision: createMcpPolicyDecision(input, "deny", reason)
    };
  }
  return {
    allowed: true,
    reason: "Allowed by MCP registry and agent tool policy.",
    policyDecision: createMcpPolicyDecision(input, "allow", "Allowed by MCP registry and agent tool policy.")
  };
}
function createMcpPolicyDecision(input, effect, reason) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    decisionId: `policy_mcp_${now.replace(/[^0-9]/g, "")}_${Math.random().toString(16).slice(2)}`,
    effect,
    action: "tool.call",
    actorAgentId: input.actor.agentId,
    taskId: input.task?.taskId,
    reason,
    createdAt: now,
    approval: effect === "needs_approval" ? { required: true, reason } : void 0,
    metadata: {
      serverId: input.server.serverId,
      toolName: input.toolName
    }
  };
}

// src/policy/permission-check.ts
import { evaluatePolicy } from "@recoder/agent-policy";

// src/policy/tool-risk.ts
function estimateMcpToolRisk(toolName) {
  if (/secret|billing|deploy|production|delete|write|push|pr\.create|merge|clink/.test(toolName)) {
    return "high";
  }
  if (/command|browser|preview|artifact|memory|approval|repo\.diff|workspace\.diff|workspace\.create/.test(toolName)) {
    return "medium";
  }
  return "low";
}

// src/policy/permission-check.ts
function checkMcpToolPermission(input) {
  const base = canCallMcpTool(input);
  if (!base.allowed) {
    return base;
  }
  const risk = estimateMcpToolRisk(input.toolName);
  const policyDecision = evaluatePolicy({
    actor: input.actor,
    task: input.task,
    action: "tool.call",
    target: {
      toolName: input.toolName
    }
  });
  if (policyDecision.effect === "deny") {
    return {
      allowed: false,
      reason: policyDecision.reason,
      policyDecision
    };
  }
  if (policyDecision.effect === "needs_approval") {
    return {
      allowed: false,
      requiresApproval: true,
      reason: policyDecision.reason,
      policyDecision
    };
  }
  return {
    allowed: true,
    reason: `Allowed by MCP policy router. Risk=${risk}.`,
    policyDecision
  };
}

// src/host/mcp-host.ts
var RecoderMcpHost = class {
  constructor(executor, audit, onAuditError) {
    this.executor = executor;
    this.audit = audit;
    this.onAuditError = onAuditError;
  }
  authorize(input) {
    return checkMcpToolPermission(input);
  }
  async call(input) {
    const callId = `mcp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const decision = this.authorize(input);
    if (!decision.allowed) {
      await this.emitAudit(input, decision, {
        callId,
        startedAt,
        status: decision.requiresApproval ? "needs_approval" : "denied",
        error: decision.reason
      });
      throw new Error(decision.reason);
    }
    try {
      const result = await this.executor.call(input);
      await this.emitAudit(input, decision, {
        callId,
        startedAt,
        status: "completed"
      });
      return result;
    } catch (error) {
      await this.emitAudit(input, decision, {
        callId,
        startedAt,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  async emitAudit(input, decision, record) {
    if (!this.audit) return;
    const auditRecord = {
      callId: record.callId,
      serverId: input.server.serverId,
      toolName: input.toolName,
      actorAgentId: input.actor.agentId,
      taskId: input.task?.taskId,
      decision,
      status: record.status,
      startedAt: record.startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: record.error
    };
    try {
      await this.audit(auditRecord);
    } catch (error) {
      this.reportAuditError(error, auditRecord);
    }
  }
  /** Report a dropped audit record without letting the report itself throw. */
  reportAuditError(error, record) {
    if (!this.onAuditError) return;
    try {
      this.onAuditError(error, record);
    } catch {
    }
  }
};

// src/host/session-manager.ts
var McpSessionManager = class {
  sessions = /* @__PURE__ */ new Map();
  upsert(input) {
    const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
    const existing = this.sessions.get(input.sessionId);
    const session = {
      sessionId: input.sessionId,
      agentId: input.agent.agentId,
      spaceId: input.spaceId,
      connectedAt: existing?.connectedAt ?? now,
      lastSeenAt: now,
      metadata: {
        ...existing?.metadata ?? {},
        ...input.metadata ?? {}
      }
    };
    this.sessions.set(input.sessionId, session);
    return session;
  }
  list() {
    return [...this.sessions.values()];
  }
  get(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }
  remove(sessionId) {
    return this.sessions.delete(sessionId);
  }
};

// src/host/tool-router.ts
var McpToolRouter = class {
  constructor(registry) {
    this.registry = registry;
  }
  handlers = /* @__PURE__ */ new Map();
  register(server, toolName, handler) {
    this.registry.register(server);
    this.handlers.set(`${server.serverId}:${toolName}`, handler);
  }
  async call(input) {
    const handler = this.handlers.get(`${input.server.serverId}:${input.toolName}`);
    if (!handler) {
      throw new Error(`No MCP handler registered for ${input.server.serverId}:${input.toolName}`);
    }
    return handler(input);
  }
};

// src/servers/github-server.ts
var githubMcpServer = {
  serverId: "recoder.github",
  kind: "github",
  displayName: "Recoder GitHub",
  transport: "http",
  enabled: true,
  toolNames: ["github.search", "github.pr.create", "github.pr.comment", "github.pr_review"]
};

// src/servers/repo-server.ts
var repoMcpServer = {
  serverId: "recoder.repo",
  kind: "repo",
  displayName: "Recoder Repository",
  transport: "http",
  enabled: true,
  toolNames: ["repo.read", "repo.search", "repo.diff"]
};

// src/servers/tasks-server.ts
import { TaskService } from "@recoder/agent-os";
var tasksMcpServer = {
  serverId: "recoder.tasks",
  kind: "tasks",
  displayName: "Recoder Tasks",
  transport: "http",
  enabled: true,
  toolNames: ["tasks.list", "tasks.get", "tasks.create", "tasks.update", "tasks.claim"]
};
function registerTasksMcpTools(router, repo, options = {}) {
  const service = options.service ?? new TaskService();
  router.register(tasksMcpServer, "tasks.list", async (input) => {
    const tasks = await repo.listTasks({
      spaceId: readString(input.args.spaceId) ?? input.task?.spaceId,
      intent: readString(input.args.intent)
    });
    return { content: tasks, metadata: { count: tasks.length } };
  });
  router.register(tasksMcpServer, "tasks.get", async (input) => {
    const taskId = readRequiredString(input.args.taskId, "taskId");
    const task = await repo.getTask(taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    const run = await repo.getRunForTask(taskId);
    return { content: { task, run }, metadata: { runState: run?.state } };
  });
  router.register(tasksMcpServer, "tasks.create", async (input) => {
    const task = readTaskSpec(input.args);
    const saved = await repo.saveTask(task);
    return { content: saved };
  });
  router.register(tasksMcpServer, "tasks.update", async (input) => {
    const taskId = readRequiredString(input.args.taskId, "taskId");
    const existing = await repo.getTask(taskId);
    if (!existing) {
      throw new Error(`task not found: ${taskId}`);
    }
    const updated = applyTaskPatch(existing, input.args);
    const saved = await repo.saveTask(updated);
    return { content: saved };
  });
  router.register(tasksMcpServer, "tasks.claim", async (input) => {
    const taskId = readRequiredString(input.args.taskId, "taskId");
    const task = await repo.getTask(taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    const assigneeAgentId = readString(input.args.assigneeAgentId) ?? input.actor.agentId;
    const existingRun = await repo.getRunForTask(taskId);
    const run = existingRun ?? service.createRun({
      runId: readString(input.args.runId) ?? `run_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      task,
      assigneeAgentId
    });
    const claimed = claimRun(service, { ...run, assigneeAgentId }, assigneeAgentId);
    const saved = await repo.saveRun(claimed);
    return { content: { task, run: saved }, metadata: { runState: saved.state } };
  });
}
function claimRun(service, run, claimedBy) {
  const path = ["compiled", "routed", "claimed"];
  const startIndex = path.indexOf(run.state);
  const remaining = startIndex >= 0 ? path.slice(startIndex + 1) : path;
  let current = run;
  for (const next of remaining) {
    current = service.transition(current, next, { claimedBy });
  }
  if (current.state !== "claimed") {
    return { ...current, assigneeAgentId: claimedBy };
  }
  return current;
}
function applyTaskPatch(existing, args) {
  return {
    ...existing,
    title: readString(args.title) ?? existing.title,
    goal: readString(args.goal) ?? existing.goal,
    targetPaths: readStringArray(args.targetPaths) ?? existing.targetPaths,
    forbiddenPaths: readStringArray(args.forbiddenPaths) ?? existing.forbiddenPaths,
    acceptanceCriteria: readStringArray(args.acceptanceCriteria) ?? existing.acceptanceCriteria,
    metadata: isRecord(args.metadata) ? { ...existing.metadata, ...args.metadata } : existing.metadata
  };
}
function readTaskSpec(args) {
  return {
    taskId: readString(args.taskId) ?? `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: readRequiredString(args.title, "title"),
    intent: readTaskIntent(args.intent),
    goal: readRequiredString(args.goal, "goal"),
    spaceId: readRequiredString(args.spaceId, "spaceId"),
    repo: readString(args.repo),
    targetPaths: readStringArray(args.targetPaths) ?? [],
    forbiddenPaths: readStringArray(args.forbiddenPaths) ?? [],
    acceptanceCriteria: readStringArray(args.acceptanceCriteria) ?? [],
    verification: readVerification(args.verification),
    approvalRequired: readStringArray(args.approvalRequired) ?? [],
    artifactRequired: readStringArray(args.artifactRequired) ?? [],
    metadata: isRecord(args.metadata) ? args.metadata : void 0
  };
}
var TASK_INTENTS = /* @__PURE__ */ new Set([
  "bugfix",
  "feature_delivery",
  "platform_hardening",
  "refactor",
  "code_review",
  "test_generation",
  "verification",
  "documentation",
  "research",
  "release",
  "incident_response",
  "migration",
  "handoff",
  "custom"
]);
function readTaskIntent(value) {
  const intent = readString(value);
  if (intent && TASK_INTENTS.has(intent)) {
    return intent;
  }
  return "custom";
}
function readVerification(value) {
  if (isRecord(value)) {
    return {
      commands: readStringArray(value.commands) ?? [],
      browserChecks: readStringArray(value.browserChecks),
      evidenceRequired: readStringArray(value.evidenceRequired)
    };
  }
  return { commands: [] };
}
var TASK_RUN_STATES = [
  "created",
  "compiled",
  "routed",
  "claimed",
  "running",
  "needs_input",
  "verifying",
  "waiting_for_approval",
  "approved",
  "delivered",
  "completed",
  "failed",
  "cancelled",
  "rejected"
];
function readStringArray(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
function readRequiredString(value, field) {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/servers/runs-server.ts
import {
  RunService,
  transitionTaskRun
} from "@recoder/agent-os";
var runsMcpServer = {
  serverId: "recoder.runs",
  kind: "runs",
  displayName: "Recoder Runs",
  transport: "http",
  enabled: true,
  toolNames: ["runs.list", "runs.get", "runs.transition", "runs.append_log", "runs.attach_evidence"]
};
function registerRunsMcpTools(router, repo, options = {}) {
  const service = options.service ?? new RunService();
  router.register(runsMcpServer, "runs.list", async (input) => {
    const runs = await repo.listRuns({
      spaceId: readString2(input.args.spaceId) ?? input.task?.spaceId,
      taskId: readString2(input.args.taskId) ?? input.task?.taskId
    });
    return { content: runs, metadata: { count: runs.length } };
  });
  router.register(runsMcpServer, "runs.get", async (input) => {
    const run = await requireRun(repo, input.args.runId);
    return { content: run, metadata: { runState: run.state } };
  });
  router.register(runsMcpServer, "runs.transition", async (input) => {
    const run = await requireRun(repo, input.args.runId);
    const to = readRunState(input.args.to);
    const next = transitionTaskRun(run, to, {
      metadata: isRecord2(input.args.metadata) ? input.args.metadata : void 0
    });
    const saved = await repo.saveRun(next);
    return {
      content: saved,
      metadata: { from: run.state, to: saved.state }
    };
  });
  router.register(runsMcpServer, "runs.append_log", async (input) => {
    const run = await requireRun(repo, input.args.runId);
    const event = buildLogEvent(run, input);
    const next = service.appendEvent(run, event);
    const saved = await repo.saveRun(next);
    if (repo.appendRunEvent) {
      await repo.appendRunEvent(run.runId, event);
    }
    return { content: saved, metadata: { runState: saved.state } };
  });
  router.register(runsMcpServer, "runs.attach_evidence", async (input) => {
    const run = await requireRun(repo, input.args.runId);
    const event = buildEvidenceEvent(run, input);
    const result = service.applyEvent(run, event);
    const saved = await repo.saveRun(result.run);
    if (repo.appendRunEvent) {
      await repo.appendRunEvent(run.runId, event);
    }
    return {
      content: saved,
      metadata: { applied: result.applied, reason: result.reason, runState: saved.state }
    };
  });
}
async function requireRun(repo, runIdValue) {
  const runId = readRequiredString2(runIdValue, "runId");
  const run = await repo.getRun(runId);
  if (!run) {
    throw new Error(`run not found: ${runId}`);
  }
  return run;
}
function buildLogEvent(run, input) {
  return {
    eventId: readString2(input.args.eventId) ?? `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: "log",
    runId: run.runId,
    taskId: run.taskId,
    agentId: readString2(input.args.agentId) ?? input.actor.agentId,
    createdAt: readString2(input.args.createdAt) ?? (/* @__PURE__ */ new Date()).toISOString(),
    message: readRequiredString2(input.args.message, "message"),
    data: { level: readString2(input.args.level) ?? "info" }
  };
}
function buildEvidenceEvent(run, input) {
  const state = readOptionalRunState(input.args.state);
  return {
    eventId: readString2(input.args.eventId) ?? `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: state ? "state_transition" : "artifact",
    runId: run.runId,
    taskId: run.taskId,
    agentId: readString2(input.args.agentId) ?? input.actor.agentId,
    createdAt: readString2(input.args.createdAt) ?? (/* @__PURE__ */ new Date()).toISOString(),
    artifactId: readString2(input.args.artifactId),
    state,
    data: {
      kind: readString2(input.args.kind),
      detail: readString2(input.args.detail)
    }
  };
}
var RUN_STATES = /* @__PURE__ */ new Set([
  "created",
  "compiled",
  "routed",
  "claimed",
  "running",
  "needs_input",
  "verifying",
  "waiting_for_approval",
  "approved",
  "delivered",
  "completed",
  "failed",
  "cancelled",
  "rejected"
]);
function readRunState(value) {
  const state = readString2(value);
  if (state && RUN_STATES.has(state)) {
    return state;
  }
  throw new Error(`invalid run state: ${String(value)}`);
}
function readOptionalRunState(value) {
  const state = readString2(value);
  return state && RUN_STATES.has(state) ? state : void 0;
}
function readRequiredString2(value, field) {
  const result = readString2(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString2(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/servers/artifacts-server.ts
var artifactsMcpServer = {
  serverId: "recoder.artifacts",
  kind: "artifacts",
  displayName: "Recoder Artifacts",
  transport: "http",
  enabled: true,
  toolNames: ["artifacts.list", "artifacts.get", "artifacts.create", "artifacts.link"]
};

// src/servers/approvals-server.ts
var approvalsMcpServer = {
  serverId: "recoder.approvals",
  kind: "approvals",
  displayName: "Recoder Approvals",
  transport: "http",
  enabled: true,
  toolNames: ["approvals.list", "approvals.request", "approvals.decide", "approvals.status"]
};

// src/servers/browser-server.ts
var browserMcpServer = {
  serverId: "recoder.browser",
  kind: "browser",
  displayName: "Recoder Browser",
  transport: "http",
  enabled: true,
  toolNames: ["browser.open", "browser.snapshot", "browser.verify"]
};

// src/servers/browser-engine-server.ts
var browserEngineMcpServer = {
  serverId: "recoder.browser-use",
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: "custom",
  displayName: "Recoder Browser (browser-use)",
  transport: "http",
  enabled: true,
  toolNames: ["browser.navigate", "browser.extract", "browser.screenshot"],
  metadata: { engine: "browser-use" }
};
function registerBrowserEngineMcpTools(router, port) {
  router.register(browserEngineMcpServer, "browser.navigate", async (input) => {
    const url = readRequiredString3(input.args.url, "url");
    const result = await port.navigate(url);
    return { content: result, metadata: { engine: "browser-use" } };
  });
  router.register(browserEngineMcpServer, "browser.extract", async (input) => {
    const url = readString3(input.args.url);
    const result = await port.extractText(url);
    return { content: result, metadata: { engine: "browser-use" } };
  });
  router.register(browserEngineMcpServer, "browser.screenshot", async (input) => {
    const url = readString3(input.args.url);
    const result = await port.screenshot(url);
    return { content: result, metadata: { engine: "browser-use" } };
  });
}
function readRequiredString3(value, field) {
  const result = readString3(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString3(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}

// src/servers/memory-server.ts
import { MemoryReviewWorkflow } from "@recoder/agent-memory";
var memoryMcpServer = {
  serverId: "recoder.memory",
  kind: "memory",
  displayName: "Recoder Memory",
  transport: "http",
  enabled: true,
  toolNames: ["memory.search", "memory.candidate.create", "memory.review"]
};
function registerMemoryMcpTools(router, store, workflow = new MemoryReviewWorkflow(store)) {
  router.register(memoryMcpServer, "memory.search", async (input) => ({
    content: await store.search(readRequiredString4(input.args.query, "query"), {
      scope: readString4(input.args.scope),
      limit: readNumber(input.args.limit)
    })
  }));
  router.register(memoryMcpServer, "memory.candidate.create", async (input) => {
    const taskId = readString4(input.args.taskId) ?? readEvidenceTaskId(input.args.evidence) ?? input.task?.taskId;
    const artifactId = readString4(input.args.artifactId) ?? readEvidenceArtifactId(input.args.evidence);
    if (!taskId || !artifactId) {
      throw new Error("memory candidates require taskId and artifactId evidence");
    }
    const candidate = await workflow.propose({
      candidateId: readString4(input.args.candidateId) ?? `memcand_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      scope: readMemoryScope(input.args.scope),
      title: readRequiredString4(input.args.title, "title"),
      body: readRequiredString4(input.args.body, "body"),
      evidence: { taskId, artifactId },
      proposedBy: readString4(input.args.proposedBy) ?? input.actor.agentId,
      proposedAt: readString4(input.args.proposedAt),
      expiresAt: readNullableString(input.args.expiresAt)
    });
    return { content: candidate };
  });
  router.register(memoryMcpServer, "memory.review", async (input) => {
    const candidate = await resolveCandidate(store, input.args);
    const accepted = readBoolean(input.args.accepted);
    if (accepted === void 0) {
      throw new Error("accepted boolean is required");
    }
    return {
      content: await workflow.review({
        candidate,
        accepted,
        reviewedBy: readString4(input.args.reviewedBy) ?? input.actor.agentId,
        reviewedAt: readString4(input.args.reviewedAt),
        reason: readString4(input.args.reason),
        memoryId: readString4(input.args.memoryId),
        supersedesMemoryId: readString4(input.args.supersedesMemoryId)
      })
    };
  });
}
async function resolveCandidate(store, args) {
  if (isMemoryCandidate(args.candidate)) {
    return args.candidate;
  }
  const candidateId = readRequiredString4(args.candidateId, "candidateId");
  const candidates = await store.listCandidates(readString4(args.scope));
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`memory candidate not found: ${candidateId}`);
  }
  return candidate;
}
function readRequiredString4(value, field) {
  const result = readString4(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString4(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readNullableString(value) {
  if (value === null) return null;
  return readString4(value);
}
function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readBoolean(value) {
  return typeof value === "boolean" ? value : void 0;
}
function readMemoryScope(value) {
  const scope = readString4(value);
  if (scope === "user" || scope === "org" || scope === "space" || scope === "repo" || scope === "path" || scope === "agent" || scope === "task-type") {
    return scope;
  }
  return "repo";
}
function readEvidenceArtifactId(value) {
  if (!isRecord3(value)) {
    return void 0;
  }
  return readString4(value.artifactId) ?? readString4(value.artifact_id);
}
function readEvidenceTaskId(value) {
  if (!isRecord3(value)) {
    return void 0;
  }
  return readString4(value.taskId) ?? readString4(value.task_id);
}
function isMemoryCandidate(value) {
  return isRecord3(value) && typeof value.candidateId === "string" && readMemoryScope(value.scope) === value.scope && typeof value.title === "string" && typeof value.body === "string" && value.status === "candidate_created" && typeof value.proposedBy === "string" && typeof value.proposedAt === "string" && isRecord3(value.evidence) && typeof value.evidence.taskId === "string" && typeof value.evidence.artifactId === "string";
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/servers/work-locks-server.ts
import { WorkLockService } from "@recoder/agent-os";
var workLocksMcpServer = {
  serverId: "recoder.work_locks",
  kind: "custom",
  displayName: "Recoder Work Locks",
  transport: "http",
  enabled: true,
  toolNames: ["work_locks.list", "work_locks.acquire", "work_locks.release"]
};
function registerWorkLocksMcpTools(router, state, service = new WorkLockService()) {
  router.register(workLocksMcpServer, "work_locks.list", () => ({
    content: state.listWorkLocks()
  }));
  router.register(workLocksMcpServer, "work_locks.acquire", async (input) => {
    const result = service.acquire({
      spaceId: readRequiredString5(input.args.spaceId, "spaceId"),
      pathGlob: readRequiredString5(input.args.pathGlob, "pathGlob"),
      ownerAgentId: readString5(input.args.ownerAgentId) ?? input.actor.agentId,
      taskId: readString5(input.args.taskId) ?? input.task?.taskId ?? readRequiredString5(input.args.taskId, "taskId"),
      repo: readString5(input.args.repo) ?? input.task?.repo,
      ttlMs: readNumber2(input.args.ttlMs),
      now: readString5(input.args.now),
      existingLocks: state.listWorkLocks()
    });
    await state.replaceWorkLocks(result.locks);
    return {
      content: result.lock,
      metadata: {
        activeLockCount: result.locks.length
      }
    };
  });
  router.register(workLocksMcpServer, "work_locks.release", async (input) => {
    const locks = service.release(state.listWorkLocks(), {
      lockId: readRequiredString5(input.args.lockId, "lockId"),
      ownerAgentId: readString5(input.args.ownerAgentId) ?? input.actor.agentId,
      taskId: readString5(input.args.taskId) ?? input.task?.taskId
    });
    await state.replaceWorkLocks(locks);
    return {
      content: locks,
      metadata: {
        activeLockCount: locks.length
      }
    };
  });
}
function readRequiredString5(value, field) {
  const result = readString5(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString5(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}

// src/servers/deployment-server.ts
var deploymentMcpServer = {
  serverId: "recoder.deploy",
  kind: "deploy",
  displayName: "Recoder Deployment",
  transport: "http",
  enabled: true,
  toolNames: ["deploy.preview", "deploy.status", "deploy.rollback"]
};

// src/servers/billing-server.ts
var billingMcpServer = {
  serverId: "recoder.billing",
  kind: "billing",
  displayName: "Recoder Billing",
  transport: "http",
  enabled: true,
  toolNames: ["billing.plan.read", "billing.usage.read"]
};

// src/servers/git-nexus-server.ts
import {
  computeImpact,
  createRepoIndexer,
  ownersForPath,
  relatedTestsForPaths,
  scanRepo
} from "@recoder/recodergit";
var gitNexusMcpServer = {
  serverId: "recoder.git_nexus",
  kind: "git_nexus",
  displayName: "Recoder Git Nexus",
  transport: "http",
  enabled: true,
  toolNames: [
    "git_nexus.search_code",
    "git_nexus.get_package_map",
    "git_nexus.get_owners",
    "git_nexus.get_related_tests",
    "git_nexus.impact_report",
    "git_nexus.context_pack"
  ]
};
function registerGitNexusMcpTools(router, port, options = {}) {
  const indexer = options.indexer ?? createRepoIndexer();
  router.register(gitNexusMcpServer, "git_nexus.context_pack", async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const task = buildTaskSpec(input);
    const pack = await indexer.contextPack({ task, repoRoot });
    return {
      content: pack,
      metadata: contextPackMetadata(pack)
    };
  });
  router.register(gitNexusMcpServer, "git_nexus.impact_report", async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const changedPaths = readChangedPaths(input.args, input.task);
    const graph = await indexer.indexDependencyGraph(repoRoot);
    const impact = computeImpact({ graph, changedPaths });
    return {
      content: {
        repoRoot,
        changedPaths,
        ...impact,
        edgeCount: graph.edges.length,
        nodeCount: graph.nodes.length
      },
      metadata: {
        engine: "recodergit",
        seedCount: impact.seeds.length,
        impactedCount: impact.impactedFiles.length
      }
    };
  });
  router.register(gitNexusMcpServer, "git_nexus.search_code", async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const query = readRequiredString6(input.args.query, "query");
    const limit = readNumber3(input.args.limit) ?? 50;
    const matches = await searchCode(repoRoot, query, limit);
    return {
      content: { repoRoot, query, matches },
      metadata: { engine: "recodergit", matchCount: matches.length }
    };
  });
  router.register(gitNexusMcpServer, "git_nexus.get_package_map", async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const graph = await indexer.indexDependencyGraph(repoRoot);
    const packages = packageMapFromGraph(graph);
    return {
      content: { repoRoot, packages, indexedAt: graph.indexedAt },
      metadata: { engine: "recodergit", packageCount: packages.length }
    };
  });
  router.register(gitNexusMcpServer, "git_nexus.get_owners", async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const paths = readChangedPaths(input.args, input.task);
    const scan = await scanRepo(repoRoot);
    const { buildOwnershipMap } = await import("@recoder/recodergit");
    const ownershipMap = await buildOwnershipMap(repoRoot, scan.files);
    const owners = paths.map((path) => ({ path, owners: ownersForPath(ownershipMap, path) }));
    return {
      content: { repoRoot, owners, entries: ownershipMap.entries },
      metadata: { engine: "recodergit", pathCount: paths.length }
    };
  });
  router.register(gitNexusMcpServer, "git_nexus.get_related_tests", async (input) => {
    const repoRoot = await resolveRoot(port, input);
    const task = buildTaskSpec(input);
    const pack = await indexer.contextPack({ task, repoRoot });
    const relatedTests = relatedTestsForPaths(pack.testTargetMap, task.targetPaths);
    return {
      content: { repoRoot, targetPaths: task.targetPaths, relatedTests },
      metadata: { engine: "recodergit", testCount: relatedTests.length }
    };
  });
}
async function resolveRoot(port, input) {
  const repo = readString6(input.args.repo) ?? input.task?.repo;
  const spaceId = readString6(input.args.spaceId) ?? input.task?.spaceId;
  const root = await port.resolveRepoRoot({ repo, spaceId });
  if (!root || !root.trim()) {
    throw new Error("git_nexus: repository root could not be resolved (repo unconfigured).");
  }
  return root;
}
function contextPackMetadata(pack) {
  return {
    engine: "recodergit",
    nodeCount: pack.dependencyGraph.nodes.length,
    edgeCount: pack.dependencyGraph.edges.length,
    impactedPackages: pack.impactReport.impactedPackages.length
  };
}
function packageMapFromGraph(graph) {
  const counts = /* @__PURE__ */ new Map();
  for (const node of graph.nodes) {
    const pkg = node.split("/").slice(0, 2).join("/");
    if (!pkg) continue;
    counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
  }
  return [...counts.entries()].map(([pkg, fileCount]) => ({ package: pkg, fileCount })).sort((a, b) => a.package.localeCompare(b.package));
}
async function searchCode(repoRoot, query, limit) {
  const { promises: fs } = await import("fs");
  const nodePath = await import("path");
  const scan = await scanRepo(repoRoot);
  const needle = query.toLowerCase();
  const matches = [];
  for (const relative of scan.files) {
    if (matches.length >= limit) break;
    let source;
    try {
      source = await fs.readFile(nodePath.join(repoRoot, relative), "utf8");
    } catch {
      continue;
    }
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= limit) break;
      const line = lines[i] ?? "";
      if (line.toLowerCase().includes(needle)) {
        matches.push({ path: relative, line: i + 1, snippet: line.trim().slice(0, 240) });
      }
    }
  }
  return matches;
}
function buildTaskSpec(input) {
  if (input.task) {
    const overridePaths = readStringArray2(input.args.targetPaths ?? input.args.paths);
    if (overridePaths.length > 0) {
      return { ...input.task, targetPaths: overridePaths };
    }
    return input.task;
  }
  const targetPaths = readStringArray2(input.args.targetPaths ?? input.args.paths);
  return {
    taskId: readString6(input.args.taskId) ?? `gitnexus_${Date.now()}`,
    title: readString6(input.args.title) ?? "Git Nexus context pack",
    intent: "research",
    goal: readString6(input.args.goal) ?? "Assemble repository context.",
    spaceId: readString6(input.args.spaceId) ?? "default",
    targetPaths,
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: []
  };
}
function readChangedPaths(args, task) {
  const explicit = readStringArray2(args.changedPaths ?? args.targetPaths ?? args.paths);
  if (explicit.length > 0) {
    return explicit;
  }
  return task?.targetPaths ?? [];
}
function readStringArray2(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
function readRequiredString6(value, field) {
  const result = readString6(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString6(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readNumber3(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}

// src/servers/recodergit-server.ts
var recodergitMcpServer = {
  serverId: "recoder.code_graph",
  kind: "recoder_code_graph",
  displayName: "Recoder Code Graph (recodergit)",
  transport: "http",
  enabled: true,
  toolNames: [
    "code_graph.context",
    "code_graph.impact",
    "code_graph.detect_impact",
    "code_graph.query",
    "code_graph.pdg_query",
    "code_graph.cypher",
    "code_graph.scope",
    "code_graph.explain",
    "code_graph.trace",
    "code_graph.route_map",
    "code_graph.generate_map",
    "code_graph.list_repos"
  ],
  metadata: {
    readOnly: true,
    engine: "recodergit",
    // Live endpoint/health is reported by the code-graph control route; the
    // engine binds loopback Streamable HTTP at POST /mcp.
    transportDetail: "streamable-http:/mcp"
  }
};

// src/servers/beads-server.ts
var beadsMcpServer = {
  serverId: "recoder.beads",
  kind: "beads",
  displayName: "Recoder Beads",
  transport: "http",
  enabled: true,
  toolNames: [
    "beads.ready",
    "beads.show",
    "beads.create",
    "beads.update",
    "beads.close",
    "beads.sync",
    // memory layer: candidates (ephemeral wisps) only — promotion is the governed
    // review step on the memory-lifecycle path, never an agent bridge tool
    "beads.claim",
    "beads.note",
    "beads.remember",
    "beads.recall"
  ]
};

// src/servers/oss-server.ts
var ossMcpServer = {
  serverId: "recoder.oss",
  kind: "oss",
  displayName: "Recoder OSS Registry",
  transport: "http",
  enabled: true,
  toolNames: ["oss.list", "oss.get", "oss.health", "oss.patch_policy"]
};

// src/servers/preview-server.ts
var previewMcpServer = {
  serverId: "recoder.preview",
  kind: "preview",
  displayName: "Recoder Preview",
  transport: "http",
  enabled: true,
  toolNames: ["preview.issue_url", "preview.health", "preview.browser_check", "preview.attach_evidence"]
};

// src/servers/logs-server.ts
var logsMcpServer = {
  serverId: "recoder.logs",
  kind: "logs",
  displayName: "Recoder Logs",
  transport: "http",
  enabled: true,
  toolNames: ["logs.append", "logs.stream", "logs.search", "logs.attach"]
};

// src/servers/retrieval-server.ts
var retrievalMcpServer = {
  serverId: "recoder.retrieval",
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: "custom",
  displayName: "Recoder Retrieval",
  transport: "http",
  enabled: true,
  toolNames: ["retrieval.ingest", "retrieval.search"],
  metadata: { engine: "retrieval" }
};
function registerRetrievalMcpTools(router, port) {
  router.register(retrievalMcpServer, "retrieval.ingest", async (input) => {
    const text = readString7(input.args.text);
    const path = readString7(input.args.path);
    if (!text && !path) {
      throw new Error("retrieval.ingest requires `text` or `path`");
    }
    const result = await port.ingest({
      text,
      path,
      docId: readString7(input.args.docId),
      source: readString7(input.args.source),
      metadata: readRecord(input.args.metadata)
    });
    return { content: result, metadata: { engine: "retrieval" } };
  });
  router.register(retrievalMcpServer, "retrieval.search", async (input) => {
    const query = readRequiredString7(input.args.query, "query");
    const topK = readNumber4(input.args.topK);
    const result = await port.search(query, topK);
    return { content: result, metadata: { engine: "retrieval" } };
  });
}
function readRequiredString7(value, field) {
  const result = readString7(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString7(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readNumber4(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}

// src/servers/workspace-server.ts
var workspaceMcpServer = {
  serverId: "recoder.workspace",
  kind: "workspace",
  displayName: "Recoder Workspace",
  transport: "http",
  enabled: true,
  toolNames: ["workspace.create", "workspace.diff", "workspace.merge"]
};
function registerWorkspaceMcpTools(router, port) {
  router.register(workspaceMcpServer, "workspace.create", async (input) => {
    const created = await port.createWorkspace({
      prompt: readRequiredString8(input.args.prompt, "prompt"),
      spaceId: readString8(input.args.spaceId) ?? input.task?.spaceId,
      repo: readString8(input.args.repo) ?? input.task?.repo,
      baseRef: readString8(input.args.baseRef),
      branch: readString8(input.args.branch),
      agentId: readString8(input.args.agentId) ?? input.actor.agentId,
      createdBy: readString8(input.args.createdBy) ?? input.actor.agentId,
      metadata: isRecord4(input.args.metadata) ? input.args.metadata : void 0
    });
    return { content: created, metadata: { workspaceId: created.workspaceId, state: created.state } };
  });
  router.register(workspaceMcpServer, "workspace.diff", async (input) => {
    const workspaceId = readRequiredString8(input.args.workspaceId, "workspaceId");
    const diff = await port.diffWorkspace(workspaceId);
    return {
      content: diff,
      metadata: { workspaceId: diff.workspaceId, changedFiles: diff.changedFiles }
    };
  });
  router.register(workspaceMcpServer, "workspace.merge", async (input) => {
    const workspaceId = readRequiredString8(input.args.workspaceId, "workspaceId");
    const result = await port.mergeWorkspace(workspaceId, {
      strategy: readMergeStrategy(input.args.strategy),
      deleteBranch: readBoolean2(input.args.deleteBranch)
    });
    return { content: result, metadata: { workspaceId: result.workspaceId, merged: result.merged } };
  });
}
function readMergeStrategy(value) {
  const strategy = readString8(value);
  if (strategy === "squash" || strategy === "merge" || strategy === "rebase") {
    return strategy;
  }
  return void 0;
}
function readBoolean2(value) {
  return typeof value === "boolean" ? value : void 0;
}
function readRequiredString8(value, field) {
  const result = readString8(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString8(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/servers/coordination-server.ts
var coordinationMcpServer = {
  serverId: "recoder.coordination",
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: "custom",
  displayName: "Recoder Coordination",
  transport: "http",
  enabled: true,
  toolNames: [
    "coordination.acquire_lock",
    "coordination.release_lock",
    "coordination.list_locks",
    "coordination.detect_conflict"
  ],
  metadata: { engine: "coordination" }
};
function registerCoordinationMcpTools(router, port) {
  router.register(coordinationMcpServer, "coordination.acquire_lock", async (input) => {
    const resource = readRequiredString9(input.args.resource, "resource");
    const holder = readString9(input.args.holder) ?? input.actor.agentId;
    const result = await port.acquireLock(resource, holder, {
      ttlMs: readNumber5(input.args.ttlMs),
      metadata: readRecord2(input.args.metadata),
      lockId: readString9(input.args.lockId)
    });
    return { content: result, metadata: { engine: "coordination" } };
  });
  router.register(coordinationMcpServer, "coordination.release_lock", async (input) => {
    const target = readString9(input.args.lockId) ?? readString9(input.args.resource) ?? readRequiredString9(input.args.lockId, "lockId or resource");
    const holder = readString9(input.args.holder) ?? input.actor.agentId;
    const result = await port.releaseLock(target, holder);
    return { content: result, metadata: { engine: "coordination" } };
  });
  router.register(coordinationMcpServer, "coordination.list_locks", async (input) => {
    const result = await port.listLocks({
      resource: readString9(input.args.resource),
      holder: readString9(input.args.holder)
    });
    return { content: result, metadata: { engine: "coordination" } };
  });
  router.register(coordinationMcpServer, "coordination.detect_conflict", async (input) => {
    const resource = readRequiredString9(input.args.resource, "resource");
    const holder = readString9(input.args.holder) ?? input.actor.agentId;
    const result = await port.detectConflict(resource, holder);
    return { content: result, metadata: { engine: "coordination" } };
  });
}
function readRequiredString9(value, field) {
  const result = readString9(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString9(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readNumber5(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}

// src/servers/workflow-server.ts
var workflowMcpServer = {
  serverId: "recoder.workflow",
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: "custom",
  displayName: "Recoder Workflow",
  transport: "http",
  enabled: true,
  toolNames: ["workflow.verify", "workflow.capture_hook"],
  metadata: { engine: "workflow" }
};
function registerWorkflowMcpTools(router, port) {
  router.register(workflowMcpServer, "workflow.verify", async (input) => {
    const result = await port.verify({
      workflow: readString10(input.args.workflow),
      taskId: readString10(input.args.taskId) ?? input.task?.taskId,
      runId: readString10(input.args.runId),
      task: readTask(input.args.task) ?? readTaskFromSpec(input.task),
      checks: readChecks(input.args.checks)
    });
    return { content: result, metadata: { engine: "workflow" } };
  });
  router.register(workflowMcpServer, "workflow.capture_hook", async (input) => {
    const result = await port.captureHook({
      hook: readString10(input.args.hook),
      content: readString10(input.args.content),
      command: readString10(input.args.command),
      changedFiles: readStringArray3(input.args.changedFiles),
      output: readString10(input.args.output),
      exitCode: readNumber6(input.args.exitCode),
      taskId: readString10(input.args.taskId) ?? input.task?.taskId,
      runId: readString10(input.args.runId)
    });
    return { content: result, metadata: { engine: "workflow" } };
  });
}
function readString10(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readNumber6(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readStringArray3(value) {
  if (!Array.isArray(value)) return void 0;
  const items = value.filter((item) => typeof item === "string");
  return items.length > 0 ? items : void 0;
}
function readChecks(value) {
  if (!Array.isArray(value)) return void 0;
  const checks = value.map((entry) => {
    if (typeof entry !== "object" || entry === null) return void 0;
    const record = entry;
    const name = readString10(record.name);
    if (!name) return void 0;
    return {
      name,
      kind: readString10(record.kind),
      config: readRecord3(record.config)
    };
  }).filter((entry) => entry !== void 0);
  return checks.length > 0 ? checks : void 0;
}
function readTask(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
  return value;
}
function readTaskFromSpec(task) {
  if (!task) return void 0;
  return { taskId: task.taskId, intent: task.intent };
}
function readRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}

// src/servers/pal-plan-server.ts
var palPlanMcpServer = {
  serverId: "recoder.pal-plan",
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: "custom",
  displayName: "Recoder PAL Planner",
  transport: "http",
  enabled: true,
  toolNames: ["pal.plan"],
  metadata: { engine: "pal-plan" }
};
function registerPalPlanMcpTools(router, port) {
  router.register(palPlanMcpServer, "pal.plan", async (input) => {
    const taskSpec = pickTaskSpec(input.args);
    const result = await port.plan(taskSpec);
    return { content: result, metadata: { engine: "pal-plan" } };
  });
}
function pickTaskSpec(args) {
  if (isRecord5(args.taskSpec)) {
    return args.taskSpec;
  }
  if (isRecord5(args.task)) {
    return args.task;
  }
  return args;
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/servers/notify-server.ts
var notifyMcpServer = {
  serverId: "recoder.notify",
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: "custom",
  displayName: "Recoder Notify",
  transport: "http",
  enabled: true,
  toolNames: ["notify.send"],
  metadata: { engine: "notify" }
};
function registerNotifyMcpTools(router, port) {
  router.register(notifyMcpServer, "notify.send", async (input) => {
    const message = readRequiredString10(input.args.message, "message");
    const result = await port.notify({
      message,
      title: readString11(input.args.title),
      level: readLevel(input.args.level),
      url: readString11(input.args.url)
    });
    return { content: result, metadata: { engine: "notify" } };
  });
}
function readRequiredString10(value, field) {
  const result = readString11(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}
function readString11(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readLevel(value) {
  return value === "info" || value === "warn" || value === "error" ? value : void 0;
}

// src/policy/audit.ts
function createMcpToolCall(input, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    callId: `mcp_${now.replace(/[^0-9]/g, "")}_${Math.random().toString(16).slice(2)}`,
    serverId: input.server.serverId,
    toolName: input.toolName,
    actorAgentId: input.actor.agentId,
    taskId: input.task?.taskId,
    args: input.args,
    requestedAt: now,
    status: "requested"
  };
}
function createMcpToolAuditEvent(input) {
  return {
    eventId: `audit_${input.call.callId}`,
    call: {
      ...input.call,
      status: input.status,
      completedAt: input.status === "requested" ? input.call.completedAt : input.now ?? (/* @__PURE__ */ new Date()).toISOString()
    },
    decision: input.decision,
    policyDecision: input.decision.policyDecision,
    error: input.error
  };
}
export {
  McpRegistry,
  McpSessionManager,
  McpToolRouter,
  RecoderMcpHost,
  TASK_RUN_STATES,
  approvalsMcpServer,
  artifactsMcpServer,
  beadsMcpServer,
  billingMcpServer,
  browserEngineMcpServer,
  browserMcpServer,
  canCallMcpTool,
  checkMcpToolPermission,
  coordinationMcpServer,
  createMcpToolAuditEvent,
  createMcpToolCall,
  deploymentMcpServer,
  estimateMcpToolRisk,
  gitNexusMcpServer,
  githubMcpServer,
  logsMcpServer,
  memoryMcpServer,
  notifyMcpServer,
  ossMcpServer,
  palPlanMcpServer,
  previewMcpServer,
  recodergitMcpServer,
  registerBrowserEngineMcpTools,
  registerCoordinationMcpTools,
  registerGitNexusMcpTools,
  registerMemoryMcpTools,
  registerNotifyMcpTools,
  registerPalPlanMcpTools,
  registerRetrievalMcpTools,
  registerRunsMcpTools,
  registerTasksMcpTools,
  registerWorkLocksMcpTools,
  registerWorkflowMcpTools,
  registerWorkspaceMcpTools,
  repoMcpServer,
  retrievalMcpServer,
  runsMcpServer,
  tasksMcpServer,
  workLocksMcpServer,
  workflowMcpServer,
  workspaceMcpServer
};
//# sourceMappingURL=index.mjs.map