// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import { useEffect, useMemo, useState } from "react";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";
import type { RecoderWorkspace } from "./recoder-model";
import { githubFindingSourceUrl } from "./recoder-pr-review-links";
import { buildPrReviewControlBody } from "./recoder-pr-review-control";
import { recommendPrReviewEvent } from "./recoder-pr-review-recommendation";
import { FIELD_LABEL, INPUT, META, PRIMARY_BTN, QUIET_BTN, QUIET_BTN_XS, ROW_TITLE, STATE_CHIP } from "./recoder-styles";

type ReviewEntry = {
    key: string;
    number: number;
    title: string;
    url: string;
    headSha: string;
    runtimeId: string;
    role: "reviewer" | "validator";
    status: "dispatched" | "failed" | "already_reviewed" | "draft_skipped";
    workspaceId?: string;
    reason?: string;
    at: string;
};

type ReviewAgentsBoard = {
    running: boolean;
    intervalMs: number;
    maxDispatchesPerScan: number;
    includeDrafts: boolean;
    launchProfile: {
        repoPath: string;
        spaceId: string;
        projectId: string;
        runtimeId: string;
    } | null;
    reviewerRuntimeIds: string[];
    github: { wired: boolean };
    conductor: { wired: boolean };
    delivery: "human";
    autoMerge: false;
    persistence: { wired: boolean; durable: boolean; reason?: string };
    lastScan: {
        status: "ok" | "degraded";
        reason?: string;
        open: number;
        dispatched: number;
        failed: number;
        skipped: number;
        at: string;
    } | null;
    entries: ReviewEntry[];
};

type ReviewControl = "start" | "pause" | "scan" | "configure";
type ReviewEvent = "comment" | "approve" | "request_changes";

type FindingAgreement = {
    key: string;
    file: string;
    line: number;
    defectKey: string;
    symbol?: string;
    severity: string;
    message: string;
    evidence: string[];
    reviewers: { workspaceId: string; runtimeId: string }[];
    reviewerCount: number;
    totalReviewers: number;
    agreementRatio: number;
    lifecycle: "new" | "persisting" | "fixed";
    previousAgreement?: {
        key: string;
        reviewerCount: number;
        totalReviewers: number;
        reviewers: { workspaceId: string; runtimeId: string }[];
    };
    githubThread?: {
        id: string;
        state: "open" | "resolved" | "outdated";
        url?: string;
        resolvedBy?: string;
    };
    feedback?: "accepted" | "dismissed";
    validation?: {
        key: string;
        verdict: "confirmed" | "rejected" | "uncertain";
        rationale: string;
        evidence: string;
    };
};

type FindingFix = {
    findingKey: string;
    workspaceId: string;
    runtimeId?: string;
    state?: string;
    headSha: string;
    createdAt?: string;
};

type ImpactFile = {
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

type ImpactConsumer = {
    repoId: string;
    path: string;
    ecosystem: "npm" | "python" | "go" | "cargo";
    packageName: string;
    importSpecifier: string;
};

type ImpactContext = {
    available: boolean;
    reason?: string;
    source: "recodergit";
    scope: "symbol" | "file" | "mixed" | "unavailable";
    risk: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    partial: boolean;
    changedSymbols: string[];
    files: ImpactFile[];
    processes: { id?: string; label: string; processType?: string; filePath?: string }[];
    consumers: ImpactConsumer[];
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

type ReviewEvidence = {
    reportedReviewers: number;
    totalReviewers: number;
    findings: FindingAgreement[];
    summary: string;
    headSha?: string;
    previousHeadSha?: string;
    fixedEvidenceComplete: boolean;
    threadSync?: {
        available: boolean;
        matched: number;
        total: number;
        reason?: string;
    };
    suppressedFindings: FindingAgreement[];
    feedbackStore?: { available: boolean; durable: boolean; reason?: string };
    feedbackStats?: {
        accepted: number;
        dismissed: number;
        total: number;
        dismissalRate: number;
        basis: "active_rules" | "decision_history";
        activeAccepted: number;
        activeDismissed: number;
        startedAt?: string;
        updatedAt?: string;
        coverage?: "since_metrics_enabled" | "migrated_active_rules";
    };
    findingFixes: FindingFix[];
    findingFixesUnavailable?: string;
    impact?: ImpactContext;
    validator?: {
        status: "waiting" | "not_needed" | "running" | "reported" | "unavailable";
        workspaceId?: string;
        runtimeId?: string;
        summary?: string;
        validatedCount?: number;
        totalFindings?: number;
        intent?: {
            verdict: "aligned" | "partial" | "misaligned" | "unknown";
            rationale: string;
            unmetRequirements: string[];
            outOfScopeChanges: string[];
        };
        requirements: { number: number; title: string; state: "OPEN" | "CLOSED"; url: string }[];
        unavailableRequirements: { number: number; reason: string }[];
        beadsRequirements: { id: string; title: string; status?: string }[];
        unavailableBeadsRequirements: { id: string; reason: string }[];
        jiraRequirements: {
            key: string;
            title: string;
            description: string;
            status: string;
            url: string;
            labels: string[];
            issueType?: string;
            priority?: string;
        }[];
        unavailableJiraRequirements: { key: string; reason: string }[];
        rules: {
            id: string;
            level: "required" | "advisory";
            text: string;
            source: string;
            check?: string;
            assessment?: {
                id: string;
                verdict: "pass" | "fail" | "unknown";
                rationale: string;
                evidence: string;
                basis?: "validator" | "named_check";
                checkName?: string;
                checkStatus?: "pass" | "fail" | "error" | "missing" | "ambiguous" | "unavailable" | "running";
                checkAutofix?: boolean;
            };
        }[];
        rulesUnavailable?: { source?: string; reason: string };
    };
};

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value == "object" ? value as Record<string, unknown> : null;
}

function reviewRuleAssessmentBasis(value: unknown): "validator" | "named_check" | undefined {
    if (value === "validator") return "validator";
    if (value === "named_check") return "named_check";
    return undefined;
}

function reviewRuleCheckStatus(value: unknown): "pass" | "fail" | "error" | "missing" | "ambiguous" | "unavailable" | "running" | undefined {
    if (value === "pass" || value === "fail" || value === "error" || value === "missing" || value === "ambiguous" || value === "unavailable" || value === "running") return value;
    return undefined;
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item == "string") : [];
}

function count(value: unknown, fallback: number): number {
    return typeof value == "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : fallback;
}

function parseImpact(value: unknown): ImpactContext | undefined {
    const row = record(value);
    const risk = row?.risk;
    if (
        !row ||
        typeof row.available != "boolean" ||
        row.source != "recodergit" ||
        (risk != "UNKNOWN" && risk != "LOW" && risk != "MEDIUM" && risk != "HIGH" && risk != "CRITICAL") ||
        typeof row.partial != "boolean"
    ) return undefined;
    const normalizedRisk = risk as ImpactContext["risk"];
    const rawScope = typeof row.scope == "string" ? row.scope : "symbol";
    const normalizedScope: ImpactContext["scope"] =
        rawScope == "file" || rawScope == "mixed" || rawScope == "unavailable" ? rawScope : "symbol";
    const files = Array.isArray(row.files) ? row.files.flatMap((value): ImpactFile[] => {
        const file = record(value);
        if (!file || typeof file.path != "string" || typeof file.minDepth != "number") return [];
        const coChangeRow = record(file.coChange);
        const coChange = coChangeRow &&
            typeof coChangeRow.commits == "number" && Number.isInteger(coChangeRow.commits) && coChangeRow.commits > 0 &&
            typeof coChangeRow.confidence == "number" && Number.isFinite(coChangeRow.confidence) &&
            coChangeRow.confidence >= 0 && coChangeRow.confidence <= 1
            ? { commits: coChangeRow.commits, confidence: coChangeRow.confidence }
            : null;
        return [{
            path: file.path,
            isTest: file.isTest === true,
            minDepth: file.minDepth,
            directions: strings(file.directions).filter((item): item is ImpactFile["directions"][number] => item == "upstream" || item == "downstream"),
            changedSymbols: strings(file.changedSymbols),
            symbols: strings(file.symbols),
            relationTypes: strings(file.relationTypes),
            processes: strings(file.processes),
            ...(coChange ? { coChange } : {}),
        }];
    }) : [];
    const processes = Array.isArray(row.processes) ? row.processes.flatMap((value): ImpactContext["processes"] => {
        const process = record(value);
        if (!process || typeof process.label != "string") return [];
        return [{
            label: process.label,
            ...(typeof process.id == "string" ? { id: process.id } : {}),
            ...(typeof process.processType == "string" ? { processType: process.processType } : {}),
            ...(typeof process.filePath == "string" ? { filePath: process.filePath } : {}),
        }];
    }) : [];
    const consumers = Array.isArray(row.consumers) ? row.consumers.flatMap((value): ImpactConsumer[] => {
        const consumer = record(value);
        const ecosystem = consumer?.ecosystem;
        if (
            !consumer || typeof consumer.repoId != "string" || typeof consumer.path != "string" ||
            typeof consumer.packageName != "string" || typeof consumer.importSpecifier != "string" ||
            (ecosystem != "npm" && ecosystem != "python" && ecosystem != "go" && ecosystem != "cargo")
        ) return [];
        return [{
            repoId: consumer.repoId,
            path: consumer.path,
            ecosystem: ecosystem as ImpactConsumer["ecosystem"],
            packageName: consumer.packageName,
            importSpecifier: consumer.importSpecifier,
        }];
    }) : [];
    const rawSummary = record(row.summary) ?? {};
    return {
        available: row.available,
        ...(typeof row.reason == "string" ? { reason: row.reason } : {}),
        source: "recodergit",
        scope: normalizedScope,
        risk: normalizedRisk,
        partial: row.partial,
        changedSymbols: strings(row.changedSymbols),
        files,
        processes,
        consumers,
        summary: {
            impactedFiles: count(rawSummary.impactedFiles, files.length),
            affectedTests: count(rawSummary.affectedTests, files.filter((file) => file.isTest).length),
            upstreamFiles: count(rawSummary.upstreamFiles, files.filter((file) => file.directions.includes("upstream")).length),
            downstreamFiles: count(rawSummary.downstreamFiles, files.filter((file) => file.directions.includes("downstream")).length),
            affectedProcesses: count(rawSummary.affectedProcesses, processes.length),
            coChangedFiles: count(rawSummary.coChangedFiles, files.filter((file) => file.coChange != null).length),
            crossRepositoryFiles: count(rawSummary.crossRepositoryFiles, consumers.length),
            consumerRepositories: count(rawSummary.consumerRepositories, new Set(consumers.map((item) => item.repoId)).size),
        },
    };
}

function parseBoard(value: unknown): ReviewAgentsBoard | null {
    const row = record(value);
    if (!row) return null;
    const profile = record(row.launchProfile);
    const github = record(row.github);
    const conductor = record(row.conductor);
    const scan = record(row.lastScan);
    const persistence = record(row.persistence);
    const entries = Array.isArray(row.entries)
        ? row.entries.flatMap((value): ReviewEntry[] => {
              const entry = record(value);
              const status = entry?.status;
              if (
                  !entry ||
                  typeof entry.key != "string" ||
                  typeof entry.number != "number" ||
                  typeof entry.title != "string" ||
                  typeof entry.url != "string" ||
                  typeof entry.headSha != "string" ||
                  typeof entry.runtimeId != "string" ||
                  (status != "dispatched" && status != "failed" && status != "already_reviewed" && status != "draft_skipped")
              ) return [];
              return [{
                  key: entry.key,
                  number: entry.number,
                  title: entry.title,
                  url: entry.url,
                  headSha: entry.headSha,
                  runtimeId: entry.runtimeId,
                  role: entry.role == "validator" ? "validator" : "reviewer",
                  status: status as ReviewEntry["status"],
                  ...(typeof entry.workspaceId == "string" ? { workspaceId: entry.workspaceId } : {}),
                  ...(typeof entry.reason == "string" ? { reason: entry.reason } : {}),
                  at: typeof entry.at == "string" ? entry.at : "",
              }];
          })
        : [];
    return {
        running: row.running === true,
        intervalMs: typeof row.intervalMs == "number" ? row.intervalMs : 0,
        maxDispatchesPerScan: typeof row.maxDispatchesPerScan == "number" ? row.maxDispatchesPerScan : 0,
        includeDrafts: row.includeDrafts === true,
        launchProfile:
            profile &&
            typeof profile.repoPath == "string" &&
            typeof profile.spaceId == "string" &&
            typeof profile.projectId == "string" &&
            typeof profile.runtimeId == "string"
                ? {
                      repoPath: profile.repoPath,
                      spaceId: profile.spaceId,
                      projectId: profile.projectId,
                      runtimeId: profile.runtimeId,
                  }
                : null,
        reviewerRuntimeIds: Array.isArray(row.reviewerRuntimeIds)
            ? row.reviewerRuntimeIds.filter((value): value is string => typeof value == "string")
            : [],
        github: { wired: github?.wired === true },
        conductor: { wired: conductor?.wired === true },
        delivery: "human",
        autoMerge: false,
        persistence: {
            wired: persistence?.wired === true,
            durable: persistence?.durable === true,
            ...(typeof persistence?.reason == "string" ? { reason: persistence.reason } : {}),
        },
        lastScan: scan
            ? {
                  status: scan.status == "ok" ? "ok" : "degraded",
                  ...(typeof scan.reason == "string" ? { reason: scan.reason } : {}),
                  open: typeof scan.open == "number" ? scan.open : 0,
                  dispatched: typeof scan.dispatched == "number" ? scan.dispatched : 0,
                  failed: typeof scan.failed == "number" ? scan.failed : 0,
                  skipped: typeof scan.skipped == "number" ? scan.skipped : 0,
                  at: typeof scan.at == "string" ? scan.at : "",
              }
            : null,
        entries,
    };
}

function parseEvidence(value: unknown): ReviewEvidence | null {
    const row = record(value);
    const findingRows = Array.isArray(row?.lifecycleFindings)
        ? row.lifecycleFindings
        : Array.isArray(row?.findings) ? row.findings : null;
    if (!row || !findingRows) return null;
    const parseRows = (rows: unknown[]): FindingAgreement[] => rows.flatMap((value): FindingAgreement[] => {
        const finding = record(value);
        if (
            !finding ||
            typeof finding.key != "string" ||
            typeof finding.file != "string" ||
            typeof finding.line != "number" ||
            typeof finding.defectKey != "string" ||
            typeof finding.message != "string" ||
            typeof finding.reviewerCount != "number" ||
            typeof finding.totalReviewers != "number"
        ) return [];
        const reviewers = Array.isArray(finding.reviewers)
            ? finding.reviewers.flatMap((value): { workspaceId: string; runtimeId: string }[] => {
                  const reviewer = record(value);
                  return reviewer && typeof reviewer.workspaceId == "string" && typeof reviewer.runtimeId == "string"
                      ? [{ workspaceId: reviewer.workspaceId, runtimeId: reviewer.runtimeId }]
                      : [];
              })
            : [];
        const previous = record(finding.previousAgreement);
        const githubThread = record(finding.githubThread);
        const validation = record(finding.validation);
        const validationVerdict: NonNullable<FindingAgreement["validation"]>["verdict"] | null =
            validation?.verdict == "confirmed" ? "confirmed" :
                validation?.verdict == "rejected" ? "rejected" :
                    validation?.verdict == "uncertain" ? "uncertain" : null;
        const githubThreadState: NonNullable<FindingAgreement["githubThread"]>["state"] | null =
            githubThread?.state == "open" ? "open" :
                githubThread?.state == "resolved" ? "resolved" :
                    githubThread?.state == "outdated" ? "outdated" : null;
        const feedback: FindingAgreement["feedback"] = finding.feedback == "accepted"
            ? "accepted"
            : finding.feedback == "dismissed" ? "dismissed" : undefined;
        const previousReviewers = Array.isArray(previous?.reviewers)
            ? previous.reviewers.flatMap((value): { workspaceId: string; runtimeId: string }[] => {
                  const reviewer = record(value);
                  return reviewer && typeof reviewer.workspaceId == "string" && typeof reviewer.runtimeId == "string"
                      ? [{ workspaceId: reviewer.workspaceId, runtimeId: reviewer.runtimeId }]
                      : [];
              })
            : [];
        const lifecycle: FindingAgreement["lifecycle"] = finding.lifecycle == "persisting"
            ? "persisting"
            : finding.lifecycle == "fixed" ? "fixed" : "new";
        return [{
            key: finding.key,
            file: finding.file,
            line: finding.line,
            defectKey: finding.defectKey,
            ...(typeof finding.symbol == "string" ? { symbol: finding.symbol } : {}),
            severity: typeof finding.severity == "string" ? finding.severity : "info",
            message: finding.message,
            evidence: Array.isArray(finding.evidence) ? finding.evidence.filter((item): item is string => typeof item == "string") : [],
            reviewers,
            reviewerCount: finding.reviewerCount,
            totalReviewers: finding.totalReviewers,
            agreementRatio: typeof finding.agreementRatio == "number" ? finding.agreementRatio : 0,
            lifecycle,
            ...(previous && typeof previous.key == "string" && typeof previous.reviewerCount == "number" && typeof previous.totalReviewers == "number"
                ? { previousAgreement: {
                      key: previous.key,
                      reviewerCount: previous.reviewerCount,
                      totalReviewers: previous.totalReviewers,
                      reviewers: previousReviewers,
                  } }
                : {}),
            ...(githubThread && typeof githubThread.id == "string" && githubThreadState
                ? { githubThread: {
                      id: githubThread.id,
                      state: githubThreadState,
                      ...(typeof githubThread.url == "string" ? { url: githubThread.url } : {}),
                      ...(typeof githubThread.resolvedBy == "string" ? { resolvedBy: githubThread.resolvedBy } : {}),
                  } }
                : {}),
            ...(feedback ? { feedback } : {}),
            ...(validation && validationVerdict && typeof validation.key == "string" &&
                typeof validation.rationale == "string" && typeof validation.evidence == "string"
                ? { validation: {
                      key: validation.key,
                      verdict: validationVerdict,
                      rationale: validation.rationale,
                      evidence: validation.evidence,
                  } }
                : {}),
        }];
    });
    const findings = parseRows(findingRows);
    const suppressedFindings = parseRows(Array.isArray(row.suppressedFindings) ? row.suppressedFindings : []);
    const threadSync = record(row.threadSync);
    const feedbackStore = record(row.feedbackStore);
    const feedbackStatsRow = record(row.feedbackStats);
    const feedbackBasis = feedbackStatsRow?.basis == "active_rules" ? "active_rules" as const :
        feedbackStatsRow?.basis == "decision_history" ? "decision_history" as const : null;
    const feedbackCoverage = feedbackStatsRow?.coverage == "since_metrics_enabled" ? "since_metrics_enabled" as const :
        feedbackStatsRow?.coverage == "migrated_active_rules" ? "migrated_active_rules" as const : undefined;
    const feedbackStats = feedbackStatsRow && feedbackBasis &&
        typeof feedbackStatsRow.accepted == "number" && typeof feedbackStatsRow.dismissed == "number" &&
        typeof feedbackStatsRow.total == "number" && typeof feedbackStatsRow.dismissalRate == "number" &&
        typeof feedbackStatsRow.activeAccepted == "number" && typeof feedbackStatsRow.activeDismissed == "number"
        ? {
              accepted: count(feedbackStatsRow.accepted, 0),
              dismissed: count(feedbackStatsRow.dismissed, 0),
              total: count(feedbackStatsRow.total, 0),
              dismissalRate: Math.max(0, Math.min(1, feedbackStatsRow.dismissalRate)),
              basis: feedbackBasis,
              activeAccepted: count(feedbackStatsRow.activeAccepted, 0),
              activeDismissed: count(feedbackStatsRow.activeDismissed, 0),
              ...(typeof feedbackStatsRow.startedAt == "string" ? { startedAt: feedbackStatsRow.startedAt } : {}),
              ...(typeof feedbackStatsRow.updatedAt == "string" ? { updatedAt: feedbackStatsRow.updatedAt } : {}),
              ...(feedbackCoverage ? { coverage: feedbackCoverage } : {}),
          }
        : undefined;
    const impact = parseImpact(row.impact);
    const validator = record(row.validator);
    const intent = record(validator?.intent);
    const intentVerdict: NonNullable<NonNullable<ReviewEvidence["validator"]>["intent"]>["verdict"] | null =
        intent?.verdict == "aligned" ? "aligned" :
            intent?.verdict == "partial" ? "partial" :
                intent?.verdict == "misaligned" ? "misaligned" :
                    intent?.verdict == "unknown" ? "unknown" : null;
    const validatorStatus: NonNullable<ReviewEvidence["validator"]>["status"] | null =
        validator?.status == "waiting" ? "waiting" :
            validator?.status == "not_needed" ? "not_needed" :
                validator?.status == "running" ? "running" :
                    validator?.status == "reported" ? "reported" :
                        validator?.status == "unavailable" ? "unavailable" : null;
    const requirements = Array.isArray(validator?.requirements)
        ? validator.requirements.flatMap((value): NonNullable<ReviewEvidence["validator"]>["requirements"] => {
              const requirement = record(value);
              const state = requirement?.state == "OPEN" ? "OPEN" : requirement?.state == "CLOSED" ? "CLOSED" : null;
              return requirement && typeof requirement.number == "number" && typeof requirement.title == "string" &&
                  state && typeof requirement.url == "string"
                  ? [{ number: requirement.number, title: requirement.title, state, url: requirement.url }]
                  : [];
          })
        : [];
    const unavailableRequirements = Array.isArray(validator?.unavailableRequirements)
        ? validator.unavailableRequirements.flatMap((value): NonNullable<ReviewEvidence["validator"]>["unavailableRequirements"] => {
              const requirement = record(value);
              return requirement && typeof requirement.number == "number" && typeof requirement.reason == "string"
                  ? [{ number: requirement.number, reason: requirement.reason }]
                  : [];
          })
        : [];
    const beadsRequirements = Array.isArray(validator?.beadsRequirements)
        ? validator.beadsRequirements.flatMap((value): NonNullable<ReviewEvidence["validator"]>["beadsRequirements"] => {
              const requirement = record(value);
              return requirement && typeof requirement.id == "string" && typeof requirement.title == "string"
                  ? [{ id: requirement.id, title: requirement.title,
                      ...(typeof requirement.status == "string" ? { status: requirement.status } : {}) }]
                  : [];
          })
        : [];
    const unavailableBeadsRequirements = Array.isArray(validator?.unavailableBeadsRequirements)
        ? validator.unavailableBeadsRequirements.flatMap((value): NonNullable<ReviewEvidence["validator"]>["unavailableBeadsRequirements"] => {
              const requirement = record(value);
              return requirement && typeof requirement.id == "string" && typeof requirement.reason == "string"
                  ? [{ id: requirement.id, reason: requirement.reason }]
                  : [];
          })
        : [];
    const jiraRequirements = Array.isArray(validator?.jiraRequirements)
        ? validator.jiraRequirements.flatMap((value): NonNullable<ReviewEvidence["validator"]>["jiraRequirements"] => {
              const requirement = record(value);
              if (!requirement || typeof requirement.key != "string" || typeof requirement.title != "string" ||
                  typeof requirement.description != "string" || typeof requirement.status != "string" || typeof requirement.url != "string") return [];
              return [{
                  key: requirement.key,
                  title: requirement.title,
                  description: requirement.description,
                  status: requirement.status,
                  url: requirement.url,
                  labels: strings(requirement.labels),
                  ...(typeof requirement.issueType == "string" ? { issueType: requirement.issueType } : {}),
                  ...(typeof requirement.priority == "string" ? { priority: requirement.priority } : {}),
              }];
          })
        : [];
    const unavailableJiraRequirements = Array.isArray(validator?.unavailableJiraRequirements)
        ? validator.unavailableJiraRequirements.flatMap((value): NonNullable<ReviewEvidence["validator"]>["unavailableJiraRequirements"] => {
              const requirement = record(value);
              return requirement && typeof requirement.key == "string" && typeof requirement.reason == "string"
                  ? [{ key: requirement.key, reason: requirement.reason }]
                  : [];
          })
        : [];
    const rules = Array.isArray(validator?.rules)
        ? validator.rules.flatMap((value): NonNullable<ReviewEvidence["validator"]>["rules"] => {
              const rule = record(value);
              const assessment = record(rule?.assessment);
              const verdict = assessment?.verdict == "pass" ? "pass" : assessment?.verdict == "fail" ? "fail" : assessment?.verdict == "unknown" ? "unknown" : null;
              const basis = reviewRuleAssessmentBasis(assessment?.basis);
              const checkStatus = reviewRuleCheckStatus(assessment?.checkStatus);
              const level = rule?.level == "required" ? "required" : rule?.level == "advisory" ? "advisory" : null;
              if (!rule || typeof rule.id != "string" || !level ||
                  typeof rule.text != "string" || typeof rule.source != "string") return [];
              return [{
                  id: rule.id,
                  level,
                  text: rule.text,
                  source: rule.source,
                  ...(typeof rule.check == "string" && rule.check.trim() ? { check: rule.check.trim() } : {}),
                  ...(assessment && verdict && typeof assessment.id == "string" && typeof assessment.rationale == "string" && typeof assessment.evidence == "string"
                      ? { assessment: {
                            id: assessment.id,
                            verdict,
                            rationale: assessment.rationale,
                            evidence: assessment.evidence,
                            ...(basis ? { basis } : {}),
                            ...(typeof assessment.checkName == "string" ? { checkName: assessment.checkName } : {}),
                            ...(checkStatus ? { checkStatus } : {}),
                            ...(assessment.checkAutofix === true ? { checkAutofix: true } : {}),
                        } }
                      : {}),
              }];
          })
        : [];
    const rulesUnavailableRow = record(validator?.rulesUnavailable);
    const rulesUnavailable = rulesUnavailableRow && typeof rulesUnavailableRow.reason == "string"
        ? {
              ...(typeof rulesUnavailableRow.source == "string" ? { source: rulesUnavailableRow.source } : {}),
              reason: rulesUnavailableRow.reason,
          }
        : undefined;
    const findingFixes = Array.isArray(row.findingFixes)
        ? row.findingFixes.flatMap((value): FindingFix[] => {
              const fix = record(value);
              if (!fix || typeof fix.findingKey != "string" || typeof fix.workspaceId != "string" || typeof fix.headSha != "string") return [];
              return [{
                  findingKey: fix.findingKey,
                  workspaceId: fix.workspaceId,
                  ...(typeof fix.runtimeId == "string" ? { runtimeId: fix.runtimeId } : {}),
                  ...(typeof fix.state == "string" ? { state: fix.state } : {}),
                  headSha: fix.headSha,
                  ...(typeof fix.createdAt == "string" ? { createdAt: fix.createdAt } : {}),
              }];
          })
        : [];
    return {
        reportedReviewers: typeof row.reportedReviewers == "number" ? row.reportedReviewers : 0,
        totalReviewers: typeof row.totalReviewers == "number" ? row.totalReviewers : 0,
        findings,
        suppressedFindings,
        summary: typeof row.summary == "string" ? row.summary : "",
        ...(typeof row.headSha == "string" ? { headSha: row.headSha } : {}),
        ...(typeof row.previousHeadSha == "string" ? { previousHeadSha: row.previousHeadSha } : {}),
        fixedEvidenceComplete: row.fixedEvidenceComplete === true,
        findingFixes,
        ...(impact ? { impact } : {}),
        ...(typeof row.findingFixesUnavailable == "string" ? { findingFixesUnavailable: row.findingFixesUnavailable } : {}),
        ...(threadSync && typeof threadSync.matched == "number" && typeof threadSync.total == "number"
            ? { threadSync: {
                  available: threadSync.available === true,
                  matched: threadSync.matched,
                  total: threadSync.total,
                  ...(typeof threadSync.reason == "string" ? { reason: threadSync.reason } : {}),
            } }
            : {}),
        ...(feedbackStore
            ? { feedbackStore: {
                  available: feedbackStore.available === true,
                  durable: feedbackStore.durable === true,
                  ...(typeof feedbackStore.reason == "string" ? { reason: feedbackStore.reason } : {}),
              } }
            : {}),
        ...(feedbackStats ? { feedbackStats } : {}),
        ...(validator && validatorStatus
            ? { validator: {
                  status: validatorStatus,
                  ...(typeof validator.workspaceId == "string" ? { workspaceId: validator.workspaceId } : {}),
                  ...(typeof validator.runtimeId == "string" ? { runtimeId: validator.runtimeId } : {}),
                  ...(typeof validator.summary == "string" ? { summary: validator.summary } : {}),
                  ...(typeof validator.validatedCount == "number" ? { validatedCount: validator.validatedCount } : {}),
                  ...(typeof validator.totalFindings == "number" ? { totalFindings: validator.totalFindings } : {}),
                  requirements,
                  unavailableRequirements,
                  beadsRequirements,
                  unavailableBeadsRequirements,
                  jiraRequirements,
                  unavailableJiraRequirements,
                  rules,
                  ...(rulesUnavailable ? { rulesUnavailable } : {}),
                  ...(intent && intentVerdict && typeof intent.rationale == "string"
                      ? { intent: {
                            verdict: intentVerdict,
                            rationale: intent.rationale,
                            unmetRequirements: Array.isArray(intent.unmetRequirements)
                                ? intent.unmetRequirements.filter((item): item is string => typeof item == "string")
                                : [],
                            outOfScopeChanges: Array.isArray(intent.outOfScopeChanges)
                                ? intent.outOfScopeChanges.filter((item): item is string => typeof item == "string")
                                : [],
                        } }
                      : {}),
              } }
            : {}),
    };
}

function reviewBodyFromEvidence(evidence: ReviewEvidence | undefined): string {
    if (!evidence) return "";
    const impact = evidence.impact;
    const impactBlock = impact
        ? impact.available
            ? [
                  `Cross-file impact (RecoderGit ${impact.scope} graph): ${impact.risk.toLowerCase()} risk${impact.partial ? " · partial graph" : ""} · ${impact.summary.impactedFiles} files · ${impact.summary.affectedTests} affected tests · ${impact.summary.affectedProcesses} processes`,
                  ...impact.files.slice(0, 12).map((file) => {
                      const direction = file.coChange
                          ? `changed together in ${file.coChange.commits} commits (${Math.round(file.coChange.confidence * 100)}% confidence)`
                          : file.directions.includes("upstream") && file.directions.includes("downstream")
                          ? "upstream + downstream"
                          : file.directions.join(" + ") || "reached";
                      return `- ${direction}: ${file.path}${file.isTest ? " (test)" : ""} · depth ${file.minDepth}${file.symbols.length > 0 ? ` · ${file.symbols.slice(0, 3).join(", ")}` : ""}`;
                  }),
                  ...impact.consumers.slice(0, 12).map((consumer) =>
                      `- cross-repository consumer: ${consumer.repoId} · ${consumer.path} imports ${consumer.packageName}`),
                  ...(impact.reason ? [`- Graph limitation: ${impact.reason}`] : []),
              ].join("\n")
            : `Cross-file impact unavailable (RecoderGit): ${impact.reason ?? "the repository graph did not return a reading"}`
        : "";
    const intent = evidence.validator?.intent;
    const intentBlock = intent ? [
        `Intent assessment: ${intent.verdict} — ${intent.rationale}`,
        ...(evidence.validator?.requirements ?? []).map((requirement) => `- Requirement source: #${requirement.number} ${requirement.title} (${requirement.state.toLowerCase()}) ${requirement.url}`),
        ...(evidence.validator?.unavailableRequirements ?? []).map((requirement) => `- Requirement source unavailable: #${requirement.number} — ${requirement.reason}`),
        ...(evidence.validator?.beadsRequirements ?? []).map((requirement) => `- Beads requirement: ${requirement.id} ${requirement.title}${requirement.status ? ` (${requirement.status})` : ""}`),
        ...(evidence.validator?.unavailableBeadsRequirements ?? []).map((requirement) => `- Beads requirement unavailable: ${requirement.id} — ${requirement.reason}`),
        ...(evidence.validator?.jiraRequirements ?? []).map((requirement) => `- Jira requirement: ${requirement.key} ${requirement.title} (${requirement.status}) ${requirement.url}`),
        ...(evidence.validator?.unavailableJiraRequirements ?? []).map((requirement) => `- Jira requirement unavailable: ${requirement.key} — ${requirement.reason}`),
        ...intent.unmetRequirements.map((item) => `- Unmet requirement: ${item}`),
        ...intent.outOfScopeChanges.map((item) => `- Out-of-scope change: ${item}`),
    ].join("\n") : "";
    const ruleBlock = evidence.validator?.rules.length || evidence.validator?.rulesUnavailable
        ? [
              "Repository review rules:",
              ...(evidence.validator?.rules ?? []).map((rule) => rule.assessment
                  ? `- [${rule.level}] ${rule.id}: ${rule.assessment.verdict}${rule.assessment.basis == "named_check" ? ` (check: ${rule.assessment.checkName ?? rule.check ?? "unknown"})` : ""} — ${rule.assessment.rationale}\n  Evidence: ${rule.assessment.evidence}`
                  : `- [${rule.level}] ${rule.id}: not assessed — ${rule.text}`),
              ...(evidence.validator?.rulesUnavailable
                  ? [`- Rules unavailable${evidence.validator.rulesUnavailable.source ? ` (${evidence.validator.rulesUnavailable.source})` : ""}: ${evidence.validator.rulesUnavailable.reason}`]
                  : []),
          ].join("\n")
        : "";
    const currentFindings = evidence.findings.filter((finding) => finding.lifecycle != "fixed");
    if (currentFindings.length == 0) {
        const reviewSummary = evidence.reportedReviewers == evidence.totalReviewers
            ? `Reviewed by ${evidence.totalReviewers} independent agent${evidence.totalReviewers == 1 ? "" : "s"}; no evidence-backed findings.`
            : "";
        return [impactBlock, intentBlock, ruleBlock, reviewSummary].filter(Boolean).join("\n\n");
    }
    const findingBlock = currentFindings.map((finding) => {
        const sources = finding.reviewers.map((reviewer) => reviewer.runtimeId).join(", ");
        const validation = finding.validation
            ? `\n  Validator: ${finding.validation.verdict} — ${finding.validation.rationale}\n  Validator evidence: ${finding.validation.evidence}`
            : "";
        return `- [${finding.severity}] ${finding.file}:${finding.line} — ${finding.message}\n  Evidence: ${finding.evidence[0] ?? ""}\n  Agreement: ${finding.reviewerCount}/${finding.totalReviewers} (${sources})${validation}`;
    }).join("\n\n");
    return [impactBlock, intentBlock, ruleBlock, findingBlock].filter(Boolean).join("\n\n");
}

function inlineBodyFromFinding(finding: FindingAgreement): string {
    return [
        finding.message,
        "",
        `Evidence: ${finding.evidence[0] ?? ""}`,
        "",
        `Independent reviewer agreement: ${finding.reviewerCount}/${finding.totalReviewers} (${finding.reviewers.map((reviewer) => reviewer.runtimeId).join(", ")})`,
        ...(finding.validation ? [
            "",
            `Independent validator: ${finding.validation.verdict} — ${finding.validation.rationale}`,
            `Validator evidence: ${finding.validation.evidence}`,
        ] : []),
    ].join("\n");
}

function impactDirection(file: ImpactFile): string {
    if (file.coChange) return `↔ history ${Math.round(file.coChange.confidence * 100)}%`;
    const upstream = file.directions.includes("upstream");
    const downstream = file.directions.includes("downstream");
    return upstream && downstream ? "↕ both" : upstream ? "↑ callers" : downstream ? "↓ deps" : "· reached";
}

function ImpactLedger({ impact }: { impact: ImpactContext }) {
    const riskAttention = impact.risk == "HIGH" || impact.risk == "CRITICAL" || impact.partial || !impact.available;
    return (
        <section className="border border-white/8 text-xs" aria-label="RecoderGit cross-file impact">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/8 px-2 py-1 uppercase tracking-[0.08em]">
                <span className="text-primary">cross-file impact</span>
                <span className="text-secondary">recodergit · {impact.scope == "file" ? "file imports" : impact.scope == "mixed" ? "mixed graph" : impact.scope == "symbol" ? "symbol calls" : "no graph"}</span>
                <span className={riskAttention ? "text-accent" : "text-secondary"}>{impact.available ? `${impact.risk.toLowerCase()} risk` : "unavailable"}</span>
                {impact.partial && <span className="border border-white/15 px-1 text-accent">partial</span>}
                <span className="ml-auto text-secondary tabular-nums">
                    {impact.summary.upstreamFiles} callers · {impact.summary.downstreamFiles} deps · {impact.summary.coChangedFiles} history · {impact.summary.consumerRepositories} consumer repos · {impact.summary.affectedTests} tests
                </span>
            </div>
            {!impact.available ? (
                <div className="grid grid-cols-1 gap-2 px-2 py-2 md:grid-cols-[minmax(140px,0.35fr)_minmax(0,1fr)]">
                    <div>
                        <div className="mb-1 uppercase tracking-[0.08em] text-secondary">changed symbols</div>
                        <div className="flex flex-wrap gap-1">
                            {impact.changedSymbols.length > 0
                                ? impact.changedSymbols.slice(0, 12).map((symbol) => <span key={symbol} className="border border-white/8 px-1 text-primary">{symbol}</span>)
                                : <span className="text-secondary">none extracted</span>}
                        </div>
                    </div>
                    <div className="border-l border-white/10 pl-2 text-secondary">
                        {impact.reason ?? "The repository graph did not return a reading."}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-[minmax(150px,0.34fr)_minmax(0,1fr)]">
                    <div className="border-b border-white/8 px-2 py-2 md:border-b-0 md:border-r">
                        <div className="mb-1 uppercase tracking-[0.08em] text-secondary">changed symbols</div>
                        <div className="flex flex-wrap gap-1">
                            {impact.changedSymbols.slice(0, 12).map((symbol) => (
                                <span key={symbol} className="border border-white/8 px-1 text-primary">{symbol}</span>
                            ))}
                        </div>
                        {impact.processes.length > 0 && (
                            <div className="mt-2">
                                <div className="mb-1 uppercase tracking-[0.08em] text-secondary">process paths</div>
                                {impact.processes.slice(0, 5).map((process) => (
                                    <div key={process.id ?? process.label} className="truncate text-secondary" title={`${process.label}${process.processType ? ` · ${process.processType}` : ""}`}>
                                        · {process.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="grid grid-cols-[76px_34px_minmax(0,1fr)] gap-2 border-b border-white/8 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-secondary">
                            <span>direction</span><span>depth</span><span>reached file / symbol</span>
                        </div>
                        {impact.files.slice(0, 12).map((file) => (
                            <div key={file.path} className="grid grid-cols-[76px_34px_minmax(0,1fr)] gap-2 border-b border-white/8 px-2 py-1 last:border-b-0">
                                <span className={file.isTest ? "text-accent" : "text-secondary"}>{impactDirection(file)}</span>
                                <span className="text-secondary tabular-nums">{file.minDepth}</span>
                                <div className="min-w-0">
                                    <div className="truncate text-primary" title={file.path}>{file.isTest ? "TEST · " : ""}{file.path}</div>
                                    {(file.symbols.length > 0 || file.processes.length > 0 || file.coChange) && (
                                        <div className="truncate text-[10px] text-secondary" title={[...file.symbols, ...file.processes].join(" · ")}>
                                            {file.coChange ? `changed together ${file.coChange.commits}× · ${Math.round(file.coChange.confidence * 100)}% · ` : ""}{file.symbols.slice(0, 3).join(" · ")}{file.processes.length > 0 ? ` · process: ${file.processes.slice(0, 2).join(", ")}` : ""}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {impact.files.length == 0 && <div className="px-2 py-2 text-secondary">No cross-file nodes were reached within the bounded graph query.</div>}
                        {impact.files.length > 12 && <div className="border-t border-white/8 px-2 py-1 text-[10px] text-secondary">+{impact.files.length - 12} more bounded graph files in the review draft</div>}
                    </div>
                </div>
            )}
            {impact.available && impact.consumers.length > 0 && (
                <div className="border-t border-white/8 px-2 py-1.5 text-[10px] text-secondary">
                    <div className="mb-1 uppercase tracking-[0.08em]">cross-repository consumers</div>
                    {impact.consumers.slice(0, 8).map((consumer) => (
                        <div key={`${consumer.repoId}:${consumer.path}:${consumer.packageName}`} className="truncate font-mono" title={`${consumer.importSpecifier} → ${consumer.packageName}`}>
                            {consumer.repoId} · {consumer.path} · imports {consumer.packageName}
                        </div>
                    ))}
                </div>
            )}
            {impact.partial && impact.reason && <div className="border-t border-white/8 px-2 py-1 text-[10px] text-secondary">partial graph · {impact.reason}</div>}
        </section>
    );
}

function FindingHeadline({ entry, finding }: { entry: ReviewEntry; finding: FindingAgreement }) {
    const sourceUrl = githubFindingSourceUrl({
        prUrl: entry.url,
        headSha: entry.headSha,
        file: finding.file,
        line: finding.line,
    });
    const label = `${finding.file}:${finding.line}${finding.symbol ? ` · ${finding.symbol}` : ""} · ${finding.message}`;
    return sourceUrl ? (
        <button
            className="block w-full truncate text-left text-primary hover:text-accent hover:underline"
            title={`Open ${finding.file}:${finding.line} at reviewed head ${entry.headSha.slice(0, 12)}`}
            onClick={() => getApi().openExternal(sourceUrl)}
        >
            {label}
        </button>
    ) : <div className="truncate text-primary">{label}</div>;
}

function persistedReviewEntry(workspace: RecoderWorkspace): ReviewEntry | null {
    const metadata = workspace.metadata;
    if (metadata?.prReviewAgent !== true) return null;
    if (metadata.prReviewRole == "fixer") return null;
    const number = typeof metadata.prNumber == "number" ? metadata.prNumber : null;
    const url = typeof metadata.prUrl == "string" ? metadata.prUrl : "";
    const headSha = typeof metadata.prHeadSha == "string" ? metadata.prHeadSha : "";
    const backgroundTitle = typeof metadata.backgroundIssueTitle == "string" ? metadata.backgroundIssueTitle : "";
    const runtimeId = typeof metadata.backgroundRuntimeId == "string" ? metadata.backgroundRuntimeId : "";
    const role: ReviewEntry["role"] = metadata.prReviewRole == "validator" ? "validator" : "reviewer";
    if (number === null || url == "" || headSha == "" || runtimeId == "") return null;
    const title = backgroundTitle.replace(/^(?:Review|Validate findings for) PR #\d+:\s*/, "") || `Pull request #${number}`;
    return {
        key: `${workspace.workspaceId}:${headSha}`,
        number,
        title,
        url,
        headSha,
        runtimeId,
        role,
        status: "dispatched",
        workspaceId: workspace.workspaceId,
        at: workspace.updatedAt ?? workspace.createdAt ?? "",
    };
}

function phase(workspace: RecoderWorkspace | undefined): "running" | "ready" | "done" {
    if (!workspace) return "done";
    if (workspace.state == "queued" || workspace.state == "running") return "running";
    if (workspace.state == "awaiting_review" || workspace.attention == "awaiting_approval") return "ready";
    return "done";
}

function findingFixPhase(fix: FindingFix): "running" | "ready" | "done" | "failed" {
    if (fix.state == "failed" || fix.state == "cancelled") return "failed";
    if (fix.state == "awaiting_review") return "ready";
    if (fix.state == "queued" || fix.state == "created" || fix.state == "setting_up" || fix.state == "ready" || fix.state == "running") return "running";
    return "done";
}

function FindingFixAction({
    fix,
    busy,
    unavailable,
    onStart,
    onOpenSession,
    onOpenReview,
}: {
    fix?: FindingFix;
    busy: boolean;
    unavailable?: string;
    onStart: () => void;
    onOpenSession: (workspaceId: string) => void;
    onOpenReview: (workspaceId: string) => void;
}) {
    if (unavailable) {
        return <span className="whitespace-nowrap text-[10px] uppercase text-secondary" title={unavailable}>fix unavailable</span>;
    }
    if (!fix) {
        return <button className={QUIET_BTN_XS} disabled={busy} onClick={onStart}>{busy ? "Starting…" : "Fix"}</button>;
    }
    const fixPhase = findingFixPhase(fix);
    if (fixPhase == "failed") {
        return <button className={QUIET_BTN_XS} disabled={busy} onClick={onStart}>{busy ? "Retrying…" : "Retry fix"}</button>;
    }
    if (fixPhase == "running") {
        return <button className={QUIET_BTN_XS} onClick={() => onOpenSession(fix.workspaceId)}>Fix running</button>;
    }
    return (
        <button
            className={fixPhase == "ready" ? PRIMARY_BTN : QUIET_BTN_XS}
            onClick={() => onOpenReview(fix.workspaceId)}
        >
            {fixPhase == "ready" ? "Compare fix" : "View fix"}
        </button>
    );
}

function cadence(intervalMs: number): string {
    if (intervalMs > 0 && intervalMs % 60_000 == 0) return `${intervalMs / 60_000}m`;
    return `${Math.max(1, Math.round(intervalMs / 1_000))}s`;
}

export function RecoderPullRequestReviewAgents({
    workspaces,
    repoPath,
    repoReady,
    projectId,
    runtimeId,
    reviewerRuntimeIds,
    onOpenSession,
    onOpenReview,
}: {
    workspaces: RecoderWorkspace[];
    repoPath: string;
    repoReady: boolean;
    projectId: string;
    runtimeId: string;
    reviewerRuntimeIds: string[];
    onOpenSession: (workspaceId: string) => void;
    onOpenReview: (workspaceId: string) => void;
}) {
    const [board, setBoard] = useState<ReviewAgentsBoard | null>(null);
    const [busy, setBusy] = useState<ReviewControl | null>(null);
    const [error, setError] = useState("");
    const [publishEntry, setPublishEntry] = useState<ReviewEntry | null>(null);
    const [reviewEvent, setReviewEvent] = useState<ReviewEvent>("comment");
    const [reviewBody, setReviewBody] = useState("");
    const [publishStatus, setPublishStatus] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [evidenceByCohort, setEvidenceByCohort] = useState<Record<string, ReviewEvidence>>({});
    const [inlineKeys, setInlineKeys] = useState<string[]>([]);
    const [inlineBodies, setInlineBodies] = useState<Record<string, string>>({});
    const [feedbackBusy, setFeedbackBusy] = useState("");
    const [fixBusy, setFixBusy] = useState("");
    const [ruleFixBusy, setRuleFixBusy] = useState("");
    const [showSuppressed, setShowSuppressed] = useState<string[]>([]);

    const refresh = async () => {
        try {
            const response = await fetch(`${getRecoderBackendUrl()}/api/agent-os/pr-review-agents`);
            const body = await response.json();
            if (!response.ok) throw new Error(readErrorReason(body) || "Pull-request review agents are unavailable.");
            setBoard(parseBoard(record(body)?.data));
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Pull-request review agents are unavailable.");
        }
    };

    useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), 15_000);
        return () => clearInterval(timer);
    }, []);

    const selectedReady = repoReady && repoPath.trim() != "" && projectId.trim() != "" && runtimeId.trim() != "";
    const control = async (action: ReviewControl, includeDrafts = board?.includeDrafts ?? false) => {
        const pinned = board?.launchProfile ?? null;
        if (action != "pause" && !selectedReady && pinned == null) {
            setError("Choose a Git repository and installed agent before watching pull requests.");
            return;
        }
        setBusy(action);
        try {
            const profile = {
                repoPath: repoPath.trim(),
                spaceId: "default",
                projectId: projectId.trim(),
                runtimeId: runtimeId.trim(),
            };
            const selectedProfile = selectedReady ? profile : null;
            const response = await fetch(`${getRecoderBackendUrl()}/api/agent-os/pr-review-agents/control`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(buildPrReviewControlBody({
                    action,
                    includeDrafts,
                    pinnedProfile: pinned,
                    selectedProfile,
                    reviewerRuntimeIds: reviewerRuntimeIds.length > 0 ? reviewerRuntimeIds : [runtimeId.trim()].filter(Boolean),
                })),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(readErrorReason(body) || `Could not ${action} pull-request reviews.`);
            await refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : `Could not ${action} pull-request reviews.`);
        } finally {
            setBusy(null);
        }
    };

    const byWorkspace = useMemo(
        () => new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace])),
        [workspaces]
    );
    const entries = useMemo(() => {
        const live = board?.entries ?? [];
        const workspaceIds = new Set(live.flatMap((entry) => entry.workspaceId ? [entry.workspaceId] : []));
        const persisted = workspaces.flatMap((workspace): ReviewEntry[] => {
            if (workspaceIds.has(workspace.workspaceId)) return [];
            const entry = persistedReviewEntry(workspace);
            return entry ? [entry] : [];
        });
        return [...live, ...persisted]
            .filter((entry) => entry.status != "draft_skipped")
            .sort((a, b) => b.at.localeCompare(a.at));
    }, [board?.entries, workspaces]);
    const evidenceAnchors = useMemo(() => {
        const seen = new Set<string>();
        return entries.flatMap((entry) => {
            const cohortKey = `${entry.number}:${entry.headSha}`;
            if (seen.has(cohortKey) || !entry.workspaceId) return [];
            seen.add(cohortKey);
            return [{ cohortKey, workspaceId: entry.workspaceId }];
        });
    }, [entries]);
    const loadEvidenceFor = async (cohortKey: string, workspaceId: string) => {
        const response = await fetch(
            `${getRecoderBackendUrl()}/api/agent-os/pr-review-agents/workspaces/${encodeURIComponent(workspaceId)}/findings`
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) return;
        const evidence = parseEvidence(record(record(body)?.data)?.findings);
        if (evidence) setEvidenceByCohort((current) => ({ ...current, [cohortKey]: evidence }));
    };
    useEffect(() => {
        let cancelled = false;
        const load = () => Promise.all(evidenceAnchors.map(async ({ cohortKey, workspaceId }) => {
                if (!cancelled) await loadEvidenceFor(cohortKey, workspaceId);
            }));
        void load();
        const timer = setInterval(() => void load(), 15_000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [evidenceAnchors.map((anchor) => `${anchor.cohortKey}:${anchor.workspaceId}`).join("|")]);
    const canRun = selectedReady || board?.launchProfile != null;
    const publishEvidence = publishEntry
        ? evidenceByCohort[`${publishEntry.number}:${publishEntry.headSha}`]
        : undefined;
    const reviewRecommendation = recommendPrReviewEvent(publishEvidence);
    const inlineCandidates = publishEvidence?.findings.filter((finding) => finding.lifecycle != "fixed") ?? [];
    const recordFindingFeedback = async (
        entry: ReviewEntry,
        finding: FindingAgreement,
        disposition: "accepted" | "dismissed" | "clear",
    ) => {
        if (!entry.workspaceId) return;
        const cohortKey = `${entry.number}:${entry.headSha}`;
        setFeedbackBusy(finding.key);
        try {
            const response = await fetch(
                `${getRecoderBackendUrl()}/api/agent-os/pr-review-agents/workspaces/${encodeURIComponent(entry.workspaceId)}/findings/feedback`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ findingKey: finding.key, disposition }),
                }
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(readErrorReason(body) || "Could not save finding feedback.");
            await loadEvidenceFor(cohortKey, entry.workspaceId);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save finding feedback.");
        } finally {
            setFeedbackBusy("");
        }
    };
    const startFindingFix = async (entry: ReviewEntry, finding: FindingAgreement) => {
        if (!entry.workspaceId) return;
        const cohortKey = `${entry.number}:${entry.headSha}`;
        setFixBusy(finding.key);
        try {
            const selectedRuntimeId = runtimeId.trim() || board?.launchProfile?.runtimeId || entry.runtimeId;
            const response = await fetch(
                `${getRecoderBackendUrl()}/api/agent-os/pr-review-agents/workspaces/${encodeURIComponent(entry.workspaceId)}/findings/fix`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ findingKey: finding.key, runtimeId: selectedRuntimeId }),
                }
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(readErrorReason(body) || "Could not start the finding fix.");
            const fix = record(record(record(body)?.data)?.fix);
            if ((fix?.status != "dispatched" && fix?.status != "existing") || typeof fix.workspaceId != "string") {
                throw new Error(typeof fix?.reason == "string" ? fix.reason : "The finding fix was not started.");
            }
            await loadEvidenceFor(cohortKey, entry.workspaceId);
            setError("");
            onOpenSession(fix.workspaceId);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not start the finding fix.");
        } finally {
            setFixBusy("");
        }
    };
    const startRuleCheckFix = async (
        entry: ReviewEntry,
        rule: NonNullable<ReviewEvidence["validator"]>["rules"][number],
    ) => {
        const workspaceId = evidenceByCohort[`${entry.number}:${entry.headSha}`]?.validator?.workspaceId;
        const checkName = rule.assessment?.checkName ?? rule.check;
        if (!workspaceId || !checkName || rule.assessment?.checkAutofix !== true) return;
        const cohortKey = `${entry.number}:${entry.headSha}`;
        setRuleFixBusy(rule.id);
        try {
            const response = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checks/remediate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ checkName }),
                }
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(readErrorReason(body) || "Could not start named-check remediation.");
            await loadEvidenceFor(cohortKey, entry.workspaceId ?? workspaceId);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not start named-check remediation.");
        } finally {
            setRuleFixBusy("");
        }
    };
    const publishReview = async () => {
        if (!publishEntry?.workspaceId || reviewBody.trim() == "") return;
        setPublishing(true);
        setPublishStatus("");
        try {
            const response = await fetch(
                `${getRecoderBackendUrl()}/api/agent-os/pr-review-agents/workspaces/${encodeURIComponent(publishEntry.workspaceId)}/publish`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        event: reviewEvent,
                        body: reviewBody,
                        inlineFindings: inlineKeys.map((key) => ({ key, body: inlineBodies[key] ?? "" })),
                    }),
                }
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(readErrorReason(body) || "Could not publish the review.");
            const publication = record(record(body)?.data)?.publication;
            const result = record(publication);
            if (result?.status == "published") {
                const inlineCount = typeof result.inlineCount == "number" ? result.inlineCount : inlineKeys.length;
                setPublishStatus(`Published to GitHub${inlineCount > 0 ? ` with ${inlineCount} inline comment${inlineCount == 1 ? "" : "s"}` : ""}.`);
            } else if (result?.status == "needs_approval") {
                const approval = typeof result.approvalId == "string" ? ` Approval ${result.approvalId} is pending.` : "";
                setPublishStatus(`${typeof result.reason == "string" ? result.reason : "Approval required."}${approval} Approve it, then retry.`);
            } else {
                setPublishStatus(typeof result?.reason == "string" ? result.reason : "The review was not published.");
            }
        } catch (cause) {
            setPublishStatus(cause instanceof Error ? cause.message : "Could not publish the review.");
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="mt-2 flex flex-col gap-2 border-t border-white/8 pt-2 font-mono">
            <div className="flex flex-wrap items-center gap-2">
                <span className={FIELD_LABEL}>Pull request reviews</span>
                <span className={META}>
                    {board?.running ? `Watching every ${cadence(board.intervalMs)}` : "Paused"}
                </span>
                {board && (
                    <span className={META} title={board.persistence.reason}>
                        {board.persistence.durable ? "resumes after restart" : "this session only"}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        className={QUIET_BTN_XS}
                        disabled={busy != null || board == null || !canRun}
                        onClick={() => void control("scan")}
                    >
                        {busy == "scan" ? "Scanning…" : "Scan PRs"}
                    </button>
                    {board?.running ? (
                        <button className={QUIET_BTN} disabled={busy != null} onClick={() => void control("pause")}>
                            {busy == "pause" ? "Pausing…" : "Pause PR watch"}
                        </button>
                    ) : (
                        <button
                            className={PRIMARY_BTN}
                            disabled={busy != null || board == null || !canRun}
                            onClick={() => void control("start")}
                        >
                            {busy == "start" ? "Starting…" : "Watch open PRs"}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] border border-white/8 bg-black text-xs">
                <div className="min-w-0 border-r border-white/8 px-2 py-1.5">
                    <div className="truncate text-primary" title={board?.launchProfile?.repoPath ?? repoPath}>
                        {board?.launchProfile?.repoPath || repoPath || "Choose a repository"}
                    </div>
                    <div className="text-secondary">
                        {board?.launchProfile
                            ? `${board.launchProfile.projectId} · ${board.reviewerRuntimeIds.join(" + ") || board.launchProfile.runtimeId}`
                            : selectedReady
                              ? `${projectId} · ${(reviewerRuntimeIds.length > 0 ? reviewerRuntimeIds : [runtimeId]).join(" + ")} (selected)`
                              : "No review target pinned"}
                    </div>
                </div>
                <div className="flex items-center px-2 text-accent">Human posts to GitHub</div>
            </div>

            <label className="flex items-center gap-2 text-xs text-secondary">
                <input
                    type="checkbox"
                    checked={board?.includeDrafts ?? false}
                    disabled={busy != null || board == null}
                    onChange={(event) => void control("configure", event.target.checked)}
                />
                Review draft pull requests
            </label>

            {error != "" && <div className="border-l-2 border-white/25 bg-white/[0.04] px-2 py-1 text-sm text-secondary">{error}</div>}
            {!error && board?.lastScan?.status == "degraded" && (
                <div className="border-l-2 border-white/25 bg-white/[0.04] px-2 py-1 text-sm text-secondary">
                    {board.lastScan.reason ?? "The last pull-request scan was degraded."}
                </div>
            )}
            {!error && board?.persistence.reason && (
                <div className="border-l-2 border-white/25 bg-white/[0.04] px-2 py-1 text-sm text-secondary">
                    Pull-request watcher settings could not be saved: {board.persistence.reason}
                </div>
            )}

            {entries.length > 0 && (
                <div className="flex flex-col border border-white/8">
                    {entries.slice(0, 8).map((entry) => {
                        const cohortKey = `${entry.number}:${entry.headSha}`;
                        const evidence = evidenceByCohort[cohortKey];
                        const firstInCohort = entries.findIndex((candidate) => `${candidate.number}:${candidate.headSha}` == cohortKey) == entries.indexOf(entry);
                        const workspace = entry.workspaceId ? byWorkspace.get(entry.workspaceId) : undefined;
                        const workspacePhase = phase(workspace);
                        const label = entry.status == "failed"
                            ? "Failed"
                            : workspacePhase == "running"
                              ? entry.role == "validator" ? "Validating" : "Reviewing"
                              : workspacePhase == "ready"
                                ? entry.role == "validator" ? "Validation ready" : "Ready to read"
                                : entry.role == "validator" ? "Validated" : "Reviewed";
                        const suppressedVisible = showSuppressed.includes(cohortKey);
                        const findingRows = [
                            ...(evidence?.findings ?? []),
                            ...(suppressedVisible ? (evidence?.suppressedFindings ?? []) : []),
                        ];
                        return (
                            <div key={entry.key} className="flex flex-wrap items-center gap-2 border-b border-white/8 px-2 py-1.5 last:border-b-0">
                                <span className={`${STATE_CHIP} font-mono`}>{label}</span>
                                <div className="min-w-0 flex-1">
                                    <div className={`${ROW_TITLE} truncate`}>#{entry.number} {entry.title}</div>
                                    <div className={`${META} truncate`} title={entry.reason}>
                                        {entry.role} · {entry.runtimeId} · {entry.headSha.slice(0, 12)}{entry.reason ? ` · ${entry.reason}` : ""}
                                    </div>
                                </div>
                                {entry.workspaceId && (
                                    <button className={workspacePhase == "ready" ? PRIMARY_BTN : QUIET_BTN} onClick={() => onOpenSession(entry.workspaceId!)}>
                                        {workspacePhase == "running" ? "Open" : entry.role == "validator" ? "Read validation" : "Read review"}
                                    </button>
                                )}
                                {entry.workspaceId && workspacePhase != "running" && (
                                    <button
                                        className={QUIET_BTN_XS}
                                        onClick={() => {
                                            const evidence = evidenceByCohort[`${entry.number}:${entry.headSha}`];
                                            const current = evidence?.findings.filter((finding) => finding.lifecycle != "fixed") ?? [];
                                            setPublishEntry(entry);
                                            setReviewEvent(recommendPrReviewEvent(evidence).event);
                                            setReviewBody(reviewBodyFromEvidence(evidence));
                                            setInlineKeys([]);
                                            setInlineBodies(Object.fromEntries(current.map((finding) => [finding.key, inlineBodyFromFinding(finding)])));
                                            setPublishStatus("");
                                        }}
                                    >
                                        Publish…
                                    </button>
                                )}
                                <button className={QUIET_BTN_XS} onClick={() => getApi().openExternal(entry.url)}>Open PR</button>
                                {firstInCohort && evidence && (
                                    <div className="flex w-full flex-col gap-1.5 border-t border-white/8 pt-1.5">
                                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-secondary">
                                            <span className="text-accent">{evidence.reportedReviewers}/{evidence.totalReviewers} reviewers reported</span>
                                            <span>{evidence.findings.filter((finding) => finding.lifecycle != "fixed").length} current finding cluster{evidence.findings.filter((finding) => finding.lifecycle != "fixed").length == 1 ? "" : "s"}</span>
                                            {evidence.validator && (
                                                <span title={evidence.validator.summary}>
                                                    validator {evidence.validator.status.replace("_", " ")}
                                                    {evidence.validator.runtimeId ? ` · ${evidence.validator.runtimeId}` : ""}
                                                    {typeof evidence.validator.validatedCount == "number" && typeof evidence.validator.totalFindings == "number"
                                                        ? ` · ${evidence.validator.validatedCount}/${evidence.validator.totalFindings}`
                                                        : ""}
                                                </span>
                                            )}
                                            {evidence.threadSync?.available && <span>GitHub threads {evidence.threadSync.matched}/{evidence.threadSync.total}</span>}
                                            {evidence.feedbackStats && evidence.feedbackStats.total > 0 && (
                                                <span title={evidence.feedbackStats.basis == "decision_history"
                                                    ? `${evidence.feedbackStats.total} recorded decisions · ${evidence.feedbackStats.activeAccepted} active accepted rules · ${evidence.feedbackStats.activeDismissed} active dismissed rules${evidence.feedbackStats.startedAt ? ` · since ${evidence.feedbackStats.startedAt}` : ""}`
                                                    : `Active learned rules · ${evidence.feedbackStats.accepted} accepted · ${evidence.feedbackStats.dismissed} dismissed`}>
                                                    {evidence.feedbackStats.basis == "decision_history" ? "feedback history" : "signal profile"} · {Math.round(evidence.feedbackStats.dismissalRate * 100)}% dismissed
                                                </span>
                                            )}
                                            {evidence.suppressedFindings.length > 0 && (
                                                <button
                                                    className="uppercase text-secondary"
                                                    onClick={() => setShowSuppressed((current) => current.includes(cohortKey)
                                                        ? current.filter((key) => key != cohortKey)
                                                        : [...current, cohortKey])}
                                                >
                                                    {suppressedVisible ? "Hide" : "Show"} {evidence.suppressedFindings.length} dismissed
                                                </button>
                                            )}
                                            <span className="ml-auto">File · symbol · defect class</span>
                                        </div>
                                        {evidence.impact && <ImpactLedger impact={evidence.impact} />}
                                        {evidence.validator && (evidence.validator.requirements.length > 0 || evidence.validator.unavailableRequirements.length > 0 || evidence.validator.beadsRequirements.length > 0 || evidence.validator.unavailableBeadsRequirements.length > 0 || evidence.validator.jiraRequirements.length > 0 || evidence.validator.unavailableJiraRequirements.length > 0) && (
                                            <div className="flex flex-wrap items-center gap-1 border border-white/8 px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-secondary">
                                                <span className="mr-1">requirements</span>
                                                {evidence.validator.requirements.map((requirement) => (
                                                    <button
                                                        key={requirement.url}
                                                        className="border border-white/8 px-1.5 py-0.5 hover:border-white/20 hover:text-accent"
                                                        title={requirement.title}
                                                        onClick={() => getApi().openExternal(requirement.url)}
                                                    >
                                                        #{requirement.number} · {requirement.state.toLowerCase()}
                                                    </button>
                                                ))}
                                                {evidence.validator.unavailableRequirements.map((requirement) => (
                                                    <span key={`unavailable:${requirement.number}`} className="border border-white/8 px-1.5 py-0.5" title={requirement.reason}>
                                                        #{requirement.number} · unavailable
                                                    </span>
                                                ))}
                                                {evidence.validator.beadsRequirements.map((requirement) => (
                                                    <span key={`beads:${requirement.id}`} className="border border-white/8 px-1.5 py-0.5" title={requirement.title}>
                                                        bd:{requirement.id} · {requirement.status?.toLowerCase() ?? "linked"}
                                                    </span>
                                                ))}
                                                {evidence.validator.unavailableBeadsRequirements.map((requirement) => (
                                                    <span key={`beads-unavailable:${requirement.id}`} className="border border-white/8 px-1.5 py-0.5" title={requirement.reason}>
                                                        bd:{requirement.id} · unavailable
                                                    </span>
                                                ))}
                                                {evidence.validator.jiraRequirements.map((requirement) => (
                                                    <button
                                                        key={`jira:${requirement.key}`}
                                                        className="border border-white/8 px-1.5 py-0.5 hover:border-white/20 hover:text-accent"
                                                        title={`${requirement.title}\n${requirement.description}`}
                                                        onClick={() => getApi().openExternal(requirement.url)}
                                                    >
                                                        jira:{requirement.key} · {requirement.status.toLowerCase()}
                                                    </button>
                                                ))}
                                                {evidence.validator.unavailableJiraRequirements.map((requirement) => (
                                                    <span key={`jira-unavailable:${requirement.key}`} className="border border-white/8 px-1.5 py-0.5" title={requirement.reason}>
                                                        jira:{requirement.key} · unavailable
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {evidence.validator && (evidence.validator.rules.length > 0 || evidence.validator.rulesUnavailable) && (
                                            <div className="flex flex-col border border-white/8 text-xs">
                                                <div className="flex items-center justify-between border-b border-white/8 px-2 py-1 uppercase tracking-[0.08em] text-secondary">
                                                    <span>repository rules</span>
                                                    <span>{evidence.validator.rules[0]?.source ?? evidence.validator.rulesUnavailable?.source ?? "unavailable"}</span>
                                                </div>
                                                {evidence.validator.rules.slice(0, 8).map((rule) => (
                                                    <div key={rule.id} className="grid grid-cols-[72px_96px_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/8 px-2 py-1 last:border-b-0">
                                                        <span className="uppercase text-secondary">{rule.level}</span>
                                                        <span className={`uppercase ${rule.assessment?.verdict == "fail" ? "text-accent" : "text-secondary"}`}>
                                                            {rule.assessment?.verdict ?? "waiting"}{rule.assessment?.basis == "named_check" ? " · check" : ""}
                                                        </span>
                                                        <span className="min-w-0 truncate text-primary" title={rule.assessment ? `${rule.text}\n${rule.check ? `Named check: ${rule.check}\n` : ""}${rule.assessment.rationale}\n${rule.assessment.evidence}` : rule.text}>
                                                            {rule.id} · {rule.assessment?.rationale ?? rule.text}
                                                        </span>
                                                        {rule.assessment?.basis == "named_check" && rule.assessment.checkAutofix &&
                                                            (rule.assessment.checkStatus == "fail" || rule.assessment.checkStatus == "running") && (
                                                            <button
                                                                className={rule.assessment.checkStatus == "running" ? QUIET_BTN_XS : PRIMARY_BTN}
                                                                disabled={ruleFixBusy == rule.id || rule.assessment.checkStatus == "running"}
                                                                onClick={() => void startRuleCheckFix(entry, rule)}
                                                            >
                                                                {rule.assessment.checkStatus == "running" || ruleFixBusy == rule.id ? "Fixing…" : "Ask agent to fix"}
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {evidence.validator.rulesUnavailable && (
                                                    <div className="px-2 py-1 text-secondary" title={evidence.validator.rulesUnavailable.reason}>
                                                        rules unavailable · {evidence.validator.rulesUnavailable.reason}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {evidence.validator?.intent && (
                                            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 border border-white/8 px-2 py-1.5 text-xs">
                                                <div className={`uppercase tracking-[0.08em] ${evidence.validator.intent.verdict == "partial" || evidence.validator.intent.verdict == "misaligned" ? "text-accent" : "text-secondary"}`}>
                                                    intent {evidence.validator.intent.verdict}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-primary">{evidence.validator.intent.rationale}</div>
                                                    {evidence.validator.intent.unmetRequirements.slice(0, 3).map((item) => (
                                                        <div key={`unmet:${item}`} className="truncate text-secondary" title={item}>unmet · {item}</div>
                                                    ))}
                                                    {evidence.validator.intent.outOfScopeChanges.slice(0, 3).map((item) => (
                                                        <div key={`scope:${item}`} className="truncate text-secondary" title={item}>out of scope · {item}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {evidence.previousHeadSha && (
                                            <div className="grid grid-cols-3 border border-white/8 text-[11px] uppercase tracking-[0.08em] tabular-nums">
                                                {(["new", "persisting", "fixed"] as const).map((lifecycle) => {
                                                    const count = evidence.findings.filter((finding) => finding.lifecycle == lifecycle).length;
                                                    return (
                                                        <div key={lifecycle} className="flex items-center justify-between border-r border-white/8 px-2 py-1 last:border-r-0">
                                                            <span className={lifecycle == "persisting" ? "text-accent" : "text-secondary"}>{lifecycle}</span>
                                                            <span className="text-primary">{count}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {findingRows.slice(0, 8).map((finding) => {
                                            const findingFix = evidence.findingFixes.find((fix) => fix.findingKey == finding.key);
                                            return (
                                            <div key={`${finding.lifecycle}:${finding.key}`} className="grid grid-cols-[76px_54px_72px_minmax(0,1fr)_auto_auto] gap-2 border-l border-white/15 pl-2 text-xs">
                                                <span className={finding.lifecycle == "persisting" ? "uppercase text-accent" : "uppercase text-secondary"}>{finding.lifecycle}</span>
                                                <span className="uppercase text-secondary">{finding.severity}</span>
                                                {finding.githubThread?.url ? (
                                                    <button
                                                        className={`truncate text-left uppercase ${finding.githubThread.state == "open" ? "text-accent" : "text-secondary"}`}
                                                        title={finding.githubThread.resolvedBy ? `${finding.githubThread.state} by ${finding.githubThread.resolvedBy}` : finding.githubThread.state}
                                                        onClick={() => getApi().openExternal(finding.githubThread!.url!)}
                                                    >
                                                        {finding.githubThread.state}
                                                    </button>
                                                ) : (
                                                    <span className="uppercase text-secondary">not linked</span>
                                                )}
                                                <div className="min-w-0">
                                                    <FindingHeadline entry={entry} finding={finding} />
                                                    <div className="truncate text-secondary" title={finding.evidence.join("\n")}>{finding.evidence[0]}</div>
                                                    {finding.validation && (
                                                        <div
                                                            className={`truncate ${finding.validation.verdict == "confirmed" ? "text-accent" : "text-secondary"}`}
                                                            title={`${finding.validation.rationale}\n${finding.validation.evidence}`}
                                                        >
                                                            validator {finding.validation.verdict} · {finding.validation.rationale}
                                                        </div>
                                                    )}
                                                    {findingFix && (
                                                        <div
                                                            className={`truncate border-l pl-1.5 text-[10px] uppercase tracking-[0.08em] ${findingFixPhase(findingFix) == "ready" ? "border-accent text-accent" : "border-white/15 text-secondary"}`}
                                                            title={`Fix workspace ${findingFix.workspaceId} · ${findingFix.runtimeId ?? "runtime unavailable"} · ${findingFix.state ?? "state unavailable"} · ${findingFix.headSha}`}
                                                        >
                                                            fix handoff · {findingFix.runtimeId ?? "unknown runtime"} · {findingFix.state?.replace("_", " ") ?? "unknown"} · {findingFix.headSha.slice(0, 12)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-accent">
                                                        {finding.lifecycle == "fixed" && finding.previousAgreement
                                                            ? `${finding.previousAgreement.reviewerCount}/${finding.previousAgreement.totalReviewers} before`
                                                            : `${finding.reviewerCount}/${finding.totalReviewers}`}
                                                    </div>
                                                    <div
                                                        className="max-w-40 truncate text-[10px] text-secondary"
                                                        title={(finding.lifecycle == "fixed" ? finding.previousAgreement?.reviewers : finding.reviewers)?.map((reviewer) => reviewer.runtimeId).join(", ")}
                                                    >
                                                        {(finding.lifecycle == "fixed" ? finding.previousAgreement?.reviewers : finding.reviewers)?.map((reviewer) => reviewer.runtimeId).join(" · ")}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {finding.lifecycle != "fixed" && finding.feedback != "dismissed" && (
                                                        <FindingFixAction
                                                            fix={findingFix}
                                                            busy={fixBusy == finding.key}
                                                            unavailable={evidence.findingFixesUnavailable}
                                                            onStart={() => void startFindingFix(entry, finding)}
                                                            onOpenSession={onOpenSession}
                                                            onOpenReview={onOpenReview}
                                                        />
                                                    )}
                                                    {finding.feedback == "dismissed" ? (
                                                        <button
                                                            className={QUIET_BTN_XS}
                                                            disabled={feedbackBusy == finding.key}
                                                            onClick={() => void recordFindingFeedback(entry, finding, "clear")}
                                                        >
                                                            Restore
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                className={finding.feedback == "accepted" ? PRIMARY_BTN : QUIET_BTN_XS}
                                                                disabled={feedbackBusy == finding.key || finding.lifecycle == "fixed"}
                                                                onClick={() => void recordFindingFeedback(entry, finding, finding.feedback == "accepted" ? "clear" : "accepted")}
                                                            >
                                                                {finding.feedback == "accepted" ? "Accepted" : "Accept"}
                                                            </button>
                                                            <button
                                                                className={QUIET_BTN_XS}
                                                                disabled={feedbackBusy == finding.key || finding.lifecycle == "fixed"}
                                                                onClick={() => void recordFindingFeedback(entry, finding, "dismissed")}
                                                            >
                                                                Dismiss
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            );
                                        })}
                                        {evidence.previousHeadSha && !evidence.fixedEvidenceComplete && (
                                            <div className={META}>Fixed findings stay hidden until every reviewer on this revision reports.</div>
                                        )}
                                        {evidence.threadSync && !evidence.threadSync.available && (
                                            <div className={META} title={evidence.threadSync.reason}>GitHub thread state unavailable.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {board && entries.length == 0 && (
                <div className={META}>No pull-request revisions reviewed yet. Each new head SHA is reviewed once.</div>
            )}

            {publishEntry && (
                <div className="fixed inset-0 z-[var(--zindex-typeahead-modal)]">
                    <div className="absolute inset-0 bg-black/60" onClick={() => !publishing && setPublishEntry(null)} />
                    <div className="absolute left-1/2 top-[12%] flex w-[620px] max-w-[92vw] -translate-x-1/2 flex-col gap-3 border border-white/15 bg-black p-4 font-mono">
                        <div className="flex items-start gap-3 border-b border-white/8 pb-3">
                            <div className="min-w-0 flex-1">
                                <div className={ROW_TITLE}>Publish review for PR #{publishEntry.number}</div>
                                <div className={`${META} truncate`}>{publishEntry.title} · {publishEntry.headSha.slice(0, 12)}</div>
                            </div>
                            <button className={QUIET_BTN_XS} disabled={publishing} onClick={() => setPublishEntry(null)}>Close</button>
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className={FIELD_LABEL}>GitHub review</span>
                            <select
                                className={INPUT}
                                value={reviewEvent}
                                disabled={publishing}
                                onChange={(event) => setReviewEvent(event.target.value as ReviewEvent)}
                            >
                                <option value="comment">Comment</option>
                                <option value="approve">Approve</option>
                                <option value="request_changes">Request changes</option>
                            </select>
                            <span className={META}>
                                Recoder suggestion: {reviewRecommendation.event.replace("_", " ")} · {reviewRecommendation.reason} You own the final choice.
                            </span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className={FIELD_LABEL}>Review body</span>
                            <textarea
                                className={`${INPUT} min-h-48 resize-y`}
                                value={reviewBody}
                                maxLength={40_000}
                                disabled={publishing}
                                placeholder="Paste or edit the findings you reviewed in Session."
                                onChange={(event) => setReviewBody(event.target.value)}
                            />
                        </label>
                        {inlineCandidates.length > 0 && (
                            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto border border-white/8 p-2">
                                <div className="flex items-center justify-between border-b border-white/8 pb-1">
                                    <span className={FIELD_LABEL}>Inline comments</span>
                                    <span className={META}>{inlineKeys.length}/{inlineCandidates.length} selected</span>
                                </div>
                                {inlineCandidates.map((finding) => {
                                    const selected = inlineKeys.includes(finding.key);
                                    return (
                                        <div key={finding.key} className="flex flex-col gap-1 border-b border-white/8 py-1.5 last:border-b-0">
                                            <label className="flex cursor-pointer items-start gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={selected}
                                                    disabled={publishing}
                                                    onChange={(event) => setInlineKeys((current) => event.target.checked
                                                        ? [...current, finding.key]
                                                        : current.filter((key) => key != finding.key))}
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-primary">{finding.file}:{finding.line} · {finding.message}</span>
                                                    <span className="block text-secondary">{finding.lifecycle} · {finding.reviewerCount}/{finding.totalReviewers} reviewers</span>
                                                </span>
                                            </label>
                                            {selected && (
                                                <textarea
                                                    className={`${INPUT} ml-5 min-h-24 resize-y text-xs`}
                                                    value={inlineBodies[finding.key] ?? ""}
                                                    maxLength={10_000}
                                                    disabled={publishing}
                                                    onChange={(event) => setInlineBodies((current) => ({ ...current, [finding.key]: event.target.value }))}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className={META}>Nothing is posted until you confirm. Repository and PR target come from the canonical workspace.</div>
                        {publishStatus != "" && <div className="border-l-2 border-accent/60 px-2 text-sm text-secondary">{publishStatus}</div>}
                        <div className="flex items-center gap-2">
                            <button className={PRIMARY_BTN} disabled={publishing || reviewBody.trim() == ""} onClick={() => void publishReview()}>
                                {publishing ? "Publishing…" : inlineKeys.length > 0 ? `Publish review + ${inlineKeys.length} inline` : "Publish to GitHub"}
                            </button>
                            <button className={QUIET_BTN} disabled={publishing} onClick={() => getApi().openExternal(publishEntry.url)}>Open PR</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

RecoderPullRequestReviewAgents.displayName = "RecoderPullRequestReviewAgents";
