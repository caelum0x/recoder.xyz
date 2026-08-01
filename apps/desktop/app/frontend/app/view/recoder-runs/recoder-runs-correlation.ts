// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure parse + correlation logic for the Runs drilldown, extracted from the
// stateful ViewModel so it stays unit-testable and free of jotai/fetch/blocks.
//
// The Runs view lists Agent OS TaskRuns (GET /api/agent-os/runs). To turn a run
// into an actionable drilldown — open its Session/Review, stream THAT run's
// events — it must be mapped onto the conductor Workspace it launched into. A run
// and a workspace share identity via runId (best), then taskId+spaceId. These
// functions never invent a link; an uncorrelated run returns null so the view can
// show a truthful "not linked to a workspace" state instead of guessing.

import type { RecoderRunEvent } from "./recoder-runs-model";

// The minimal Workspace subset the drilldown needs to correlate a run and open
// that workspace's surfaces. Mirrors @recoder/conductor-ui Workspace fields; kept
// lenient (everything the backend may omit is optional) since it comes from an
// untrusted external JSON body.
type WorkspaceCorrelation = {
    workspaceId: string;
    taskId: string;
    spaceId: string;
    runId?: string;
    runtimeId?: string;
    state?: string;
    updatedAt?: string;
};

// The identity fields the correlation reads off a run (structural subset of
// RecoderRun). Kept optional so a lean/older runs payload still narrows safely.
type RunCorrelationInput = {
    runId?: string;
    taskId?: string;
    spaceId?: string;
    assigneeAgentId?: string;
};

function asString(value: unknown): string {
    return typeof value == "string" ? value : "";
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value == "string" && value != "" ? value : undefined;
}

// Parse GET /api/conductor/workspaces into correlation records. Tolerates BOTH
// the live envelope { data: { workspaces: [...] } } and a bare { data: [...] }
// from an older embedded backend (same tolerance the Review model uses). Archived
// workspaces are dropped — a settled/hidden workspace is not a drilldown target.
// Rows missing a workspaceId are skipped rather than yielding an unopenable link.
function parseWorkspaceList(body: unknown): WorkspaceCorrelation[] {
    const data = (body as { data?: unknown } | null)?.data;
    const list = Array.isArray((data as { workspaces?: unknown })?.workspaces)
        ? (data as { workspaces: unknown[] }).workspaces
        : Array.isArray(data)
          ? (data as unknown[])
          : [];
    const out: WorkspaceCorrelation[] = [];
    for (const raw of list) {
        if (raw == null || typeof raw != "object") {
            continue;
        }
        const ws = raw as Record<string, unknown>;
        const workspaceId = asString(ws.workspaceId);
        if (workspaceId == "" || ws.state == "archived") {
            continue;
        }
        out.push({
            workspaceId,
            taskId: asString(ws.taskId),
            spaceId: asString(ws.spaceId),
            runId: asOptionalString(ws.runId),
            runtimeId: asOptionalString(ws.runtimeId),
            state: asOptionalString(ws.state),
            updatedAt: asOptionalString(ws.updatedAt),
        });
    }
    return out;
}

// Parse GET /api/conductor/workspaces/:id/events into RunEvents. The conductor
// wraps the list as { data: { events: [...] } } (listWorkspaceEvents, oldest →
// newest); a bare { data: [...] } is tolerated. Order is preserved so the panel
// reads as a chronological transcript. Rows missing an eventId are skipped (they
// have no stable render key and are not real events).
function parseWorkspaceEvents(body: unknown): RecoderRunEvent[] {
    const data = (body as { data?: unknown } | null)?.data;
    const list = Array.isArray((data as { events?: unknown })?.events)
        ? (data as { events: unknown[] }).events
        : Array.isArray(data)
          ? (data as unknown[])
          : [];
    const out: RecoderRunEvent[] = [];
    for (const raw of list) {
        if (raw == null || typeof raw != "object") {
            continue;
        }
        const ev = raw as Record<string, unknown>;
        const eventId = asString(ev.eventId);
        if (eventId == "") {
            continue;
        }
        out.push({
            eventId,
            type: asString(ev.type),
            taskId: asString(ev.taskId),
            runId: asOptionalString(ev.runId),
            agentId: asOptionalString(ev.agentId),
            state: asOptionalString(ev.state),
            message: asOptionalString(ev.message),
            createdAt: asString(ev.createdAt),
        });
    }
    return out;
}

// Lexicographic-desc pick over ISO updatedAt (missing sorts last); ties keep the
// earlier list position for a stable, deterministic result.
function pickMostRecent(candidates: WorkspaceCorrelation[]): WorkspaceCorrelation {
    return candidates.reduce((best, ws) => ((ws.updatedAt ?? "") > (best.updatedAt ?? "") ? ws : best));
}

// Map a run onto the single workspace it belongs to, or null when nothing links.
// Precedence:
//   1. runId — the exact 1:1 link when the backend stamped it on the workspace.
//   2. taskId + spaceId — parallel sibling runs of one task share these, so this
//      can match several workspaces; disambiguate by the run's assignee agent
//      (assigneeAgentId === workspace.runtimeId), then fall back to the most
//      recently updated. Never guesses across a different task/space.
function correlateRunToWorkspace(
    run: RunCorrelationInput,
    workspaces: readonly WorkspaceCorrelation[],
): string | null {
    const runId = asOptionalString(run.runId);
    if (runId != null) {
        const byRun = workspaces.find((ws) => ws.runId != null && ws.runId == runId);
        if (byRun != null) {
            return byRun.workspaceId;
        }
    }
    const taskId = asOptionalString(run.taskId);
    const spaceId = asOptionalString(run.spaceId);
    if (taskId == null || spaceId == null) {
        return null;
    }
    let candidates = workspaces.filter((ws) => ws.taskId == taskId && ws.spaceId == spaceId);
    if (candidates.length == 0) {
        return null;
    }
    if (candidates.length == 1) {
        return candidates[0].workspaceId;
    }
    const agent = asOptionalString(run.assigneeAgentId);
    if (agent != null) {
        const byAgent = candidates.filter((ws) => ws.runtimeId == agent);
        if (byAgent.length > 0) {
            candidates = byAgent;
        }
    }
    return pickMostRecent(candidates).workspaceId;
}

// Fold a runs list + workspaces list into a Map<runId, workspaceId> so the view
// can render each row's correlation (and enable Session/Review) in one pass.
// Uncorrelated runs are simply absent from the map.
function correlateRuns(
    runs: readonly RunCorrelationInput[],
    workspaces: readonly WorkspaceCorrelation[],
): Map<string, string> {
    const map = new Map<string, string>();
    for (const run of runs) {
        const runId = asOptionalString(run.runId);
        if (runId == null) {
            continue;
        }
        const workspaceId = correlateRunToWorkspace(run, workspaces);
        if (workspaceId != null) {
            map.set(runId, workspaceId);
        }
    }
    return map;
}

export {
    correlateRunToWorkspace,
    correlateRuns,
    parseWorkspaceEvents,
    parseWorkspaceList,
    type RunCorrelationInput,
    type WorkspaceCorrelation,
};
