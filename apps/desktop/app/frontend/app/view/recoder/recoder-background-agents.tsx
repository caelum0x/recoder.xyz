// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from "react";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";
import type { RecoderWorkspace } from "./recoder-model";
import { RecoderPullRequestReviewAgents } from "./recoder-pr-review-agents";
import { FIELD_LABEL, META, PRIMARY_BTN, QUIET_BTN, QUIET_BTN_XS, ROW_TITLE, STATE_CHIP } from "./recoder-styles";

type AutopilotEntry = {
    issueId: string;
    title: string;
    status: "dispatched" | "existing" | "failed" | "skipped";
    workspaceId?: string;
    routedAgentId?: string;
    reason?: string;
    at: string;
};

type StaleIssue = {
    id: string;
    title: string;
    status?: string;
};

type KillSwitchState = {
    tripped: boolean;
    reason?: string;
    at?: string;
};

type AutopilotView = {
    running: boolean;
    intervalMs: number;
    maxDispatchesPerTick: number;
    launchProfile: {
        repoPath: string;
        spaceId: string;
        projectId: string;
        runtimeId: string;
    } | null;
    reviewOwner: "human";
    persistence: { wired: boolean; durable: boolean; reason?: string };
    beads: { wired: boolean; status?: string; reason?: string };
    conductor: { wired: boolean };
    lastTick: {
        status: "ok" | "degraded";
        reason?: string;
        ready: number;
        dispatched: number;
        failed: number;
        skipped: number;
        at: string;
    } | null;
    entries: AutopilotEntry[];
    staleIssues: StaleIssue[];
    killSwitch: KillSwitchState;
    totalDispatched: number;
    maxTotalDispatches: number | null;
    maxConsecutiveFailures: number | null;
};

type BackgroundBoard = {
    enabled: boolean;
    reason?: string;
    ready: number;
    autopilot: AutopilotView | null;
};

type BackgroundControl = "start" | "pause" | "scan";

function record(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : null;
}

function number(value: unknown, fallback = 0): number {
    return typeof value == "number" && Number.isFinite(value) ? value : fallback;
}

function parseEntries(value: unknown): AutopilotEntry[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): AutopilotEntry[] => {
        const row = record(item);
        if (!row || typeof row.issueId != "string" || typeof row.title != "string") return [];
        const status = row.status;
        if (status != "dispatched" && status != "existing" && status != "failed" && status != "skipped") return [];
        return [{
            issueId: row.issueId,
            title: row.title,
            status: status as AutopilotEntry["status"],
            ...(typeof row.workspaceId == "string" ? { workspaceId: row.workspaceId } : {}),
            ...(typeof row.routedAgentId == "string" ? { routedAgentId: row.routedAgentId } : {}),
            ...(typeof row.reason == "string" ? { reason: row.reason } : {}),
            at: typeof row.at == "string" ? row.at : "",
        }];
    });
}

function parseStaleIssues(value: unknown): StaleIssue[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): StaleIssue[] => {
        const row = record(item);
        if (!row || typeof row.id != "string" || typeof row.title != "string") return [];
        return [{
            id: row.id,
            title: row.title,
            ...(typeof row.status == "string" ? { status: row.status } : {}),
        }];
    });
}

function parseKillSwitch(value: unknown): KillSwitchState {
    const row = record(value);
    if (!row) return { tripped: false };
    return {
        tripped: row.tripped === true,
        ...(typeof row.reason == "string" ? { reason: row.reason } : {}),
        ...(typeof row.at == "string" ? { at: row.at } : {}),
    };
}

function nullableNumber(value: unknown): number | null {
    return typeof value == "number" && Number.isFinite(value) ? value : null;
}

function parseAutopilot(value: unknown): AutopilotView | null {
    const row = record(value);
    if (!row) return null;
    const beads = record(row.beads);
    const conductor = record(row.conductor);
    const tick = record(row.lastTick);
    const profile = record(row.launchProfile);
    const persistence = record(row.persistence);
    const tickStatus: "ok" | "degraded" =
        tick?.status == "ok" || tick?.status == "degraded"
            ? (tick.status as "ok" | "degraded")
            : "degraded";
    return {
        running: row.running === true,
        intervalMs: number(row.intervalMs),
        maxDispatchesPerTick: number(row.maxDispatchesPerTick),
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
        reviewOwner: "human",
        persistence: {
            wired: persistence?.wired === true,
            durable: persistence?.durable === true,
            ...(typeof persistence?.reason == "string" ? { reason: persistence.reason } : {}),
        },
        beads: {
            wired: beads?.wired === true,
            ...(typeof beads?.status == "string" ? { status: beads.status } : {}),
            ...(typeof beads?.reason == "string" ? { reason: beads.reason } : {}),
        },
        conductor: { wired: conductor?.wired === true },
        lastTick: tick
            ? {
                  status: tickStatus,
                  ...(typeof tick.reason == "string" ? { reason: tick.reason } : {}),
                  ready: number(tick.ready),
                  dispatched: number(tick.dispatched),
                  failed: number(tick.failed),
                  skipped: number(tick.skipped),
                  at: typeof tick.at == "string" ? tick.at : "",
              }
            : null,
        entries: parseEntries(row.entries),
        staleIssues: parseStaleIssues(row.staleIssues),
        killSwitch: parseKillSwitch(row.killSwitch),
        totalDispatched: number(row.totalDispatched),
        maxTotalDispatches: nullableNumber(row.maxTotalDispatches),
        maxConsecutiveFailures: nullableNumber(row.maxConsecutiveFailures),
    };
}

function parseBoard(boardValue: unknown, readyValue: unknown): BackgroundBoard {
    const board = record(boardValue);
    const ready = record(readyValue);
    return {
        enabled: board?.enabled === true,
        ...(typeof board?.reason == "string" ? { reason: board.reason } : {}),
        ready: Array.isArray(ready?.ready) ? ready.ready.length : 0,
        autopilot: parseAutopilot(board?.autopilot),
    };
}

function workspacePhase(workspace: RecoderWorkspace | undefined): "active" | "review" | "done" | "unknown" {
    if (!workspace) return "unknown";
    if (workspace.state == "awaiting_review" || workspace.attention == "awaiting_approval") return "review";
    if (workspace.state == "queued" || workspace.state == "running") return "active";
    if (workspace.state == "completed" || workspace.state == "merged" || workspace.state == "archived") return "done";
    return "unknown";
}

function cadenceLabel(intervalMs: number): string {
    if (intervalMs <= 0) return "manual scans";
    if (intervalMs % 60_000 == 0) return `every ${intervalMs / 60_000}m`;
    return `every ${Math.max(1, Math.round(intervalMs / 1_000))}s`;
}

function entryLabel(entry: AutopilotEntry, workspace: RecoderWorkspace | undefined): string {
    if (entry.status == "failed") return "Dispatch failed";
    if (entry.status == "skipped") return "Skipped";
    const phase = workspacePhase(workspace);
    if (phase == "review") return "Needs review";
    if (phase == "done") return "Delivered";
    if (phase == "active") return "Running";
    return "Dispatched";
}

function persistedBackgroundEntry(workspace: RecoderWorkspace): AutopilotEntry | null {
    const metadata = workspace.metadata;
    if (metadata?.backgroundAgent !== true) return null;
    if (metadata.prReviewAgent === true) return null;
    const issueId = typeof metadata.backgroundIssueId == "string" ? metadata.backgroundIssueId : "";
    const title = typeof metadata.backgroundIssueTitle == "string" ? metadata.backgroundIssueTitle : "";
    if (issueId == "" || title == "") return null;
    return {
        issueId,
        title,
        status: "dispatched",
        workspaceId: workspace.workspaceId,
        ...(typeof metadata.routedAgentId == "string" ? { routedAgentId: metadata.routedAgentId } : {}),
        at: workspace.updatedAt ?? workspace.createdAt ?? "",
    };
}

export function RecoderBackgroundAgents({
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
    const [open, setOpen] = useState(false);
    const [board, setBoard] = useState<BackgroundBoard | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<BackgroundControl | null>(null);
    const [error, setError] = useState("");

    const refresh = async () => {
        setLoading(true);
        try {
            const [boardRes, readyRes] = await Promise.all([
                fetch(`${getRecoderBackendUrl()}/api/agent-os/squads/board`),
                fetch(`${getRecoderBackendUrl()}/api/agent-os/issues/ready`),
            ]);
            const [boardBody, readyBody] = await Promise.all([boardRes.json(), readyRes.json()]);
            if (!boardRes.ok) throw new Error(readErrorReason(boardBody) || "Background-agent status is unavailable.");
            setBoard(parseBoard(record(boardBody)?.data, record(readyBody)?.data));
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Background-agent status is unavailable.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), 15_000);
        return () => clearInterval(timer);
    }, []);

    const control = async (action: BackgroundControl) => {
        const requestedProfile = {
            repoPath: repoPath.trim(),
            spaceId: "default",
            projectId: projectId.trim(),
            runtimeId: runtimeId.trim(),
        };
        const profileReady = repoReady && Object.values(requestedProfile).every((value) => value != "");
        const pinnedProfile = board?.autopilot?.launchProfile ?? null;
        if (action != "pause" && pinnedProfile == null && !profileReady) {
            setError("Choose a Git repository and installed agent before starting background work.");
            return;
        }
        setBusy(action);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/squads/board/control`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action,
                    // A valid current Board selection intentionally re-pins on
                    // start. Otherwise restart/scan reuses the visible pinned
                    // contract instead of manufacturing an empty target.
                    ...((action == "start" && profileReady) || pinnedProfile == null
                        ? { profile: requestedProfile }
                        : {}),
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(readErrorReason(body) || `Could not ${action} background agents.`);
            await refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : `Could not ${action} background agents.`);
        } finally {
            setBusy(null);
        }
    };

    const autopilot = board?.autopilot ?? null;
    const selectedProfileReady =
        repoReady && repoPath.trim() != "" && projectId.trim() != "" && runtimeId.trim() != "";
    const workspacesById = useMemo(
        () => new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace])),
        [workspaces]
    );
    const entries = useMemo(() => {
        const live = autopilot?.entries ?? [];
        const knownWorkspaceIds = new Set(live.flatMap((entry) => entry.workspaceId ? [entry.workspaceId] : []));
        const persisted = workspaces.flatMap((workspace): AutopilotEntry[] => {
            if (knownWorkspaceIds.has(workspace.workspaceId)) return [];
            const entry = persistedBackgroundEntry(workspace);
            return entry ? [entry] : [];
        });
        return [...live, ...persisted].sort((a, b) => b.at.localeCompare(a.at));
    }, [autopilot?.entries, workspaces]);
    const activeCount = entries.filter((entry) => workspacePhase(workspacesById.get(entry.workspaceId ?? "")) == "active").length;
    const reviewCount = entries.filter((entry) => workspacePhase(workspacesById.get(entry.workspaceId ?? "")) == "review").length;
    const attentionIds = new Set<string>();
    for (const entry of entries) {
        if (entry.status == "failed" || workspacePhase(workspacesById.get(entry.workspaceId ?? "")) == "review") {
            attentionIds.add(entry.issueId);
        }
    }
    for (const issue of autopilot?.staleIssues ?? []) attentionIds.add(issue.id);
    const attentionCount = attentionIds.size;

    return (
        <div className="border-l border-white/8 pl-3">
            <button
                className="flex w-full items-center gap-2 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
            >
                <span className={`h-1.5 w-1.5 shrink-0 ${attentionCount > 0 ? "bg-accent" : "bg-white/25"}`} />
                <span className={ROW_TITLE}>Background agents</span>
                <span className={META}>
                    {loading && board == null
                        ? "Loading"
                        : autopilot == null
                          ? "Unavailable"
                          : autopilot.running
                            ? `${activeCount} active`
                            : "Paused"}
                </span>
                {attentionCount > 0 && <span className={`${STATE_CHIP} ml-auto text-primary`}>{attentionCount} need attention</span>}
                <span className={`${META} ml-auto`}>{open ? "Hide" : "Show"}</span>
            </button>

            {open && (
                <div className="mt-2 flex flex-col gap-2 border-t border-white/8 pt-2 recoder-enter">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={FIELD_LABEL}>
                            {autopilot?.running ? "Running" : "Paused"}
                        </span>
                        {autopilot && (
                            <span className={META}>
                                up to {autopilot.maxDispatchesPerTick} launches {cadenceLabel(autopilot.intervalMs)}
                            </span>
                        )}
                        {autopilot && (
                            <span className={META} title={autopilot.persistence.reason}>
                                {autopilot.persistence.durable ? "resumes after restart" : "this session only"}
                            </span>
                        )}
                        <div className="ml-auto flex items-center gap-1.5">
                            <button
                                className={QUIET_BTN_XS}
                                disabled={busy != null || autopilot == null || (autopilot.launchProfile == null && !selectedProfileReady)}
                                onClick={() => void control("scan")}
                            >
                                {busy == "scan" ? "Scanning…" : "Scan now"}
                            </button>
                            {autopilot?.running ? (
                                <button className={QUIET_BTN} disabled={busy != null} onClick={() => void control("pause")}>
                                    {busy == "pause" ? "Pausing…" : "Pause new work"}
                                </button>
                            ) : (
                                <button
                                    className={PRIMARY_BTN}
                                    disabled={busy != null || autopilot == null || (autopilot.launchProfile == null && !selectedProfileReady)}
                                    onClick={() => void control("start")}
                                >
                                    {busy == "start" ? "Starting…" : "Start background agents"}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto] border border-white/8 bg-black font-mono text-xs">
                        <div className="min-w-0 border-r border-white/8 px-2 py-1.5">
                            <div className="truncate text-primary" title={autopilot?.launchProfile?.repoPath ?? repoPath}>
                                {autopilot?.launchProfile?.repoPath || repoPath || "Choose a repository"}
                            </div>
                            <div className="text-secondary">
                                {autopilot?.launchProfile
                                    ? `${autopilot.launchProfile.projectId} · ${autopilot.launchProfile.runtimeId}`
                                    : selectedProfileReady
                                      ? `${projectId} · ${runtimeId} (selected, not started)`
                                      : "No launch target pinned"}
                            </div>
                        </div>
                        <div className="flex items-center px-2 text-accent">Human review required</div>
                    </div>

                    <div className="grid grid-cols-3 border border-white/8 font-mono text-xs tabular-nums">
                        <div className="border-r border-white/8 px-2 py-1.5"><span className="text-primary">{board?.ready ?? 0}</span><span className="ml-2 text-secondary">Ready</span></div>
                        <div className="border-r border-white/8 px-2 py-1.5"><span className="text-primary">{activeCount}</span><span className="ml-2 text-secondary">Active</span></div>
                        <div className="px-2 py-1.5"><span className="text-primary">{reviewCount}</span><span className="ml-2 text-secondary">Review</span></div>
                    </div>

                    {error != "" && <div className="border-l-2 border-white/25 bg-white/[0.04] px-2 py-1 text-sm text-secondary">{error}</div>}
                    {!error && board && !board.enabled && <div className={META}>{board.reason ?? "Squads are disabled."}</div>}
                    {!error && board?.enabled && autopilot == null && <div className={META}>{board.reason ?? "Background agents are unavailable."}</div>}
                    {autopilot?.killSwitch.tripped && (
                        <div className="border-l-2 border-accent bg-accent/[0.08] px-2 py-1.5 text-sm text-primary">
                            <div>Kill-switch tripped — unattended run stopped automatically.</div>
                            <div className={`${META} mt-0.5`}>
                                {autopilot.killSwitch.reason ?? "An unattended-run safety cap was reached."} Click
                                &ldquo;Start background agents&rdquo; to resume with a fresh budget.
                            </div>
                        </div>
                    )}
                    {autopilot && !autopilot.killSwitch.tripped && (autopilot.maxTotalDispatches != null || autopilot.maxConsecutiveFailures != null) && (
                        <div className={META}>
                            {autopilot.maxTotalDispatches != null
                                ? `Budget: ${autopilot.totalDispatched}/${autopilot.maxTotalDispatches} dispatches this run`
                                : null}
                            {autopilot.maxTotalDispatches != null && autopilot.maxConsecutiveFailures != null ? " · " : null}
                            {autopilot.maxConsecutiveFailures != null
                                ? `stops after ${autopilot.maxConsecutiveFailures} failures in a row`
                                : null}
                        </div>
                    )}
                    {autopilot?.lastTick?.status == "degraded" && !autopilot.killSwitch.tripped && (
                        <div className="border-l-2 border-white/25 bg-white/[0.04] px-2 py-1 text-sm text-secondary">
                            {autopilot.lastTick.reason ?? "The last scan was degraded."}
                        </div>
                    )}
                    {autopilot?.persistence.reason && (
                        <div className="border-l-2 border-white/25 bg-white/[0.04] px-2 py-1 text-sm text-secondary">
                            Background-agent settings could not be saved: {autopilot.persistence.reason}
                        </div>
                    )}

                    {autopilot && entries.length > 0 && (
                        <div className="flex flex-col border border-white/8">
                            {entries.slice(0, 8).map((entry) => {
                                const workspace = workspacesById.get(entry.workspaceId ?? "");
                                const phase = workspacePhase(workspace);
                                return (
                                    <div key={`${entry.issueId}:${entry.at}`} className="flex items-center gap-2 border-b border-white/8 px-2 py-1.5 last:border-b-0">
                                        <span className={`${STATE_CHIP} font-mono`}>{entryLabel(entry, workspace)}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className={`${ROW_TITLE} truncate`}>{entry.title}</div>
                                            <div className={`${META} truncate`} title={entry.reason}>
                                                {entry.issueId}
                                                {entry.routedAgentId ? ` · ${entry.routedAgentId}` : ""}
                                                {entry.reason ? ` · ${entry.reason}` : ""}
                                            </div>
                                        </div>
                                        {entry.workspaceId && phase == "review" && (
                                            <button className={PRIMARY_BTN} onClick={() => onOpenReview(entry.workspaceId!)}>Review</button>
                                        )}
                                        {entry.workspaceId && phase == "active" && (
                                            <button className={QUIET_BTN} onClick={() => onOpenSession(entry.workspaceId!)}>Open</button>
                                        )}
                                        {entry.workspaceId && phase != "review" && phase != "active" && (
                                            <button className={QUIET_BTN_XS} onClick={() => onOpenReview(entry.workspaceId!)}>View</button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {autopilot && entries.length == 0 && (
                        <div className={META}>No background dispatches yet. Ready Beads issues are picked up on the next scan.</div>
                    )}
                    {autopilot && autopilot.staleIssues.length > 0 && (
                        <div className={`${META} border-l-2 border-accent/60 px-2`}>
                            {autopilot.staleIssues.length} stalled issue{autopilot.staleIssues.length == 1 ? "" : "s"}: {autopilot.staleIssues.slice(0, 3).map((issue) => issue.id).join(", ")}
                        </div>
                    )}

                    <RecoderPullRequestReviewAgents
                        workspaces={workspaces}
                        repoPath={repoPath}
                        repoReady={repoReady}
                        projectId={projectId}
                        runtimeId={runtimeId}
                        reviewerRuntimeIds={reviewerRuntimeIds}
                        onOpenSession={onOpenSession}
                        onOpenReview={onOpenReview}
                    />
                </div>
            )}
        </div>
    );
}

export { parseAutopilot, parseBoard, workspacePhase };
