export type WorkspaceLike = {
  workspaceId?: string;
  branch?: string;
  baseRef?: string;
  runtimeId?: string;
  substrate?: string;
  state?: string;
  sessionName?: string;
  worktreePath?: string;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type RunEventLike = {
  type?: string;
  state?: string;
  message?: string;
  createdAt?: string;
};

export type ReadinessSignalLike = {
  id?: string;
  status?: string;
  detail?: string;
};

export type ReadinessLike = {
  verdict?: string;
  blockers?: string[];
  signals?: ReadonlyArray<ReadinessSignalLike>;
  pr?: {
    number?: number;
    state?: string;
    draft?: boolean;
    url?: string;
  } | null;
};

export type PrStatusLike = {
  available?: boolean;
  hasPr?: boolean;
  reason?: string;
  number?: number;
  state?: string;
  draft?: boolean;
  mergeable?: string;
  url?: string;
  checks?: {
    total?: number;
    passed?: number;
    failed?: number;
    pending?: number;
    rollup?: string;
  };
};

export type PreviewVerificationLike = {
  status?: string;
  degraded?: boolean;
  reason?: string;
  summary?: string;
  checkedAt?: string;
  checks?: ReadonlyArray<{ tool?: string; status?: string; message?: string }>;
};

export type ConvergenceEvidenceLike = {
  evidence?: {
    contentHash?: string;
    provenance?: {
      mergedAt?: string;
    };
    governance?: {
      action?: string;
      effect?: string;
      riskTier?: string;
      degraded?: boolean;
      approvalId?: string;
      reason?: string;
    };
  };
  seal?: {
    auditId?: string | null;
    auditSeq?: number | null;
    auditEntryHash?: string | null;
  };
};

export type LaunchOutcome = {
  outcome: "succeeded" | "failed" | "unknown";
  reason?: string;
};

export type ReviewMergeResult =
  | "merged"
  | "merging"
  | "ready_for_review"
  | "awaiting_approval"
  | "changes_requested"
  | "blocked"
  | "failed"
  | "cancelled"
  | "archived"
  | "working"
  | "unknown";

const RUNTIME_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  gemini_cli: "Gemini CLI",
  qwen_code: "Qwen Code",
  windsurf: "Windsurf",
  crush: "Crush",
  cursor_cli: "Cursor CLI",
};

function readErrorReason(value: unknown): string {
  if (value == null || typeof value !== "object") return "";
  const err = (value as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err != null && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}

function metadataMessage(metadata: Record<string, unknown> | undefined, key: string): string {
  if (metadata == null) return "";
  const direct = metadata[key];
  if (typeof direct === "string") return direct;
  return readErrorReason(direct);
}

function compactText(value: string, max = 280): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function runtimeLabel(runtimeId: string | undefined): string {
  const id = typeof runtimeId === "string" ? runtimeId.trim() : "";
  if (id === "") return "";
  if (RUNTIME_LABELS[id]) return RUNTIME_LABELS[id];
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function redactSecrets(input: string): string {
  if (input == null || input === "") return "";
  let text = input;
  const replacements: Array<[RegExp, string]> = [
    [/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_SECRET]"],
    [/\bgh[pousr]_[A-Za-z0-9]{12,}\b/g, "[REDACTED_SECRET]"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_SECRET]"],
    [/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "Bearer [REDACTED_SECRET]"],
    [/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY))=([^\s,;]+)/g, "$1=[REDACTED_SECRET]"],
    [/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)):\s*([^\s,;]+)/g, "$1: [REDACTED_SECRET]"],
    [/https?:\/\/([^/\s:@]+):([^/\s@]+)@/g, "https://[REDACTED_USER]:[REDACTED_SECRET]@"],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function deriveLaunchOutcome(workspace: WorkspaceLike): LaunchOutcome {
  const state = typeof workspace.state === "string" ? workspace.state : "";
  const metadata = workspace.metadata;
  const reason = compactText(
    redactSecrets(metadataMessage(metadata, "error") || metadataMessage(metadata, "launchError") || "")
  );
  const started =
    typeof workspace.worktreePath === "string" && workspace.worktreePath.trim() !== "" ||
    typeof workspace.sessionName === "string" && workspace.sessionName.trim() !== "" ||
    ["created", "setting_up", "ready", "running", "awaiting_approval", "awaiting_review", "changes_requested", "merging", "merged", "archived"].includes(state);
  if (started) {
    return { outcome: "succeeded", ...(reason !== "" ? { reason } : {}) };
  }
  if (state === "failed" || reason !== "") {
    return { outcome: "failed", ...(reason !== "" ? { reason } : {}) };
  }
  return { outcome: "unknown" };
}

export function deriveReviewMergeResult(
  workspace: WorkspaceLike,
  readiness: ReadinessLike | null | undefined,
  evidence: ConvergenceEvidenceLike | null | undefined
): ReviewMergeResult {
  const state = typeof workspace.state === "string" ? workspace.state : "";
  if (evidence?.evidence?.contentHash || state === "merged") return "merged";
  if (state === "merging") return "merging";
  if (state === "awaiting_approval") return "awaiting_approval";
  if (state === "awaiting_review") return "ready_for_review";
  if (state === "changes_requested") return "changes_requested";
  if (state === "failed") return "failed";
  if (state === "cancelled") return "cancelled";
  if (state === "archived") return "archived";
  if (readiness?.verdict === "ready") return "ready_for_review";
  if (readiness?.verdict === "blocked") return "blocked";
  if (["created", "setting_up", "ready", "running"].includes(state)) return "working";
  return "unknown";
}

export function summarizeRecentEvents(events: ReadonlyArray<RunEventLike>, limit = 20): Array<Record<string, string>> {
  return [...(events ?? [])]
    .slice(-Math.max(0, limit))
    .map((event) => ({
      createdAt: typeof event.createdAt === "string" ? event.createdAt : "",
      type: typeof event.type === "string" ? event.type : "",
      state: typeof event.state === "string" ? event.state : "",
      message: compactText(redactSecrets(typeof event.message === "string" ? event.message : ""), 220),
    }));
}

function signalFailures(signals: ReadonlyArray<ReadinessSignalLike> | undefined): string[] {
  const failures: string[] = [];
  for (const signal of signals ?? []) {
    if (signal?.status !== "fail") continue;
    if (typeof signal.detail === "string" && signal.detail.trim() !== "") {
      failures.push(signal.detail);
    } else if (typeof signal.id === "string" && signal.id.trim() !== "") {
      failures.push(`${signal.id} failed`);
    }
  }
  return failures;
}

function eventFailureLines(events: ReadonlyArray<RunEventLike> | undefined): string[] {
  const lines: string[] = [];
  for (const event of events ?? []) {
    const message = typeof event.message === "string" ? event.message.trim() : "";
    if (message === "") continue;
    if (
      event.type === "failed" ||
      event.type === "needs_input" ||
      event.type === "approval_requested" ||
      /error|failed|denied|blocked|unavailable|timeout/i.test(message)
    ) {
      lines.push(message);
    }
  }
  return lines;
}

export function collectUserVisibleFailureText(input: {
  workspace: WorkspaceLike;
  launch: LaunchOutcome;
  readiness?: ReadinessLike | null;
  prStatus?: PrStatusLike | null;
  previewVerification?: PreviewVerificationLike | null;
  events?: ReadonlyArray<RunEventLike>;
  endpointErrors?: Record<string, string>;
}): string[] {
  const out: string[] = [];
  const metadata = input.workspace.metadata;
  const push = (value: string | undefined) => {
    const text = compactText(redactSecrets(value ?? ""));
    if (text !== "" && !out.includes(text)) out.push(text);
  };
  push(metadataMessage(metadata, "error"));
  push(metadataMessage(metadata, "mergeError"));
  if (input.launch.outcome === "failed") {
    push(input.launch.reason);
  }
  for (const blocker of input.readiness?.blockers ?? []) push(blocker);
  for (const reason of signalFailures(input.readiness?.signals)) push(reason);
  if (input.prStatus?.available === false) push(input.prStatus.reason);
  if (input.previewVerification?.degraded || input.previewVerification?.status === "failed") {
    push(input.previewVerification.reason);
    push(input.previewVerification.summary);
  }
  for (const line of eventFailureLines(input.events)) push(line);
  for (const key of Object.keys(input.endpointErrors ?? {}).sort()) {
    push(`${key}: ${input.endpointErrors?.[key] ?? ""}`);
  }
  return out.slice(0, 12);
}

export function unwrapSuccessEnvelope(body: unknown): unknown {
  if (body != null && typeof body === "object" && (body as { success?: unknown }).success === true) {
    if ("data" in (body as Record<string, unknown>)) return (body as Record<string, unknown>).data;
  }
  return body;
}

export function extractWorkspace(body: unknown): WorkspaceLike | null {
  const data = unwrapSuccessEnvelope(body);
  if (data != null && typeof data === "object" && (data as { workspace?: unknown }).workspace != null) {
    return (data as { workspace: WorkspaceLike }).workspace;
  }
  return data != null && typeof data === "object" ? (data as WorkspaceLike) : null;
}

export function extractEvents(body: unknown): RunEventLike[] {
  const data = unwrapSuccessEnvelope(body);
  if (data != null && typeof data === "object" && Array.isArray((data as { events?: unknown }).events)) {
    return (data as { events: RunEventLike[] }).events;
  }
  return Array.isArray(data) ? (data as RunEventLike[]) : [];
}

export function extractVerification(body: unknown): PreviewVerificationLike | null {
  const data = unwrapSuccessEnvelope(body);
  if (data != null && typeof data === "object" && (data as { verification?: unknown }).verification != null) {
    return (data as { verification: PreviewVerificationLike }).verification;
  }
  return data != null && typeof data === "object" ? (data as PreviewVerificationLike) : null;
}

export function extractEvidence(body: unknown): ConvergenceEvidenceLike | null {
  const data = unwrapSuccessEnvelope(body);
  if (data != null && typeof data === "object" && (data as { evidence?: unknown }).evidence != null) {
    return (data as { evidence: ConvergenceEvidenceLike }).evidence;
  }
  return data != null && typeof data === "object" ? (data as ConvergenceEvidenceLike) : null;
}
