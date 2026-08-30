// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import type { RecoderApproval } from "../recoder-approvals/recoder-approvals-model";
import { decideApproval } from "../recoder/recoder-approval-action";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorOutcome, readErrorReason, readFetchError } from "../recoder/recoder-errors";
import { fetchWorkspacePrStatusView, PrStatusRefreshMs, type RecoderPrStatus } from "../recoder/recoder-pr-status";
import { RecoderDiffView } from "./recoder-diff";
import { selectWorkspaceApproval, shouldShowInlineApproval } from "./recoder-diff-approval";
import type { ReviewCommentDraft } from "./recoder-diff-comments";
import { fetchPreviewVerification, previewVerificationStateAtom } from "./recoder-evidence-logic";

// `taskId`/`runId` ride on the canonical conductor Workspace record the list edge
// returns (packages/agent-os Workspace); they correlate this run to its pending
// governance approval so a blocked run can show an inline approve/reject.
type RecoderWorkspace = {
    workspaceId: string;
    branch: string;
    state: string;
    runtimeId: string;
    projectId?: string;
    taskId?: string;
    runId?: string;
    // Ride on the same conductor Workspace record the list edge returns; they let
    // the shared detail header open the workspace's raw tmux terminal without a
    // second fetch. Absent on older backends → the Terminal segment stays disabled
    // (truthful degrade), never a fabricated attach target.
    sessionName?: string;
    worktreePath?: string;
    // Selects the terminal authority consistently with Session: Loom workspaces
    // open the bounded Loom stream; legacy tmux workspaces use tmux attach.
    substrate?: string;
};

const WorkspaceIdMetaKey = "recoder:workspaceid";

// The clicked workspace is threaded in via the block's meta so Review opens the
// same workspace the hub launched from, not workspaces[0]. Absent → "" → the
// refresh() auto-select path takes over, so the seed is always harmless.
function readWorkspaceId(block: Block): string {
    const meta = (block?.meta ?? {}) as Record<string, unknown>;
    const raw = meta[WorkspaceIdMetaKey];
    return typeof raw === "string" ? raw.trim() : "";
}

// Shape of GET /api/conductor/workspaces/:id/diff → data (see conductor review.ts
// WorkspaceDiff). `patch` is a raw unified git diff; the view renders it line-by-line.
type RecoderWorkspaceDiff = {
    workspaceId: string;
    baseRef: string;
    branch: string;
    stat: string;
    patch: string;
    untracked: string[];
    changedFiles: number;
};

type RecoderCheckRow = {
    name: string;
    status: string;
    conclusion: string;
    source?: "github" | "recoder";
    detail?: string;
    autofix?: {
        prompt: string;
    };
    remediation?: {
        attemptId: string;
        state: "running" | "passed" | "failed" | "error";
        requestedAt: string;
        attestedAt?: string;
        beforeStatus: "fail" | "error";
        afterStatus?: "pass" | "fail" | "error";
        afterDetail?: string;
        agentOutcome?: "completed" | "failed";
    };
};

// Shape of GET /api/conductor/workspaces/:id/checks → data (see conductor
// pr-checks.service.ts WorkspaceChecksView). available:false is a NORMAL state
// (local-only repo, no PR yet, no gh) with a truthful reason, never an error.
type RecoderWorkspaceChecks = {
    available: boolean;
    reason?: string;
    mergeable?: string;
    reviewDecision?: string;
    checks?: RecoderCheckRow[];
    githubAvailable?: boolean;
    githubReason?: string;
    localRan?: boolean;
};

type RecoderPrReviewEvidence = {
    available: boolean;
    reason?: string;
    pr: number;
    diffTruncated: boolean;
    impact?: {
        available: boolean;
        reason?: string;
        source: "recodergit";
        scope: "symbol" | "file" | "mixed" | "unavailable";
        risk: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        partial: boolean;
        files: RecoderImpactFile[];
        tests: RecoderImpactFile[];
        processes: { label: string }[];
        consumers: RecoderImpactConsumer[];
        summary: {
            impactedFiles: number;
            affectedTests: number;
            upstreamFiles: number;
            downstreamFiles: number;
            affectedProcesses: number;
            coChangedFiles: number;
            crossRepositoryFiles: number;
            consumerRepositories: number;
        };
    };
};

type RecoderImpactConsumer = {
    repoId: string;
    path: string;
    ecosystem: "npm" | "python" | "go" | "cargo";
    packageName: string;
    importSpecifier: string;
};

type RecoderImpactFile = {
    path: string;
    isTest: boolean;
    minDepth: number;
    directions: ("upstream" | "downstream")[];
    changedSymbols: string[];
    symbols: string[];
    relationTypes: string[];
    processes: string[];
    coChange?: { commits: number; confidence: number };
};

type RecoderReviewFinding = {
    file: string;
    line: number;
    severity: "critical" | "high" | "medium" | "low" | "info";
    message: string;
    evidence: string;
    confidence?: number;
};

type RecoderReviewFindings = {
    kept: RecoderReviewFinding[];
    dropped: number;
    summary: string;
};

// Canonical GET …/readiness projection. `available:false` means the endpoint or
// payload could not be trusted; callers may fall back to the older PR-only view
// but must never fabricate a blocker from an unavailable readiness result.
type RecoderReadinessView = {
    available: boolean;
    verdict?: string;
    blockers: string[];
    // Older backends omit this field, so consumers treat absence as no
    // advisory evidence rather than making the readiness view unusable.
    advisories?: string[];
    reason?: string;
    review?: RecoderPrReviewEvidence | null;
};

// gh conclusions that mean the check actually failed. Single source of truth for
// both the strip's red dot and the suggested-action logic.
const FailedConclusions = new Set(["failure", "error", "timed_out", "startup_failure", "action_required", "cancelled"]);

function isFailedConclusion(conclusion: string): boolean {
    return FailedConclusions.has(conclusion.toLowerCase());
}

// The next step a reviewer should take, derived from the loaded PR/checks view.
// Maps onto the Review surface's own controls (Create PR / Merge) or narrates a
// blocking condition the reviewer must clear elsewhere (fix checks, address
// feedback, resolve conflicts, wait). Distinct from the board's suggestNextAction:
// this one HAS gh/PR data, so it can reason about mergeability and review state.
type RecoderReviewActionId = "create-pr" | "merge" | "address-feedback" | "resolve-conflicts" | "wait";
type RecoderReviewSuggestion = {
    action: RecoderReviewActionId;
    label: string;
};

// Pure. null ⇒ nothing actionable to suggest (checks not loaded, or gh/PR simply
// unavailable for a benign reason like a local-only repo). Precedence is
// deliberately blocking-first: conflicts and requested changes and failing checks
// outrank "ready to merge" so a green subset never masks a real blocker.
function suggestReviewAction(checks: RecoderWorkspaceChecks): RecoderReviewSuggestion | null {
    if (checks == null) {
        return null;
    }
    if (!checks.available) {
        const reason = (checks.reason ?? "").toLowerCase();
        if (reason.includes("no pull request") || reason.includes("no pr")) {
            return { action: "create-pr", label: "No PR yet — create one to run checks and enable merge" };
        }
        return null;
    }
    const rows = checks.checks ?? [];
    const mergeable = (checks.mergeable ?? "").toUpperCase();
    const review = (checks.reviewDecision ?? "").toUpperCase();
    if (mergeable == "CONFLICTING") {
        return { action: "resolve-conflicts", label: "Merge conflicts — rebase or resolve before merging" };
    }
    if (review == "CHANGES_REQUESTED") {
        return { action: "address-feedback", label: "Changes requested — address the review feedback" };
    }
    if (rows.some((row) => isFailedConclusion(row.conclusion))) {
        return { action: "address-feedback", label: "Checks failing — fix them before merging" };
    }
    if (mergeable == "UNKNOWN" || rows.some((row) => row.status.toLowerCase() != "completed")) {
        return { action: "wait", label: "Checks running — waiting for results" };
    }
    if (review == "REVIEW_REQUIRED") {
        return { action: "wait", label: "Checks pass — waiting on required review" };
    }
    if (mergeable == "MERGEABLE") {
        return { action: "merge", label: "Ready — checks pass, merge when you're set" };
    }
    return null;
}

// Only hard blockers the server can independently re-probe earn the feedback
// action. Requested review changes still use the line-anchored comment queue;
// pending/unknown checks never become invented blocker prose.
function canSendBlockerFeedback(checks: RecoderWorkspaceChecks, readiness?: RecoderReadinessView | null): boolean {
    if (readiness?.available) {
        return readiness.blockers.length > 0;
    }
    if (checks == null || !checks.available) {
        return false;
    }
    if ((checks.mergeable ?? "").toUpperCase() == "CONFLICTING") {
        return true;
    }
    return (checks.checks ?? []).some((row) => isFailedConclusion(row.conclusion));
}

function parseReadinessData(data: unknown): RecoderReadinessView {
    if (data == null || typeof data != "object" || Array.isArray(data)) {
        return { available: false, blockers: [], reason: "readiness unavailable" };
    }
    const d = data as Record<string, unknown>;
    if (!Array.isArray(d.blockers)) {
        return { available: false, blockers: [], reason: "readiness unavailable" };
    }
    const blockers = d.blockers
        .filter((value): value is string => typeof value == "string")
        .map((value) => value.trim())
        .filter((value) => value != "");
    const advisories = (Array.isArray(d.advisories) ? d.advisories : [])
        .filter((value): value is string => typeof value == "string")
        .map((value) => value.trim())
        .filter((value) => value != "");
    const review = parsePrReviewEvidence(d.review);
    return {
        available: true,
        verdict: typeof d.verdict == "string" ? d.verdict : "",
        blockers,
        advisories,
        ...(review ? { review } : {}),
    };
}

function parsePrReviewEvidence(value: unknown): RecoderPrReviewEvidence | null {
    if (value == null || typeof value != "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (typeof row.pr != "number") return null;
    const impactRow = row.impact != null && typeof row.impact == "object" && !Array.isArray(row.impact)
        ? row.impact as Record<string, unknown>
        : null;
    const impact = impactRow ? parseImpactLedger(impactRow) : null;
    return {
        available: row.available === true,
        ...(typeof row.reason == "string" ? { reason: row.reason } : {}),
        pr: row.pr,
        diffTruncated: row.diffTruncated === true,
        ...(impact ? { impact } : {}),
    };
}

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item == "string") : [];
}

function impactFiles(value: unknown): RecoderImpactFile[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): RecoderImpactFile[] => {
        if (item == null || typeof item != "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        if (typeof row.path != "string" || typeof row.minDepth != "number") return [];
        const rawCoChange = row.coChange != null && typeof row.coChange == "object" && !Array.isArray(row.coChange)
            ? row.coChange as Record<string, unknown>
            : null;
        const coChange = rawCoChange &&
            typeof rawCoChange.commits == "number" && Number.isInteger(rawCoChange.commits) && rawCoChange.commits > 0 &&
            typeof rawCoChange.confidence == "number" && Number.isFinite(rawCoChange.confidence) &&
            rawCoChange.confidence >= 0 && rawCoChange.confidence <= 1
            ? { commits: rawCoChange.commits, confidence: rawCoChange.confidence }
            : null;
        return [{
            path: row.path,
            isTest: row.isTest === true,
            minDepth: Math.max(1, Math.floor(row.minDepth)),
            directions: stringList(row.directions).filter(
                (direction): direction is "upstream" | "downstream" => direction == "upstream" || direction == "downstream"
            ),
            changedSymbols: stringList(row.changedSymbols),
            symbols: stringList(row.symbols),
            relationTypes: stringList(row.relationTypes),
            processes: stringList(row.processes),
            ...(coChange ? { coChange } : {}),
        }];
    });
}

function finiteCount(value: unknown, fallback: number): number {
    return typeof value == "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function impactConsumers(value: unknown): RecoderImpactConsumer[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): RecoderImpactConsumer[] => {
        if (item == null || typeof item != "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const ecosystem = row.ecosystem;
        if (
            typeof row.repoId != "string" || typeof row.path != "string" ||
            typeof row.packageName != "string" || typeof row.importSpecifier != "string" ||
            (ecosystem != "npm" && ecosystem != "python" && ecosystem != "go" && ecosystem != "cargo")
        ) return [];
        return [{
            repoId: row.repoId,
            path: row.path,
            ecosystem: ecosystem as RecoderImpactConsumer["ecosystem"],
            packageName: row.packageName,
            importSpecifier: row.importSpecifier,
        }];
    });
}

function parseImpactLedger(row: Record<string, unknown>): NonNullable<RecoderPrReviewEvidence["impact"]> | null {
    const scope = row.scope;
    const risk = row.risk;
    if (
        row.source != "recodergit" ||
        (scope != "symbol" && scope != "file" && scope != "mixed" && scope != "unavailable") ||
        (risk != "UNKNOWN" && risk != "LOW" && risk != "MEDIUM" && risk != "HIGH" && risk != "CRITICAL")
    ) return null;
    const normalizedScope = scope as NonNullable<RecoderPrReviewEvidence["impact"]>["scope"];
    const normalizedRisk = risk as NonNullable<RecoderPrReviewEvidence["impact"]>["risk"];
    const files = impactFiles(row.files);
    const tests = impactFiles(row.tests);
    const processes = Array.isArray(row.processes)
        ? row.processes.flatMap((item): { label: string }[] => {
              if (item == null || typeof item != "object" || Array.isArray(item)) return [];
              const label = (item as Record<string, unknown>).label;
              return typeof label == "string" && label.trim() ? [{ label: label.trim() }] : [];
          })
        : [];
    const consumers = impactConsumers(row.consumers);
    const rawSummary = row.summary != null && typeof row.summary == "object" && !Array.isArray(row.summary)
        ? row.summary as Record<string, unknown>
        : {};
    return {
        available: row.available === true,
        ...(typeof row.reason == "string" ? { reason: row.reason } : {}),
        source: "recodergit",
        scope: normalizedScope,
        risk: normalizedRisk,
        partial: row.partial === true,
        files,
        tests,
        processes,
        consumers,
        summary: {
            impactedFiles: finiteCount(rawSummary.impactedFiles, files.length),
            affectedTests: finiteCount(rawSummary.affectedTests, tests.length),
            upstreamFiles: finiteCount(rawSummary.upstreamFiles, files.filter((file) => file.directions.includes("upstream")).length),
            downstreamFiles: finiteCount(rawSummary.downstreamFiles, files.filter((file) => file.directions.includes("downstream")).length),
            affectedProcesses: finiteCount(rawSummary.affectedProcesses, processes.length),
            coChangedFiles: finiteCount(rawSummary.coChangedFiles, files.filter((file) => file.coChange != null).length),
            crossRepositoryFiles: finiteCount(rawSummary.crossRepositoryFiles, consumers.length),
            consumerRepositories: finiteCount(rawSummary.consumerRepositories, new Set(consumers.map((item) => item.repoId)).size),
        },
    };
}

function parseGeneratedReviewFindings(value: unknown): RecoderReviewFindings {
    if (value == null || typeof value != "object" || Array.isArray(value)) {
        return { kept: [], dropped: 0, summary: "No evidence-backed findings returned." };
    }
    const row = value as Record<string, unknown>;
    const kept = Array.isArray(row.kept)
        ? row.kept.flatMap((item): RecoderReviewFinding[] => {
              if (item == null || typeof item != "object") return [];
              const finding = item as Record<string, unknown>;
              const severity = finding.severity;
              if (
                  typeof finding.file != "string" ||
                  typeof finding.line != "number" ||
                  typeof finding.message != "string" ||
                  typeof finding.evidence != "string" ||
                  (severity != "critical" && severity != "high" && severity != "medium" && severity != "low" && severity != "info")
              ) return [];
              return [{
                  file: finding.file,
                  line: finding.line,
                  severity: severity as RecoderReviewFinding["severity"],
                  message: finding.message,
                  evidence: finding.evidence,
                  ...(typeof finding.confidence == "number" ? { confidence: finding.confidence } : {}),
              }];
          })
        : [];
    return {
        kept,
        dropped: typeof row.dropped == "number" ? row.dropped : 0,
        summary: typeof row.summary == "string" ? row.summary : "Review completed.",
    };
}

// The merge edge returns convergence-trust evidence inside `data.merge`. A clean
// merge must still surface a warn-mode advisory at the decision point; replacing it
// with a bare "Merged." would make the backend's default advisory posture invisible.
function formatMergeSuccess(data: unknown): string {
    if (data == null || typeof data != "object" || Array.isArray(data)) {
        return "Merged.";
    }
    const merge = data as Record<string, unknown>;
    const warning = typeof merge.trustWarning == "string" ? merge.trustWarning.trim() : "";
    if (warning == "") {
        return "Merged.";
    }
    const tier =
        merge.trustTier == "high" || merge.trustTier == "medium" || merge.trustTier == "low" ? merge.trustTier : "";
    const score =
        typeof merge.trustScore == "number" && Number.isFinite(merge.trustScore) ? Math.round(merge.trustScore) : null;
    const trust =
        tier != "" && score != null
            ? ` (${tier}, ${score}/100)`
            : tier != ""
              ? ` (${tier})`
              : score != null
                ? ` (${score}/100)`
                : "";
    return `Merged. Trust advisory${trust}: ${warning}`;
}

function suggestEffectiveReviewAction(
    checks: RecoderWorkspaceChecks,
    readiness?: RecoderReadinessView | null
): RecoderReviewSuggestion | null {
    const githubSuggestion = suggestReviewAction(checks);
    if (readiness?.available && readiness.blockers.length > 0) {
        if (githubSuggestion?.action == "resolve-conflicts" || githubSuggestion?.action == "address-feedback") {
            return githubSuggestion;
        }
        return { action: "address-feedback", label: "Recoder found hard blockers in this workspace" };
    }
    return githubSuggestion;
}

// While any check is still running (or gh hasn't finished computing
// mergeability) the strip would otherwise sit on a stale PENDING forever, since
// the 6s refresh poll deliberately skips the gh-shelling checks edge. This lets
// refresh() re-probe on a slow cadence — but ONLY while genuinely pending.
const CHECKS_REPOLL_MS = 45000;

// Canonical readiness can include local commands, a trial merge, and a secret
// scan, so it must not ride every 6s workspace-list tick. While a real blocker is
// present, re-probe on a bounded slow cadence so an async agent remediation can
// clear the Review surface without requiring a manual refresh.
const READINESS_REPOLL_MS = 30000;

// True when the checks view has work still in flight: a not-yet-completed check
// row, or a mergeability GitHub is still computing ("UNKNOWN"). A stable result
// (all completed, mergeability known, or simply unavailable) is never pending,
// so the slow re-poll stops the moment CI settles.
function checksArePending(checks: RecoderWorkspaceChecks): boolean {
    if (checks == null || !checks.available) {
        return false;
    }
    if (typeof checks.mergeable == "string" && checks.mergeable.toUpperCase() == "UNKNOWN") {
        return true;
    }
    return (checks.checks ?? []).some((row) =>
        row.status.toLowerCase() != "completed" || row.remediation?.state == "running"
    );
}

// Coerce the checks payload into the view shape without ever trusting it.
// Anything that isn't the documented shape degrades to a truthful
// unavailable-with-reason, never a crash or a fabricated green.
function parseChecksData(data: unknown): RecoderWorkspaceChecks {
    if (data == null || typeof data != "object") {
        return { available: false, reason: "checks unavailable" };
    }
    const d = data as Record<string, unknown>;
    if (d.available !== true) {
        const reason = typeof d.reason == "string" && d.reason.trim() != "" ? d.reason : "checks unavailable";
        return { available: false, reason };
    }
    const rawChecks = Array.isArray(d.checks) ? d.checks : [];
    const checks: RecoderCheckRow[] = [];
    for (const entry of rawChecks) {
        if (entry == null || typeof entry != "object") {
            continue;
        }
        const e = entry as Record<string, unknown>;
        if (typeof e.name != "string" || e.name == "") {
            continue;
        }
        const source = e.source === "github" ? "github" as const : e.source === "recoder" ? "recoder" as const : undefined;
        const rawAutofix = e.autofix != null && typeof e.autofix == "object"
            ? e.autofix as Record<string, unknown>
            : null;
        const autofix = rawAutofix && typeof rawAutofix.prompt == "string" && rawAutofix.prompt.trim() != ""
            ? { prompt: rawAutofix.prompt }
            : undefined;
        const rawRemediation = e.remediation != null && typeof e.remediation == "object"
            ? e.remediation as Record<string, unknown>
            : null;
        const remediationState = rawRemediation && ["running", "passed", "failed", "error"].includes(String(rawRemediation.state))
            ? rawRemediation.state as "running" | "passed" | "failed" | "error"
            : undefined;
        const beforeStatus: "fail" | "error" | undefined = rawRemediation?.beforeStatus == "fail"
            ? "fail"
            : rawRemediation?.beforeStatus == "error" ? "error" : undefined;
        const afterStatus: "pass" | "fail" | "error" | undefined = rawRemediation?.afterStatus == "pass"
            ? "pass"
            : rawRemediation?.afterStatus == "fail"
              ? "fail"
              : rawRemediation?.afterStatus == "error" ? "error" : undefined;
        const agentOutcome: "completed" | "failed" | undefined = rawRemediation?.agentOutcome == "completed"
            ? "completed"
            : rawRemediation?.agentOutcome == "failed" ? "failed" : undefined;
        const remediation = rawRemediation && remediationState && beforeStatus &&
            typeof rawRemediation.attemptId == "string" && typeof rawRemediation.requestedAt == "string"
            ? {
                attemptId: rawRemediation.attemptId,
                state: remediationState,
                requestedAt: rawRemediation.requestedAt,
                beforeStatus,
                ...(typeof rawRemediation.attestedAt == "string" ? { attestedAt: rawRemediation.attestedAt } : {}),
                ...(afterStatus ? { afterStatus } : {}),
                ...(typeof rawRemediation.afterDetail == "string" ? { afterDetail: rawRemediation.afterDetail } : {}),
                ...(agentOutcome ? { agentOutcome } : {}),
            }
            : undefined;
        checks.push({
            name: e.name,
            status: typeof e.status == "string" ? e.status : "",
            conclusion: typeof e.conclusion == "string" ? e.conclusion : "",
            ...(source ? { source } : {}),
            ...(typeof e.detail == "string" ? { detail: e.detail } : {}),
            ...(autofix ? { autofix } : {}),
            ...(remediation ? { remediation } : {}),
        });
    }
    return {
        available: true,
        mergeable: typeof d.mergeable == "string" ? d.mergeable : "",
        reviewDecision: typeof d.reviewDecision == "string" ? d.reviewDecision : "",
        ...(typeof d.githubAvailable == "boolean" ? { githubAvailable: d.githubAvailable } : {}),
        ...(typeof d.githubReason == "string" ? { githubReason: d.githubReason } : {}),
        ...(typeof d.localRan == "boolean" ? { localRan: d.localRan } : {}),
        checks,
    };
}

// Human summary of a 200 discard response (`data.discard`: the file view's
// per-path `results` or the hunk view's per-hunk `hunks`). A 200 can still
// carry per-item failures — the backend reports each item truthfully, never
// batch-faked — so failures surface here with their real reasons.
function summarizeDiscardOutcome(data: unknown): string {
    const raw = data != null && typeof data == "object" ? (data as Record<string, unknown>).discard : null;
    if (raw == null || typeof raw != "object") {
        return "Discarded.";
    }
    const view = raw as Record<string, unknown>;
    const isHunkView = Array.isArray(view.hunks);
    const rows = isHunkView
        ? (view.hunks as unknown[])
        : Array.isArray(view.results)
          ? (view.results as unknown[])
          : [];
    const noun = isHunkView ? "hunk" : "file";
    let discarded = 0;
    const failures: string[] = [];
    for (const row of rows) {
        if (row == null || typeof row != "object") {
            continue;
        }
        const r = row as Record<string, unknown>;
        const label = isHunkView
            ? `hunk ${typeof r.index == "number" ? r.index + 1 : "?"}`
            : typeof r.path == "string" && r.path != ""
              ? r.path
              : "(file)";
        if (r.action == "failed") {
            const reason = typeof r.reason == "string" && r.reason != "" ? r.reason : "failed";
            failures.push(`${label} — ${reason}`);
            continue;
        }
        if (r.action == "restored" || r.action == "removed" || r.action == "discarded") {
            discarded += 1;
        }
    }
    if (failures.length > 0) {
        const failText = `could not discard ${failures.join("; ")}`;
        return discarded > 0
            ? `Discarded ${discarded} ${noun}${discarded == 1 ? "" : "s"}; ${failText}.`
            : `Could not discard ${failures.join("; ")}.`;
    }
    if (discarded == 0) {
        return "Nothing to discard — already matches the review base.";
    }
    return `Discarded ${discarded} ${noun}${discarded == 1 ? "" : "s"}.`;
}

class RecoderDiffViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    blockAtom: Atom<Block>;
    workspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    selectedIdAtom: PrimitiveAtom<string>;
    diffAtom: PrimitiveAtom<RecoderWorkspaceDiff>;
    // False once a workspace-list fetch fails (backend down) → "not connected".
    connectedAtom: PrimitiveAtom<boolean>;
    loadingAtom: PrimitiveAtom<boolean>;
    diffLoadingAtom: PrimitiveAtom<boolean>;
    // Neutral, human diff status ("no diff", "diff endpoint not available", …).
    diffStatusAtom: PrimitiveAtom<string>;
    mergingAtom: PrimitiveAtom<boolean>;
    // Human result of the last merge action ("Merged.", approval reason, …).
    mergeStatusAtom: PrimitiveAtom<string>;
    prCreatingAtom: PrimitiveAtom<boolean>;
    // Human result of the last PR action ("PR created: <url>", approval reason, …).
    prStatusAtom: PrimitiveAtom<string>;
    // The workspace's live gh-backed PR view: the chip once a PR exists, plus the
    // truthful degrade reason that gates the Create PR action. null until probed.
    prViewAtom: PrimitiveAtom<RecoderPrStatus>;
    checksAtom: PrimitiveAtom<RecoderWorkspaceChecks>;
    checksLoadingAtom: PrimitiveAtom<boolean>;
    readinessAtom: PrimitiveAtom<RecoderReadinessView | null>;
    readinessLoadingAtom: PrimitiveAtom<boolean>;
    // Draft line-anchored review comments, queued client-side until the reviewer
    // sends them to the agent (POST …/review-comments). Cleared on a successful send.
    discardingAtom: PrimitiveAtom<boolean>;
    // Human result of the last discard ("Discarded 1 file.", verdict reason, …).
    discardStatusAtom: PrimitiveAtom<string>;
    pendingCommentsAtom: PrimitiveAtom<ReviewCommentDraft[]>;
    commentSendingAtom: PrimitiveAtom<boolean>;
    // Human result of the last send ("Sent 3 comments to the agent.", reason, …).
    commentStatusAtom: PrimitiveAtom<string>;
    blockerFeedbackSendingAtom: PrimitiveAtom<boolean>;
    blockerFeedbackStatusAtom: PrimitiveAtom<string>;
    // The ONE pending governance approval the selected run is blocked on (null =
    // none). Populated ONLY when the workspace is awaiting_approval AND a real
    // pending record correlates to it — never a fabricated card.
    inlineApprovalAtom: PrimitiveAtom<RecoderApproval | null>;
    approvalDecidingAtom: PrimitiveAtom<boolean>;
    // Truthful reason a decide failed (403/503/transport) — the card surfaces it
    // and stays; a failed approve is NEVER shown as approved.
    approvalErrorAtom: PrimitiveAtom<string>;
    // Which workspace checksAtom describes — lets the 6s refresh poll skip
    // re-probing gh (the checks edge shells out per call) unless the selection
    // actually changed.
    checksWorkspaceId: string;
    readinessWorkspaceId: string;
    readinessProbedAtMs: number;
    // Wall-clock of the last checks probe, so the pending re-poll fires at most
    // once per CHECKS_REPOLL_MS instead of on every 6s tick.
    checksProbedAtMs: number;
    // Which workspace the preview-verification read describes (checksWorkspaceId
    // pattern): the 6s refresh poll skips re-fetching unless the selection
    // changed, and a newer fetch supersedes an in-flight one.
    previewWorkspaceId: string;
    // Which workspace prViewAtom describes, and when it was probed: pr-status is a
    // real gh call, so the 6s poll only re-probes on a selection change or once
    // the slow PrStatusRefreshMs window elapses (GitHub moves without the row).
    prViewWorkspaceId: string;
    prProbedAtMs: number;
    // Which workspace the inline-approval read describes: a newer read supersedes
    // an in-flight one so a stale resolver never writes a card the current
    // selection doesn't own (the checksWorkspaceId pattern).
    approvalsWorkspaceId: string;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-diff";
        this.viewIcon = atom("code-compare");
        this.viewName = atom("Review");
        this.blockAtom = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        this.workspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.selectedIdAtom = atom("") as PrimitiveAtom<string>;
        this.diffAtom = atom(null) as PrimitiveAtom<RecoderWorkspaceDiff>;
        this.connectedAtom = atom(true) as PrimitiveAtom<boolean>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.diffLoadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.diffStatusAtom = atom("") as PrimitiveAtom<string>;
        this.mergingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.mergeStatusAtom = atom("") as PrimitiveAtom<string>;
        this.prCreatingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.prStatusAtom = atom("") as PrimitiveAtom<string>;
        this.prViewAtom = atom(null) as PrimitiveAtom<RecoderPrStatus>;
        this.checksAtom = atom(null) as PrimitiveAtom<RecoderWorkspaceChecks>;
        this.checksLoadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.readinessAtom = atom(null) as PrimitiveAtom<RecoderReadinessView | null>;
        this.readinessLoadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.discardingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.discardStatusAtom = atom("") as PrimitiveAtom<string>;
        this.pendingCommentsAtom = atom([]) as PrimitiveAtom<ReviewCommentDraft[]>;
        this.commentSendingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.commentStatusAtom = atom("") as PrimitiveAtom<string>;
        this.blockerFeedbackSendingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.blockerFeedbackStatusAtom = atom("") as PrimitiveAtom<string>;
        this.inlineApprovalAtom = atom(null) as PrimitiveAtom<RecoderApproval | null>;
        this.approvalDecidingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.approvalErrorAtom = atom("") as PrimitiveAtom<string>;
        this.checksWorkspaceId = "";
        this.readinessWorkspaceId = "";
        this.readinessProbedAtMs = 0;
        this.checksProbedAtMs = 0;
        this.previewWorkspaceId = "";
        this.prViewWorkspaceId = "";
        this.prProbedAtMs = 0;
        this.approvalsWorkspaceId = "";
    }

    get viewComponent(): ViewComponent {
        return RecoderDiffView;
    }

    // Fetch the workspace list, keep/auto-pick a selection, then load its diff.
    // Degrade-safe: a failed list fetch flips connectedAtom off (neutral "not
    // connected" state) and never throws.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`);
            const body = await res.json();
            // The conductor wraps the list as { data: { workspaces: [...] } };
            // tolerate a bare { data: [...] } too so an older embedded backend
            // still renders. Never assume a shape we didn't see.
            const data = body?.data;
            const list = Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [];
            const workspaces = (list as RecoderWorkspace[]).filter((w) => w.state != "archived");
            globalStore.set(this.workspacesAtom, workspaces);
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
            const current = globalStore.get(this.selectedIdAtom);
            const stillValid = workspaces.some((w) => w.workspaceId === current);
            if (!stillValid) {
                // Prefer the workspace the hub clicked into (block meta) when it's
                // present in the live list, else auto-select the first one.
                const seed = readWorkspaceId(globalStore.get(this.blockAtom));
                const seeded = seed != "" && workspaces.some((w) => w.workspaceId === seed) ? seed : "";
                globalStore.set(this.selectedIdAtom, seeded || workspaces[0]?.workspaceId || "");
            }
        } catch {
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
            globalStore.set(this.workspacesAtom, []);
            globalStore.set(this.selectedIdAtom, "");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
        const selected = globalStore.get(this.selectedIdAtom);
        if (!selected) {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "");
            globalStore.set(this.checksAtom, null);
            this.checksWorkspaceId = "";
            globalStore.set(this.readinessAtom, null);
            globalStore.set(this.readinessLoadingAtom, false);
            this.readinessWorkspaceId = "";
            this.readinessProbedAtMs = 0;
            globalStore.set(previewVerificationStateAtom, null);
            this.previewWorkspaceId = "";
            globalStore.set(this.prViewAtom, null);
            this.prViewWorkspaceId = "";
            this.clearInlineApproval();
            return;
        }
        const checksStale = this.checksWorkspaceId != selected;
        // Re-probe gh on the slow cadence ONLY while checks are genuinely in
        // flight, so a settled result never costs a gh call and a running one
        // stops showing PENDING forever.
        const repollDue =
            !checksStale &&
            checksArePending(globalStore.get(this.checksAtom)) &&
            Date.now() - this.checksProbedAtMs >= CHECKS_REPOLL_MS;
        const readinessStale = this.readinessWorkspaceId != selected;
        const readiness = globalStore.get(this.readinessAtom);
        const readinessRepollDue =
            !readinessStale &&
            readiness?.available === true &&
            readiness.blockers.length > 0 &&
            Date.now() - this.readinessProbedAtMs >= READINESS_REPOLL_MS;
        const previewStale = this.previewWorkspaceId != selected;
        const prStale = this.prViewWorkspaceId != selected;
        // Re-probe gh for the PR view only on a selection change or once the slow
        // window elapses, so the 6s poll never fans out a gh call per tick.
        const prRepollDue = !prStale && Date.now() - this.prProbedAtMs >= PrStatusRefreshMs;
        await Promise.all([
            this.loadDiff(selected),
            checksStale || repollDue ? this.fetchChecks(selected) : Promise.resolve(),
            readinessStale || readinessRepollDue ? this.fetchReadiness(selected) : Promise.resolve(),
            previewStale ? this.loadPreviewVerification(selected) : Promise.resolve(),
            prStale || prRepollDue ? this.fetchPrStatus(selected) : Promise.resolve(),
            this.refreshInlineApproval(selected),
        ]);
    }

    // Explicit user-driven refresh of just the checks strip (the affordance in
    // the Review view). Force-re-probes gh for the current selection; unlike the
    // 6s poll this always fetches because the user asked for it.
    async refreshChecks() {
        const selected = globalStore.get(this.selectedIdAtom);
        if (!selected) {
            return;
        }
        await Promise.all([this.fetchChecks(selected), this.fetchReadiness(selected)]);
    }

    // Canonical hard blockers (merge conflicts, GitHub/local checks, and secret
    // findings). Loaded on selection, explicitly refreshed with the checks strip,
    // and slowly re-probed only while blockers remain; never polled every six seconds.
    async fetchReadiness(workspaceId: string) {
        const id = workspaceId.trim();
        if (id == "") {
            this.readinessWorkspaceId = "";
            globalStore.set(this.readinessAtom, null);
            globalStore.set(this.readinessLoadingAtom, false);
            return;
        }
        const selectionChanged = this.readinessWorkspaceId != id;
        this.readinessWorkspaceId = id;
        // Keep the last blocker verdict visible during a same-workspace slow
        // re-probe. Clearing it would briefly re-promote Merge while the request
        // is in flight — exactly when Recoder still knows the workspace is blocked.
        if (selectionChanged) globalStore.set(this.readinessAtom, null);
        globalStore.set(this.readinessLoadingAtom, true);
        const current = () => this.readinessWorkspaceId == id;
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/readiness`
            );
            if (!current()) return;
            if (!res.ok) {
                const detail = await readFetchError(res);
                if (!current()) return;
                // A missing edge means an older backend: retain the latch so the
                // 6s refresh never hammers it. Transient errors drop the latch and
                // get one normal retry on the next refresh.
                if (res.status != 404) this.readinessWorkspaceId = "";
                globalStore.set(this.readinessAtom, {
                    available: false,
                    blockers: [],
                    reason: detail || "readiness endpoint not available",
                });
                return;
            }
            const body = await res.json();
            if (!current()) return;
            this.readinessProbedAtMs = Date.now();
            globalStore.set(this.readinessAtom, parseReadinessData(body?.data));
        } catch {
            if (!current()) return;
            this.readinessWorkspaceId = "";
            globalStore.set(this.readinessAtom, {
                available: false,
                blockers: [],
                reason: "readiness endpoint not available",
            });
        } finally {
            if (current() || this.readinessWorkspaceId == "") {
                globalStore.set(this.readinessLoadingAtom, false);
            }
        }
    }

    async selectWorkspace(workspaceId: string) {
        globalStore.set(this.selectedIdAtom, workspaceId);
        this.readinessWorkspaceId = workspaceId;
        this.readinessProbedAtMs = 0;
        globalStore.set(this.readinessAtom, null);
        globalStore.set(this.readinessLoadingAtom, false);
        // Delivery copy belongs to the workspace it was produced for; never let a
        // success/failure from the previous selection appear under the next one.
        globalStore.set(this.blockerFeedbackStatusAtom, "");
        if (!workspaceId) {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "");
            globalStore.set(this.checksAtom, null);
            this.checksWorkspaceId = "";
            globalStore.set(previewVerificationStateAtom, null);
            this.previewWorkspaceId = "";
            globalStore.set(this.prViewAtom, null);
            this.prViewWorkspaceId = "";
            this.clearInlineApproval();
            return;
        }
        await Promise.all([
            this.loadDiff(workspaceId),
            this.fetchChecks(workspaceId),
            this.loadPreviewVerification(workspaceId),
            this.fetchPrStatus(workspaceId),
            this.refreshInlineApproval(workspaceId),
        ]);
    }

    // Degrade-safe: 404 → "no diff", other non-2xx → "diff unavailable", thrown
    // (backend unreachable) → "diff endpoint not available". Never a crash or a
    // fabricated diff.
    async loadDiff(workspaceId: string) {
        globalStore.set(this.diffLoadingAtom, true);
        globalStore.set(this.diffStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/diff`
            );
            if (!res.ok) {
                globalStore.set(this.diffAtom, null);
                if (res.status == 404) {
                    globalStore.set(this.diffStatusAtom, "no diff");
                    return;
                }
                const detail = await readFetchError(res);
                globalStore.set(this.diffStatusAtom, detail || `Diff unavailable (${res.status})`);
                return;
            }
            const body = await res.json();
            const data = body?.data;
            const valid = data != null && typeof data == "object";
            globalStore.set(this.diffAtom, valid ? (data as RecoderWorkspaceDiff) : null);
            if (!valid) {
                globalStore.set(this.diffStatusAtom, "no diff");
            }
        } catch {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "diff endpoint not available");
        } finally {
            globalStore.set(this.diffLoadingAtom, false);
        }
    }

    // PR checks / merge-readiness for the selected workspace. Unavailability is
    // a NORMAL state here (local-only repo, no PR, no gh) — every failure path
    // lands on available:false with a truthful reason, never a thrown error.
    async fetchChecks(workspaceId: string) {
        this.checksWorkspaceId = workspaceId;
        globalStore.set(this.checksAtom, null);
        globalStore.set(this.checksLoadingAtom, true);
        // A newer fetch supersedes this one by overwriting checksWorkspaceId;
        // stale resolvers must not write atoms the newer call now owns.
        const current = () => this.checksWorkspaceId == workspaceId;
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checks`
            );
            if (!current()) {
                return;
            }
            if (!res.ok) {
                if (res.status == 404) {
                    globalStore.set(this.checksAtom, { available: false, reason: "checks endpoint not available" });
                    return;
                }
                const detail = await readFetchError(res);
                if (!current()) {
                    return;
                }
                // transient server failure: drop the poll-skip latch so the
                // next refresh retries instead of sticking on the error
                this.checksWorkspaceId = "";
                globalStore.set(this.checksAtom, {
                    available: false,
                    reason: detail || `checks unavailable (${res.status})`,
                });
                return;
            }
            const body = await res.json();
            if (!current()) {
                return;
            }
            this.checksProbedAtMs = Date.now();
            globalStore.set(this.checksAtom, parseChecksData(body?.data));
        } catch {
            if (!current()) {
                return;
            }
            this.checksWorkspaceId = "";
            globalStore.set(this.checksAtom, { available: false, reason: "checks endpoint not available" });
        } finally {
            if (current() || this.checksWorkspaceId == "") {
                globalStore.set(this.checksLoadingAtom, false);
            }
        }
    }

    // Ask the governed named-check remediation edge to reproduce the failure,
    // continue the SAME isolated Session/worktree, and register a durable attempt
    // for independent post-agent attestation. Wave sends identity, never a prompt.
    async requestCheckAutofix(workspaceId: string, row: RecoderCheckRow): Promise<string> {
        if (!workspaceId || row.source != "recoder" || !row.autofix?.prompt) {
            return "This check is advisory; its repository did not enable agent remediation.";
        }
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checks/remediate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ checkName: row.name }),
                }
            );
            if (!res.ok) {
                const detail = await readFetchError(res);
                return detail || `Could not start remediation (${res.status}).`;
            }
            // Re-read immediately so the durable `running` attempt appears in
            // the row; checksArePending then keeps the slow poll alive until the
            // terminal hook replaces it with independent attestation evidence.
            await this.fetchChecks(workspaceId);
            return `Agent is fixing ${row.name}; Recoder will rerun it independently when the Session settles.`;
        } catch {
            return "Could not start remediation — Recoder isn’t reachable.";
        }
    }

    // The workspace's live PR view (gh-backed pr-status edge): folds into the PR
    // chip once one exists and gates the Create PR action with a truthful reason
    // when a PR can't be opened. Like fetchChecks it's a real gh call, so the
    // prViewWorkspaceId latch lets the 6s poll skip it and supersedes a stale
    // in-flight resolve; an unreachable/unusable read (null) drops the latch so a
    // later refresh retries instead of sticking on a stale null. Never throws.
    async fetchPrStatus(workspaceId: string) {
        this.prViewWorkspaceId = workspaceId;
        const view = await fetchWorkspacePrStatusView(getRecoderBackendUrl(), workspaceId);
        if (this.prViewWorkspaceId != workspaceId) {
            return;
        }
        if (view == null) {
            this.prViewWorkspaceId = "";
            globalStore.set(this.prViewAtom, null);
            return;
        }
        this.prProbedAtMs = Date.now();
        globalStore.set(this.prViewAtom, view);
    }

    // Read the last persisted preview verification for the selected workspace
    // (the read-only GET …/preview-verification edge — never triggers a browser
    // run). Selection-driven only: the previewWorkspaceId latch keeps the 6s
    // refresh poll from re-fetching, and a newer fetch supersedes an in-flight
    // one exactly like checksWorkspaceId. An unreachable read drops the latch so
    // the next refresh retries instead of sticking on the failure. The result —
    // including the truthful not-verified / workspace-missing 404 split — lands
    // in the workspace-tagged shared atom the evidence panel renders.
    async loadPreviewVerification(workspaceId: string) {
        this.previewWorkspaceId = workspaceId;
        globalStore.set(previewVerificationStateAtom, { workspaceId, loading: true });
        const result = await fetchPreviewVerification(workspaceId);
        if (this.previewWorkspaceId != workspaceId) {
            return;
        }
        if (!result.ok && result.reason == "unreachable") {
            this.previewWorkspaceId = "";
        }
        globalStore.set(previewVerificationStateAtom, { workspaceId, loading: false, result });
    }

    // Merge the selected workspace — the "review → merge" close. Degrade-safe:
    // 403 (blocked / needs approval) and 503 (failed / illegal transition) each
    // surface the backend's truthful reason; other non-2xx → truthful failure;
    // success → "Merged." then refresh. In a solo desktop the merge click IS the
    // approval (server-side). Never fabricates.
    async mergeSelected() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.mergingAtom, true);
        globalStore.set(this.mergeStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/merge`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                globalStore.set(this.mergeStatusAtom, formatMergeSuccess(body?.data?.merge));
                await this.refresh();
                return;
            }
            const reason = readErrorReason(body);
            const outcome = readErrorOutcome(body);
            if (res.status == 409 && outcome == "escalated") {
                globalStore.set(this.mergeStatusAtom, `Human review required — ${reason || "convergence trust could not be judged"}.`);
                return;
            }
            if (res.status == 409 && outcome == "trust_blocked") {
                globalStore.set(this.mergeStatusAtom, `Merge blocked by convergence trust — ${reason || "review the trust evidence"}.`);
                return;
            }
            if (res.status == 403) {
                globalStore.set(this.mergeStatusAtom, reason || "Merge blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(this.mergeStatusAtom, `Merge could not complete — ${reason || "operation failed"}.`);
                return;
            }
            globalStore.set(this.mergeStatusAtom, reason || `Merge failed (${res.status}).`);
        } catch {
            globalStore.set(this.mergeStatusAtom, "Merge unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.mergingAtom, false);
        }
    }

    // Open a PR for the selected workspace branch. Degrade-safe: 403 (blocked /
    // needs approval) and 503 (failed) each surface the backend's truthful reason;
    // other non-2xx → truthful failure; success → "PR created: <url>" (or "PR
    // created." when the backend returns no url). Never fabricates a PR.
    async createPr() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        // The PR route requires a non-empty title; derive it from the workspace's
        // branch (falling back to its id) so the call never 400s on a missing title.
        const ws = globalStore.get(this.workspacesAtom).find((w) => w.workspaceId == workspaceId);
        const title = (ws?.branch || workspaceId).trim();
        globalStore.set(this.prCreatingAtom, true);
        globalStore.set(this.prStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/pr`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title }),
                }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const url = body?.data && typeof body.data.url == "string" ? body.data.url : "";
                globalStore.set(this.prStatusAtom, url ? `PR created: ${url}` : "PR created.");
                // Drop the pr-status latch so the refresh re-probes gh and the new
                // PR's live chip appears (selection is unchanged, so it'd otherwise
                // be skipped as not-stale).
                this.prViewWorkspaceId = "";
                await this.refresh();
                return;
            }
            const reason = readErrorReason(body);
            if (res.status == 403) {
                globalStore.set(this.prStatusAtom, reason || "PR blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(this.prStatusAtom, `PR could not complete — ${reason || "operation failed"}.`);
                return;
            }
            globalStore.set(this.prStatusAtom, reason || `PR failed (${res.status}).`);
        } catch {
            globalStore.set(this.prStatusAtom, "PR unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.prCreatingAtom, false);
        }
    }

    // Queue a line-anchored (or file-level when line is null) review comment. An
    // empty body is ignored so a stray submit never enqueues a blank note. `side`
    // carries difit's diff-source ("old" for a deletion); "new" is the default and
    // left off the wire (the backend defaults it).
    addComment(file: string, line: number | null, body: string, side?: "old" | "new") {
        const trimmed = body.trim();
        if (file.trim() == "" || trimmed == "") {
            return;
        }
        const draft: ReviewCommentDraft = { file, line, body: trimmed, ...(side == "old" ? { side } : {}) };
        globalStore.set(this.pendingCommentsAtom, [...globalStore.get(this.pendingCommentsAtom), draft]);
        globalStore.set(this.commentStatusAtom, "");
    }

    removeComment(index: number) {
        const current = globalStore.get(this.pendingCommentsAtom);
        if (index < 0 || index >= current.length) {
            return;
        }
        globalStore.set(
            this.pendingCommentsAtom,
            current.filter((_, i) => i != index)
        );
    }

    // Send the queued comments to the live agent (POST …/review-comments — the
    // gated steer that folds them into one prompt). Degrade-safe like merge/PR:
    // 403 (needs approval) and 503 (could not complete) surface truthful reasons;
    // a clean success clears the queue. Never fabricates a delivery.
    async sendComments() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        const comments = globalStore.get(this.pendingCommentsAtom);
        if (!workspaceId || comments.length == 0) {
            return;
        }
        globalStore.set(this.commentSendingAtom, true);
        globalStore.set(this.commentStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/review-comments`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ comments }),
                }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const n = comments.length;
                globalStore.set(this.pendingCommentsAtom, []);
                globalStore.set(this.commentStatusAtom, `Sent ${n} comment${n == 1 ? "" : "s"} to the agent.`);
                return;
            }
            const reason = readErrorReason(body);
            if (res.status == 403) {
                globalStore.set(this.commentStatusAtom, reason || "Blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(this.commentStatusAtom, `Could not send — ${reason || "operation failed"}.`);
                return;
            }
            globalStore.set(this.commentStatusAtom, reason || `Send failed (${res.status}).`);
        } catch {
            globalStore.set(this.commentStatusAtom, "Send unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.commentSendingAtom, false);
        }
    }

    // Ask the backend to re-run canonical readiness probes and send the resulting
    // hard blockers through the governed review loop. No blocker text crosses
    // from this client, so a stale or modified UI cannot forge agent instructions.
    async sendBlockerFeedback() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.blockerFeedbackSendingAtom, true);
        globalStore.set(this.blockerFeedbackStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/blocker-feedback`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const feedback = body?.data?.feedback;
                const count = Array.isArray(feedback?.blockers) ? feedback.blockers.length : 0;
                globalStore.set(
                    this.blockerFeedbackStatusAtom,
                    count > 0
                        ? `Sent ${count} blocker${count == 1 ? "" : "s"} to the agent.`
                        : "Blockers sent to the agent."
                );
                await this.refreshChecks();
                return;
            }
            const reason = readErrorReason(body);
            if (res.status == 403) {
                globalStore.set(this.blockerFeedbackStatusAtom, reason || "Blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(
                    this.blockerFeedbackStatusAtom,
                    `Could not send blockers — ${reason || "operation failed"}.`
                );
                return;
            }
            globalStore.set(this.blockerFeedbackStatusAtom, reason || `Send failed (${res.status}).`);
        } catch {
            globalStore.set(this.blockerFeedbackStatusAtom, "Send unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.blockerFeedbackSendingAtom, false);
        }
    }

    // FILE-level reject (POST …/files/discard): restore the paths to the review
    // base server-side. Discarding is the ONLY destructive action — "keep the
    // rest" is implicit, so there is no client staging state to drift from the
    // worktree.
    async discardFiles(paths: string[]) {
        if (paths.length == 0 || paths.some((p) => p.trim() == "")) {
            return;
        }
        await this.postDiscard("files/discard", { paths });
    }

    // HUNK-level reject (POST …/files/discard-hunks). `hunkIndexes` are the
    // file's `@@` ordinals vs the review base — exactly what the backend's own
    // parse expects (it re-diffs the single path itself; no client patch math).
    async discardHunks(path: string, hunkIndexes: number[]) {
        if (path.trim() == "" || hunkIndexes.length == 0) {
            return;
        }
        await this.postDiscard("files/discard-hunks", { path, hunkIndexes });
    }

    // Shared degrade-safe POST for both discard edges (the mergeSelected
    // pattern): 403 surfaces the governance verdict's truthful reason, 503 the
    // truthful failure; a 200 renders the per-item outcome (which can itself
    // carry per-item failures) then reloads the diff so the view shows the real
    // worktree. Never fabricates.
    async postDiscard(edge: string, body: Record<string, unknown>) {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.discardingAtom, true);
        globalStore.set(this.discardStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/${edge}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );
            const resBody = await res.json().catch(() => null);
            if (res.ok) {
                globalStore.set(this.discardStatusAtom, summarizeDiscardOutcome(resBody?.data));
                await this.loadDiff(workspaceId);
                return;
            }
            const reason = readErrorReason(resBody);
            if (res.status == 403) {
                globalStore.set(this.discardStatusAtom, reason || "Discard blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(
                    this.discardStatusAtom,
                    `Discard could not complete — ${reason || "operation failed"}.`
                );
                return;
            }
            globalStore.set(this.discardStatusAtom, reason || `Discard failed (${res.status}).`);
        } catch {
            globalStore.set(this.discardStatusAtom, "Discard unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.discardingAtom, false);
        }
    }

    // Drop the inline-approval card and its error, and release the read latch so
    // the next awaiting_approval selection re-probes fresh.
    clearInlineApproval() {
        globalStore.set(this.inlineApprovalAtom, null);
        globalStore.set(this.approvalErrorAtom, "");
        this.approvalsWorkspaceId = "";
    }

    // Correlate the selected workspace to the ONE pending governance approval its
    // run is blocked on, so the Review screen can bring approve/reject in-context
    // instead of bouncing to the Approvals tab. Only reads the approvals edge when
    // the DURABLE state says the run is waiting (awaiting_approval) — a settled run
    // never costs a poll, and never shows a card. Degrade-truthful: an unreachable
    // or non-2xx read clears the card (no fabricated approval) and drops the latch.
    // The existing approvalErrorAtom (from a failed decide) is preserved across the
    // poll so the reviewer keeps seeing why their last action failed.
    async refreshInlineApproval(workspaceId: string) {
        const ws = globalStore.get(this.workspacesAtom).find((w) => w.workspaceId == workspaceId);
        const state = ws?.state ?? "";
        if (state != "awaiting_approval") {
            this.clearInlineApproval();
            return;
        }
        this.approvalsWorkspaceId = workspaceId;
        const current = () => this.approvalsWorkspaceId == workspaceId;
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/approvals`);
            if (!current()) {
                return;
            }
            if (!res.ok) {
                this.approvalsWorkspaceId = "";
                globalStore.set(this.inlineApprovalAtom, null);
                return;
            }
            const body = await res.json();
            if (!current()) {
                return;
            }
            const data = body?.data;
            const list = Array.isArray(data?.approvals) ? data.approvals : Array.isArray(data) ? data : [];
            const match = selectWorkspaceApproval(ws!, list as RecoderApproval[]);
            globalStore.set(this.inlineApprovalAtom, shouldShowInlineApproval(state, match) ? match : null);
        } catch {
            if (!current()) {
                return;
            }
            this.approvalsWorkspaceId = "";
            globalStore.set(this.inlineApprovalAtom, null);
        }
    }

    // Resolve the inline approval through the SAME governed decide endpoint the
    // Approvals list uses (shared decideApproval contract — the backend resolves
    // the decider from the authenticated principal). approve → the run continues
    // server-side; a clean decision clears the card and refreshes so the advanced
    // state shows. A failed decide surfaces the truthful reason and KEEPS the card
    // — never a fabricated "approved".
    async decideInlineApproval(action: "approve" | "reject") {
        const approval = globalStore.get(this.inlineApprovalAtom);
        if (approval == null) {
            return;
        }
        globalStore.set(this.approvalDecidingAtom, true);
        globalStore.set(this.approvalErrorAtom, "");
        const result = await decideApproval(approval.id, action);
        globalStore.set(this.approvalDecidingAtom, false);
        if (!result.ok) {
            globalStore.set(this.approvalErrorAtom, result.error || `Could not ${action}.`);
            return;
        }
        globalStore.set(this.inlineApprovalAtom, null);
        this.approvalsWorkspaceId = "";
        await this.refresh();
    }
}

export {
    canSendBlockerFeedback,
    checksArePending,
    formatMergeSuccess,
    isFailedConclusion,
    parseChecksData,
    parseGeneratedReviewFindings,
    parseReadinessData,
    RecoderDiffViewModel,
    suggestEffectiveReviewAction,
    suggestReviewAction,
    summarizeDiscardOutcome,
    type RecoderCheckRow,
    type RecoderReadinessView,
    type RecoderPrReviewEvidence,
    type RecoderReviewFinding,
    type RecoderReviewFindings,
    type RecoderReviewActionId,
    type RecoderReviewSuggestion,
    type RecoderWorkspace,
    type RecoderWorkspaceChecks,
    type RecoderWorkspaceDiff,
};
