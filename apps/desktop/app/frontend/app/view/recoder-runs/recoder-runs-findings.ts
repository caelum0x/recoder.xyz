// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure parse + selection logic for the Runs drift section, kept free of
// jotai/fetch (mirrors recoder-runs-correlation.ts) so vitest covers it fully.
//
// The conductor reconciler compares its workspace records against the real tmux
// sessions and git worktrees on disk and records what drifted (GET
// /api/conductor/reconcile/findings → ReconcileFindingView in
// backend/src/domains/conductor/types.ts). The Runs view surfaces those
// findings truthfully: a run row whose substrate died must not look healthy.

// Only the fields the view renders are declared; `kind` stays an open string so
// a new backend kind is surfaced raw instead of silently dropped.
type RunsDriftFinding = {
    findingId: string;
    workspaceId?: string;
    kind: string;
    sessionName?: string;
    worktreePath?: string;
    observedAt?: string;
    resolved?: boolean;
};

const DriftKindLabels: Record<string, string> = {
    orphan_session: "session running with no record",
    orphan_worktree: "worktree left behind",
    dangling_record: "record without session/worktree",
    crashed: "session died",
};

function asString(value: unknown): string {
    return typeof value == "string" ? value : "";
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value == "string" && value != "" ? value : undefined;
}

// Parse GET /api/conductor/reconcile/findings. The route wraps the list as
// { success, data: { findings: [...] } } (sendSuccess); a bare { data: [...] }
// is tolerated. Unlike parseWorkspaceList, a malformed body returns null —
// transport-failure semantics — so the view can say "drift findings
// unavailable" instead of faking a clean (empty) drift state.
function parseReconcileFindings(body: unknown): RunsDriftFinding[] | null {
    const data = (body as { data?: unknown } | null)?.data;
    const list = Array.isArray((data as { findings?: unknown })?.findings)
        ? (data as { findings: unknown[] }).findings
        : Array.isArray(data)
          ? (data as unknown[])
          : null;
    if (list == null) {
        return null;
    }
    const out: RunsDriftFinding[] = [];
    for (const raw of list) {
        if (raw == null || typeof raw != "object") {
            continue;
        }
        const f = raw as Record<string, unknown>;
        const findingId = asString(f.findingId);
        if (findingId == "") {
            continue;
        }
        out.push({
            findingId,
            workspaceId: asOptionalString(f.workspaceId),
            kind: asString(f.kind),
            sessionName: asOptionalString(f.sessionName),
            worktreePath: asOptionalString(f.worktreePath),
            observedAt: asOptionalString(f.observedAt),
            resolved: f.resolved == true,
        });
    }
    return out;
}

// The findings worth showing: resolved entries are history and `live` means the
// reconciler verified the workspace is healthy — neither is drift. Newest first
// (lexicographic ISO desc, missing observedAt sorts last).
function activeDriftFindings(findings: readonly RunsDriftFinding[]): RunsDriftFinding[] {
    return findings
        .filter((f) => f.resolved != true && f.kind != "live")
        .sort((a, b) => (b.observedAt ?? "").localeCompare(a.observedAt ?? ""));
}

function driftLabel(kind: string): string {
    return DriftKindLabels[kind] ?? kind;
}

// The findings affecting one run row, matched through the existing
// runId→workspaceId correlation map. Findings without a workspaceId can't be
// pinned to a row (they still show in the section list).
function driftForRun(
    runId: string,
    correlation: ReadonlyMap<string, string>,
    findings: readonly RunsDriftFinding[],
): RunsDriftFinding[] {
    const workspaceId = correlation.get(runId);
    if (workspaceId == null) {
        return [];
    }
    return findings.filter((f) => f.workspaceId != null && f.workspaceId == workspaceId);
}

export { activeDriftFindings, driftForRun, driftLabel, parseReconcileFindings, type RunsDriftFinding };
