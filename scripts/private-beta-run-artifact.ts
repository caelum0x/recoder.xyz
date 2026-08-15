import fs from "node:fs";
import path from "node:path";
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

type EndpointRead<T> = {
  ok: true;
  status: number;
  body: unknown;
  data: T;
} | {
  ok: false;
  status: number;
  error: string;
  body?: unknown;
};

const DEFAULT_BACKEND_URL = process.env.RECODER_BACKEND_URL || "http://127.0.0.1:3100";
const DEFAULT_OUT_DIR = "logs/private-beta-runs";
const ARTIFACT_SCHEMA = "recoder.private-beta-run-artifact/v1";

function usage(): string {
  return [
    "Usage:",
    "  pnpm run beta:run-artifact -- <workspace-id> [--backend-url <url>] [--out-dir <dir>]",
    "",
    "Examples:",
    "  pnpm run beta:run-artifact -- ws_123",
    "  pnpm run beta:run-artifact -- ws_123 --backend-url http://127.0.0.1:3100",
    "",
    "Environment:",
    "  RECODER_BACKEND_URL   Default backend URL when --backend-url is omitted",
  ].join("\n");
}

function parseArgs(argv: string[]): { workspaceId: string; backendUrl: string; outDir: string } {
  let workspaceId = "";
  let backendUrl = DEFAULT_BACKEND_URL;
  let outDir = DEFAULT_OUT_DIR;
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
  return { workspaceId, backendUrl: backendUrl.trim().replace(/\/+$/, ""), outDir: outDir.trim() };
}

function repoRootFromHere(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function readJsonFile(file: string): JsonRecord {
  return JSON.parse(fs.readFileSync(file, "utf8")) as JsonRecord;
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

async function readEndpoint<T>(
  baseUrl: string,
  route: string,
  parse: (body: unknown) => T
): Promise<EndpointRead<T>> {
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
    return { ok: false, status: response.status, error: endpointError(body, response.status), body };
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

function taskIdentity(workspace: WorkspaceLike): { taskGroup: string | null; convergedFromTaskGroup: string | null } {
  const metadata = workspace.metadata;
  const taskGroup = typeof metadataValue(metadata, "taskGroup") === "string" ? String(metadataValue(metadata, "taskGroup")).trim() : "";
  const fromTaskGroup =
    typeof metadataValue(metadata, "convergedFromTaskGroup") === "string"
      ? String(metadataValue(metadata, "convergedFromTaskGroup")).trim()
      : "";
  return {
    taskGroup: taskGroup !== "" ? taskGroup : null,
    convergedFromTaskGroup: fromTaskGroup !== "" ? fromTaskGroup : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRootFromHere();
  const appPackage = readJsonFile(path.join(root, "apps/desktop/app/package.json"));
  const version = typeof appPackage.version === "string" ? appPackage.version : "";
  const commit = gitText(root, ["rev-parse", "HEAD"]);
  const branch = gitText(root, ["branch", "--show-current"]);
  const dirty = gitText(root, ["status", "--porcelain", "--untracked-files=no"]) !== "";

  const healthRead = await readEndpoint(args.backendUrl, "/api/conductor/health", extractHealth);
  const workspaceRead = await readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}`, extractWorkspace);
  if (!workspaceRead.ok || workspaceRead.data == null) {
    throw new Error(`workspace lookup failed: ${workspaceRead.error}`);
  }
  const workspace = workspaceRead.data;

  const [eventsRead, readinessRead, mergeabilityRead, prStatusRead, checksRead, previewRead, evidenceRead] = await Promise.all([
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/events`, extractEvents),
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/readiness`, asReadiness),
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/mergeability`, unwrapSuccessEnvelope),
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/pr-status`, asPrStatus),
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/checks`, extractChecks),
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/preview-verification`, extractVerification),
    readEndpoint(args.backendUrl, `/api/conductor/workspaces/${encodeURIComponent(args.workspaceId)}/evidence`, extractEvidence),
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
    if (!result.ok) endpointErrors[key] = result.error;
  }

  const events = eventsRead.ok ? eventsRead.data : [];
  const readiness = readinessRead.ok ? readinessRead.data : null;
  const prStatus = prStatusRead.ok ? prStatusRead.data : null;
  const previewVerification = previewRead.ok ? previewRead.data : null;
  const evidence = evidenceRead.ok ? evidenceRead.data : null;
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
  const artifact = {
    schema: ARTIFACT_SCHEMA,
    generatedAt: new Date().toISOString(),
    collector: {
      workspaceId: args.workspaceId,
      backendUrl: args.backendUrl,
      tool: "scripts/private-beta-run-artifact.ts",
    },
    app: {
      desktopVersion: version,
      gitCommit: commit,
      gitBranch: branch,
      gitDirty: dirty,
    },
    backend: {
      healthStatus: healthRead.ok ? (healthRead.data?.status ?? "unknown") : "unavailable",
      health: healthRead.ok ? sanitizeUnknown(healthRead.data) : null,
    },
    workspace: sanitizeUnknown({
      workspaceId: workspace.workspaceId ?? args.workspaceId,
      state: workspace.state ?? "",
      branch: workspace.branch ?? "",
      baseRef: workspace.baseRef ?? "",
      runtimeId: workspace.runtimeId ?? "",
      runtimeLabel: runtimeLabel(workspace.runtimeId),
      substrate: workspace.substrate ?? "",
      sessionName: workspace.sessionName ?? "",
      worktreePath: workspace.worktreePath ?? "",
      projectId: workspace.projectId ?? "",
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
    reviewMerge: sanitizeUnknown({
      result: reviewMergeResult,
      readiness,
      mergeability: mergeabilityRead.ok ? mergeabilityRead.data : null,
      prStatus,
      checks: checksRead.ok ? checksRead.data : null,
      previewVerification,
      evidenceSummary: evidence == null
        ? null
        : {
            contentHash: evidence.evidence?.contentHash ?? null,
            mergedAt: evidence.evidence?.provenance?.mergedAt ?? null,
            governance: evidence.evidence?.governance ?? null,
            seal: evidence.seal ?? null,
          },
    }),
    userVisibleFailureText: failureText,
    endpointErrors: sanitizeUnknown(endpointErrors),
  };

  const stamp = artifact.generatedAt.replace(/[:.]/g, "-");
  const outDir = path.join(root, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `private-beta-run-${args.workspaceId}-${stamp}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(outFile);
}

main().catch((error) => {
  const message = compactText(error instanceof Error ? error.message : String(error), 600) || "unknown failure";
  console.error(`private-beta run artifact capture failed: ${message}`);
  process.exit(1);
});
