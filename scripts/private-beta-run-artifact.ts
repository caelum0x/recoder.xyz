import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  collectUserVisibleFailureText,
  deriveLaunchOutcome,
  deriveReviewMergeResult,
  extractEvidence,
  extractEvents,
  extractVerification,
  extractWorkspace,
  redactSecrets,
  runtimeLabel,
  summarizeRecentEvents,
  unwrapSuccessEnvelope,
  type ConvergenceEvidenceLike,
  type PrStatusLike,
  type PreviewVerificationLike,
  type ReadinessLike,
  type RunEventLike,
  type WorkspaceLike,
} from "./private-beta-run-artifact-lib";

type JsonRecord = Record<string, unknown>;

type EndpointRead<T> =
  | {
      ok: true;
      status: number;
      body: unknown;
      data: T;
    }
  | {
      ok: false;
      status: number;
      error: string;
      body?: unknown;
    };

const DEFAULT_BACKEND_URL = process.env.RECODER_BACKEND_URL || "http://127.0.0.1:3100";
const DEFAULT_OUT_DIR = "logs/private-beta-runs";
const ARTIFACT_SCHEMA = "recoder.private-beta-run-artifact/v2";

type ObservationOutcome = "succeeded" | "failed" | "not_exercised";

type Observation = {
  outcome: ObservationOutcome;
  reason: string | null;
  observedAt: string | null;
};

type RunContext = {
  installArtifactPath: string | null;
  installSource: string | null;
  signIn: Observation | null;
  refresh: Observation | null;
  terminalAttach: Observation | null;
  backendReconnect: Observation | null;
};

type ApprovalLike = {
  id?: string;
  taskId?: string | null;
  runId?: string | null;
  action?: string;
  riskTier?: string;
  status?: string;
  requestedBy?: string;
  target?: string | null;
  decidedBy?: string | null;
  reason?: string | null;
  expiresAt?: string | null;
  decidedAt?: string | null;
  createdAt?: string;
};

type WorkspaceEvidenceLike = WorkspaceLike & {
  spaceId?: string;
  taskId?: string;
  runId?: string;
  createdBy?: string;
};

function usage(): string {
  return [
    "Usage:",
    "  pnpm run beta:run-artifact -- <workspace-id> [--backend-url <url>] [--out-dir <dir>] [--context <json>]",
    "",
    "Examples:",
    "  pnpm run beta:run-artifact -- ws_123",
    "  pnpm run beta:run-artifact -- ws_123 --context scripts/private-beta-run-context.json",
    "",
    "Environment:",
    "  RECODER_BACKEND_URL   Default backend URL when --backend-url is omitted",
    "",
    "Context JSON fields:",
    "  installArtifactPath, installSource, signIn, refresh, terminalAttach, backendReconnect",
    "  Relative installArtifactPath values resolve from the context file directory.",
    "  Each observation is { outcome: succeeded|failed|not_exercised, reason?, observedAt? }.",
  ].join("\n");
}

function parseArgs(argv: string[]): {
  workspaceId: string;
  backendUrl: string;
  outDir: string;
  contextPath: string | null;
} {
  let workspaceId = "";
  let backendUrl = DEFAULT_BACKEND_URL;
  let outDir = DEFAULT_OUT_DIR;
  let contextPath: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--backend-url") {
      backendUrl = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--out-dir") {
      outDir = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--context") {
      contextPath = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (workspaceId === "") {
      workspaceId = arg;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (workspaceId === "") {
    throw new Error("workspace id is required");
  }
  if (backendUrl.trim() === "") {
    throw new Error("backend URL must not be empty");
  }
  if (outDir.trim() === "") {
    throw new Error("output directory must not be empty");
  }
  if (contextPath != null && contextPath.trim() === "") {
    throw new Error("context path must not be empty");
  }
  return {
    workspaceId,
    backendUrl: backendUrl.trim().replace(/\/+$/, ""),
    outDir: outDir.trim(),
    contextPath: contextPath?.trim() || null,
  };
}

function repoRootFromHere(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function readJsonFile(file: string): JsonRecord {
  return JSON.parse(fs.readFileSync(file, "utf8")) as JsonRecord;
}

function nullableText(value: unknown, max = 600): string | null {
  const text = compactText(value, max);
  return text !== "" ? text : null;
}

function safeFileSegment(value: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return safe !== "" ? safe.slice(0, 120) : "unknown-workspace";
}

function parseObservation(value: unknown, field: string): Observation | null {
  if (value == null) return null;
  const obj = jsonObject(value);
  if (obj == null) throw new Error(`${field} must be an object`);
  const outcome = obj.outcome;
  if (outcome !== "succeeded" && outcome !== "failed" && outcome !== "not_exercised") {
    throw new Error(`${field}.outcome must be succeeded, failed, or not_exercised`);
  }
  return {
    outcome,
    reason: nullableText(obj.reason),
    observedAt: nullableText(obj.observedAt, 80),
  };
}

function loadRunContext(root: string, contextPath: string | null): { context: RunContext; directory: string | null } {
  if (contextPath == null) {
    return {
      context: {
        installArtifactPath: null,
        installSource: null,
        signIn: null,
        refresh: null,
        terminalAttach: null,
        backendReconnect: null,
      },
      directory: null,
    };
  }
  const file = path.resolve(root, contextPath);
  const raw = readJsonFile(file);
  return {
    context: {
      installArtifactPath: nullableText(raw.installArtifactPath, 2_000),
      installSource: nullableText(raw.installSource),
      signIn: parseObservation(raw.signIn, "signIn"),
      refresh: parseObservation(raw.refresh, "refresh"),
      terminalAttach: parseObservation(raw.terminalAttach, "terminalAttach"),
      backendReconnect: parseObservation(raw.backendReconnect, "backendReconnect"),
    },
    directory: path.dirname(file),
  };
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function installArtifactEvidence(context: RunContext, contextDirectory: string | null) {
  if (context.installArtifactPath == null) return null;
  const file = path.resolve(contextDirectory ?? process.cwd(), context.installArtifactPath);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error(`install artifact is not a file: ${file}`);
  return {
    fileName: compactText(path.basename(file), 300),
    bytes: stat.size,
    sha256: await sha256File(file),
  };
}

function gitText(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function compactText(value: unknown, max = 220): string {
  if (typeof value !== "string") return "";
  const text = redactSecrets(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function endpointError(body: unknown, status: number): string {
  if (body != null && typeof body === "object") {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim() !== "") return compactText(err, 280);
    if (err != null && typeof err === "object") {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim() !== "") return compactText(msg, 280);
    }
  }
  return `HTTP ${status}`;
}

async function readEndpoint<T>(baseUrl: string, route: string, parse: (body: unknown) => T): Promise<EndpointRead<T>> {
  const url = `${baseUrl}${route}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: compactText(error instanceof Error ? error.message : String(error), 280) || "network failure",
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: endpointError(body, response.status),
      body,
    };
  }
  return { ok: true, status: response.status, body, data: parse(body) };
}

function jsonObject(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asReadiness(value: unknown): ReadinessLike | null {
  const obj = jsonObject(unwrapSuccessEnvelope(value));
  return obj as ReadinessLike | null;
}

function asPrStatus(value: unknown): PrStatusLike | null {
  const obj = jsonObject(unwrapSuccessEnvelope(value));
  return obj as PrStatusLike | null;
}

function extractChecks(value: unknown): JsonRecord | null {
  return jsonObject(unwrapSuccessEnvelope(value));
}

function extractHealth(value: unknown): JsonRecord | null {
  return jsonObject(unwrapSuccessEnvelope(value));
}

function extractApprovals(value: unknown): ApprovalLike[] {
  const data = jsonObject(unwrapSuccessEnvelope(value));
  if (data == null || !Array.isArray(data.approvals)) return [];
  return data.approvals.filter((item): item is ApprovalLike => item != null && typeof item === "object");
}

function metadataValue(metadata: Record<string, unknown> | undefined, key: string): unknown {
  return metadata != null ? metadata[key] : undefined;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return compactText(value, 600);
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item));
  if (value != null && typeof value === "object") {
    const out: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) out[key] = sanitizeUnknown(entry);
    return out;
  }
  return value;
}

function taskIdentity(workspace: WorkspaceLike): {
  taskGroup: string | null;
  convergedFromTaskGroup: string | null;
} {
  const metadata = workspace.metadata;
  const taskGroup =
    typeof metadataValue(metadata, "taskGroup") === "string" ? String(metadataValue(metadata, "taskGroup")).trim() : "";
  const fromTaskGroup =
    typeof metadataValue(metadata, "convergedFromTaskGroup") === "string"
      ? String(metadataValue(metadata, "convergedFromTaskGroup")).trim()
      : "";
  return {
    taskGroup: taskGroup !== "" ? taskGroup : null,
    convergedFromTaskGroup: fromTaskGroup !== "" ? fromTaskGroup : null,
  };
}

function repositoryIdentity(workspace: WorkspaceLike): string | null {
  const metadata = workspace.metadata;
  const lockScope = jsonObject(metadataValue(metadata, "lockScope"));
  for (const value of [lockScope?.repo, metadataValue(metadata, "repoPath"), metadataValue(metadata, "repository")]) {
    if (typeof value === "string" && value.trim() !== "") return compactText(value, 2_000);
  }
  return typeof workspace.projectId === "string" && workspace.projectId.trim() !== ""
    ? compactText(workspace.projectId, 2_000)
    : null;
}

function approvalEvidence(approvals: ApprovalLike[]): unknown[] {
  return approvals.map((approval) =>
    sanitizeUnknown({
      approvalId: approval.id ?? null,
      taskId: approval.taskId ?? null,
      runId: approval.runId ?? null,
      action: approval.action ?? null,
      target: approval.target ?? null,
      riskTier: approval.riskTier ?? null,
      status: approval.status ?? null,
      requestedBy: approval.requestedBy ?? null,
      decidedBy: approval.decidedBy ?? null,
      reason: approval.reason ?? null,
      createdAt: approval.createdAt ?? null,
      decidedAt: approval.decidedAt ?? null,
      expiresAt: approval.expiresAt ?? null,
    })
  );
}

function contractMissing(input: {
  installArtifact: unknown;
  context: RunContext;
  workspace: WorkspaceEvidenceLike;
  repository: string | null;
  approvalsRead: EndpointRead<ApprovalLike[]> | null;
  approvals: ApprovalLike[];
}): string[] {
  const missing: string[] = [];
  if (input.installArtifact == null) missing.push("installation.artifact");
  if (input.context.signIn == null) missing.push("auth.signIn");
  if (input.context.refresh == null) missing.push("auth.refresh");
  if (input.context.terminalAttach == null) missing.push("terminal.attach");
  if (input.context.backendReconnect == null) missing.push("terminal.backendReconnect");
  if (!input.workspace.runId) missing.push("workspace.runId");
  if (input.repository == null) missing.push("workspace.repository");
  if (input.approvalsRead == null || !input.approvalsRead.ok) missing.push("governance.approvals");
  else if (input.approvals.length === 0) missing.push("governance.approvals[]");
  if (input.approvals.some((approval) => approval.target == null || approval.target.trim() === "")) {
    missing.push("governance.approvals[].target");
  }
  if (
    input.approvals.length > 0 &&
    !input.approvals.some((approval) => approval.status === "approved" || approval.status === "denied")
  ) {
    missing.push("governance.approvals[].decision");
  }
  return missing;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRootFromHere();
  const loadedContext = loadRunContext(root, args.contextPath);
  const installArtifact = await installArtifactEvidence(loadedContext.context, loadedContext.directory);
  const appPackage = readJsonFile(path.join(root, "apps/desktop/app/package.json"));
  const version = typeof appPackage.version === "string" ? appPackage.version : "";
  const commit = gitText(root, ["rev-parse", "HEAD"]);
  const branch = gitText(root, ["branch", "--show-current"]);
  const dirty = gitText(root, ["status", "--porcelain", "--untracked-files=no"]) !== "";

  const healthRead = await readEndpoint(args.backendUrl, "/api/conductor/health", extractHealth);
  const workspaceRead = await readEndpoint(
    args.backendUrl,
    `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}`,
    extractWorkspace
  );
  if (workspaceRead.ok === false) {
    throw new Error(`workspace lookup failed: ${workspaceRead.error}`);
  }
  if (workspaceRead.data == null) throw new Error("workspace lookup returned no workspace");
  const workspace = workspaceRead.data as WorkspaceEvidenceLike;

  const approvalsPromise: Promise<EndpointRead<ApprovalLike[]> | null> = workspace.taskId
    ? readEndpoint(
        args.backendUrl,
        `/api/agent-os/approvals?taskId=${encodeURIComponent(workspace.taskId)}&limit=100`,
        extractApprovals
      )
    : Promise.resolve(null);
  const [
    eventsRead,
    readinessRead,
    mergeabilityRead,
    prStatusRead,
    checksRead,
    previewRead,
    evidenceRead,
    approvalsRead,
  ] = await Promise.all([
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/events`,
      extractEvents
    ),
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/readiness`,
      asReadiness
    ),
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/mergeability`,
      unwrapSuccessEnvelope
    ),
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/pr-status`,
      asPrStatus
    ),
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/checks`,
      extractChecks
    ),
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/preview-verification`,
      extractVerification
    ),
    readEndpoint(
      args.backendUrl,
      `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/evidence`,
      extractEvidence
    ),
    approvalsPromise,
  ]);

  const endpointErrors: Record<string, string> = {};
  for (const [key, result] of [
    ["health", healthRead],
    ["events", eventsRead],
    ["readiness", readinessRead],
    ["mergeability", mergeabilityRead],
    ["prStatus", prStatusRead],
    ["checks", checksRead],
    ["previewVerification", previewRead],
    ["evidence", evidenceRead],
  ] as const) {
    if (result.ok === false) endpointErrors[key] = result.error;
  }
  if (approvalsRead == null) endpointErrors.approvals = "workspace has no taskId";
  else if (approvalsRead.ok === false) endpointErrors.approvals = approvalsRead.error;

  const events = eventsRead.ok ? eventsRead.data : [];
  const readiness = readinessRead.ok ? readinessRead.data : null;
  const prStatus = prStatusRead.ok ? prStatusRead.data : null;
  const previewVerification = previewRead.ok ? previewRead.data : null;
  const evidence = evidenceRead.ok ? evidenceRead.data : null;
  const approvals = approvalsRead?.ok ? approvalsRead.data : [];
  const launch = deriveLaunchOutcome(workspace);
  const reviewMergeResult = deriveReviewMergeResult(workspace, readiness, evidence);
  const failureText = collectUserVisibleFailureText({
    workspace,
    launch,
    readiness,
    prStatus,
    previewVerification,
    events,
    endpointErrors,
  });

  const task = taskIdentity(workspace);
  const repository = repositoryIdentity(workspace);
  const missing = contractMissing({
    installArtifact,
    context: loadedContext.context,
    workspace,
    repository,
    approvalsRead,
    approvals,
  });
  const observedFailures = [
    ["sign-in", loadedContext.context.signIn],
    ["session refresh", loadedContext.context.refresh],
    ["terminal attach", loadedContext.context.terminalAttach],
    ["backend reconnect", loadedContext.context.backendReconnect],
  ] as const;
  for (const [label, observation] of observedFailures) {
    if (observation?.outcome === "failed") {
      failureText.push(`${label}: ${observation.reason ?? "failed"}`);
    }
  }
  const artifact = {
    schema: ARTIFACT_SCHEMA,
    generatedAt: new Date().toISOString(),
    collector: {
      workspaceId: args.workspaceId,
      backendUrl: compactText(args.backendUrl, 2_000),
      tool: "scripts/private-beta-run-artifact.ts",
    },
    app: {
      desktopVersion: version,
      gitCommit: commit,
      gitBranch: branch,
      gitDirty: dirty,
    },
    installation: {
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      source: loadedContext.context.installSource,
      artifact: installArtifact,
    },
    auth: {
      signIn: loadedContext.context.signIn,
      refresh: loadedContext.context.refresh,
    },
    backend: {
      healthStatus: healthRead.ok ? (healthRead.data?.status ?? "unknown") : "unavailable",
      health: healthRead.ok ? sanitizeUnknown(healthRead.data) : null,
    },
    workspace: sanitizeUnknown({
      workspaceId: workspace.workspaceId ?? args.workspaceId,
      spaceId: workspace.spaceId ?? null,
      taskId: workspace.taskId ?? null,
      runId: workspace.runId ?? null,
      state: workspace.state ?? "",
      branch: workspace.branch ?? "",
      baseRef: workspace.baseRef ?? "",
      runtimeId: workspace.runtimeId ?? "",
      runtimeLabel: runtimeLabel(workspace.runtimeId),
      substrate: workspace.substrate ?? "",
      sessionName: workspace.sessionName ?? "",
      worktreePath: workspace.worktreePath ?? "",
      projectId: workspace.projectId ?? "",
      repository,
      createdBy: workspace.createdBy ?? null,
      createdAt: workspace.createdAt ?? "",
      updatedAt: workspace.updatedAt ?? "",
      taskGroup: task.taskGroup,
      convergedFromTaskGroup: task.convergedFromTaskGroup,
    }),
    launch: {
      outcome: launch.outcome,
      reason: launch.reason ?? "",
      currentState: workspace.state ?? "",
      recentEvents: summarizeRecentEvents(events as RunEventLike[]),
    },
    terminal: {
      attach: loadedContext.context.terminalAttach,
      backendReconnect: loadedContext.context.backendReconnect,
    },
    governance: {
      approvals: approvalEvidence(approvals),
    },
    reviewMerge: sanitizeUnknown({
      result: reviewMergeResult,
      readiness,
      mergeability: mergeabilityRead.ok ? mergeabilityRead.data : null,
      prStatus,
      checks: checksRead.ok ? checksRead.data : null,
      previewVerification,
      evidenceSummary:
        evidence == null
          ? null
          : {
              contentHash: evidence.evidence?.contentHash ?? null,
              mergedAt: evidence.evidence?.provenance?.mergedAt ?? null,
              governance: evidence.evidence?.governance ?? null,
              seal: evidence.seal ?? null,
            },
    }),
    userVisibleFailureText: [...new Set(failureText.map((line) => compactText(line, 600)))].filter(Boolean),
    endpointErrors: sanitizeUnknown(endpointErrors),
    contract: {
      complete: missing.length === 0,
      missing,
    },
  };

  const stamp = artifact.generatedAt.replace(/[:.]/g, "-");
  const outDir = path.join(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `private-beta-run-${safeFileSegment(args.workspaceId)}-${stamp}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(outFile);
}

main().catch((error) => {
  const message = compactText(error instanceof Error ? error.message : String(error), 600) || "unknown failure";
  console.error(`private-beta run artifact capture failed: ${message}`);
  process.exit(1);
});
