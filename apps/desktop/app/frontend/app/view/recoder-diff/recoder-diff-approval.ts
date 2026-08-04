// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Correlate a selected workspace to the ONE governance approval its blocked run
// is waiting on, so the Review screen can bring a single inline approve/reject
// in-context (DESIGN-REFERENCE 3B) instead of bouncing to the Approvals tab.
//
// The seam is honest, not invented: the conductor workspace record carries the
// run's `taskId`/`runId` (packages/agent-os Workspace) and the governance
// ApprovalRecord served at /api/agent-os/approvals carries the SAME `taskId`/
// `runId` (the ACP permission gate + approval.service thread them through). We
// match on those real ids — never fabricate a card when nothing correlates.

import type { RecoderApproval } from "../recoder-approvals/recoder-approvals-model";

// The minimal run-correlation facts the matcher reads off a workspace record.
type WorkspaceApprovalKey = {
    taskId?: string;
    runId?: string;
    state?: string;
};

function idMatch(a?: string | null, b?: string): boolean {
    return typeof a == "string" && a != "" && a === b;
}

// Pick the single pending approval that belongs to this workspace's run. runId
// is the most specific key (one run) so it wins; taskId is the fallback for
// approvals opened without a run id. Only `pending` records are eligible — a
// decided/expired record never resurfaces as an actionable card. null ⇒ nothing
// correlates (the truthful "no card" answer).
function selectWorkspaceApproval(
    workspace: WorkspaceApprovalKey,
    approvals: readonly RecoderApproval[]
): RecoderApproval | null {
    const pending = approvals.filter((a) => a != null && a.status == "pending");
    if (workspace.runId) {
        const byRun = pending.find((a) => idMatch(a.runId, workspace.runId));
        if (byRun != null) {
            return byRun;
        }
    }
    if (workspace.taskId) {
        const byTask = pending.find((a) => idMatch(a.taskId, workspace.taskId));
        if (byTask != null) {
            return byTask;
        }
    }
    return null;
}

// The show/hide gate for the inline card: the DURABLE workspace state must say
// the run is blocked on approval AND a real pending record must correlate to it.
// Both are required — state alone could be stale, and a stray pending record
// must not surface a card on a run that is not actually waiting.
function shouldShowInlineApproval(state: string, approval: RecoderApproval | null): boolean {
    return state == "awaiting_approval" && approval != null;
}

export { selectWorkspaceApproval, shouldShowInlineApproval, type WorkspaceApprovalKey };
