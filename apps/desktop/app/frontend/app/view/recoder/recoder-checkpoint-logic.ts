// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Checkpoint surface over the conductor's checkpoint edges — snapshots of a
// workspace's git state the operator can restore into the current worktree or
// branch a fresh workspace off of. Backend shapes:
//   GET  /workspaces/:id/checkpoints        -> { success, data: { checkpoints: CheckpointRecord[] } }
//   POST /workspaces/:id/checkpoints        -> capture (accepts { label })
//   POST .../:cid/restore                   -> reset THIS worktree to the snapshot
//   POST .../:cid/branch                    -> { success, data: { workspace } } NEW workspace
// The record fields mirror the conductor's checkpoint-store port. Everything here
// is pure so the model stays a thin transport and the decisions stay testable.

type RecoderCheckpoint = {
    checkpointId: string;
    label: string;
    // "commit" (clean worktree) or "stash" (uncommitted edits captured too).
    kind: string;
    // True when uncommitted changes were folded into the snapshot.
    dirty: boolean;
    createdAt: string;
    // The committed HEAD sha at capture time — the base the checkpoint sits on.
    headSha: string;
    // The snapshot commit whose TREE is the captured file state (branch source).
    snapshotSha: string;
};

// One-voice empty line for a workspace that has been read but holds no snapshots.
const CHECKPOINTS_EMPTY = "No checkpoints yet — Snapshot to capture this run.";

// Coerce the untrusted checkpoints payload into the view shape. Anything that is
// not the documented envelope degrades to an empty list — never a throw, never a
// fabricated snapshot. Rows without a string checkpointId are dropped.
function parseCheckpointList(body: unknown): RecoderCheckpoint[] {
    const data = (body as { data?: unknown })?.data;
    if (data == null || typeof data != "object") {
        return [];
    }
    const raw = (data as { checkpoints?: unknown }).checkpoints;
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: RecoderCheckpoint[] = [];
    for (const item of raw) {
        if (item == null || typeof item != "object") {
            continue;
        }
        const r = item as Record<string, unknown>;
        if (typeof r.checkpointId != "string" || r.checkpointId == "") {
            continue;
        }
        out.push({
            checkpointId: r.checkpointId,
            label: typeof r.label == "string" ? r.label : "",
            kind: typeof r.kind == "string" ? r.kind : "",
            dirty: r.dirty == true,
            createdAt: typeof r.createdAt == "string" ? r.createdAt : "",
            headSha: typeof r.headSha == "string" ? r.headSha : "",
            snapshotSha: typeof r.snapshotSha == "string" ? r.snapshotSha : "",
        });
    }
    return out;
}

// Human row label: the operator's label when one was given, else the short id.
function checkpointDisplayLabel(cp: RecoderCheckpoint): string {
    if (cp.label != "") {
        return cp.label;
    }
    return cp.checkpointId.slice(0, 8);
}

// The git-native sha-short for the row (the base commit the checkpoint captures),
// or "" when the backend did not carry it — the row just omits the chip then.
function checkpointShortSha(cp: RecoderCheckpoint): string {
    if (cp.headSha == "") {
        return "";
    }
    return cp.headSha.slice(0, 7);
}

// Sort a checkpoint list newest-first for display. The backend already lists
// newest-first, but the UI makes that a hard guarantee (a re-ordered adapter or a
// merged safety-snapshot never shows out of order). Immutable + stable: equal
// timestamps keep their incoming order; an unparseable time sorts oldest.
function orderCheckpointsNewestFirst(list: readonly RecoderCheckpoint[]): RecoderCheckpoint[] {
    return [...list].sort((a, b) => checkpointTime(b) - checkpointTime(a));
}

function checkpointTime(cp: RecoderCheckpoint): number {
    const t = Date.parse(cp.createdAt);
    return Number.isNaN(t) ? 0 : t;
}

// The list to render for the SELECTED workspace: only the snapshots that were
// fetched for THIS workspace (a stale fetch shows nothing, never another row's
// snapshots), newest-first.
function selectWorkspaceCheckpoints(
    loadedFor: string,
    workspaceId: string,
    checkpoints: readonly RecoderCheckpoint[]
): RecoderCheckpoint[] {
    if (!hasLoadedCheckpoints(loadedFor, workspaceId)) {
        return [];
    }
    return orderCheckpointsNewestFirst(checkpoints);
}

// True once a real read landed for this workspace — the gate for showing the
// empty-state line so an unreachable/never-loaded strip stays silent instead of
// claiming "no checkpoints".
function hasLoadedCheckpoints(loadedFor: string, workspaceId: string): boolean {
    return workspaceId != "" && loadedFor == workspaceId;
}

// Snapshot request body: carry the operator's label only when they typed one, so
// an unlabeled snapshot posts a bare {} rather than an empty-string label.
function snapshotRequestBody(label?: string): { label?: string } {
    const trimmed = (label ?? "").trim();
    if (trimmed == "") {
        return {};
    }
    return { label: trimmed };
}

// The new workspace's id from a successful branch envelope ({ data: { workspace }}),
// or "" when the backend did not return one — the caller then declines to hand off
// rather than open a phantom session.
function readBranchedWorkspaceId(body: unknown): string {
    const workspace = (body as { data?: { workspace?: unknown } })?.data?.workspace;
    if (workspace == null || typeof workspace != "object") {
        return "";
    }
    const id = (workspace as { workspaceId?: unknown }).workspaceId;
    return typeof id == "string" ? id : "";
}

// Truthful failure lines for a non-ok response: a governance deny (403) reads as
// "blocked - needs approval", anything else carries the backend's reason or a
// status-tagged fallback. Never a faked success.
function snapshotErrorMessage(status: number, reason: string): string {
    if (status == 403) {
        return reason || "Checkpoint blocked - needs approval.";
    }
    return reason || `Checkpoint failed (${status}).`;
}

function restoreErrorMessage(status: number, reason: string): string {
    if (status == 403) {
        return reason || "Restore blocked - needs approval.";
    }
    return reason || `Restore failed (${status}).`;
}

function branchErrorMessage(status: number, reason: string): string {
    if (status == 403) {
        return reason || "Branch blocked - needs approval.";
    }
    return reason || `Branch failed (${status}).`;
}

export {
    CHECKPOINTS_EMPTY,
    branchErrorMessage,
    checkpointDisplayLabel,
    checkpointShortSha,
    hasLoadedCheckpoints,
    orderCheckpointsNewestFirst,
    parseCheckpointList,
    readBranchedWorkspaceId,
    restoreErrorMessage,
    selectWorkspaceCheckpoints,
    snapshotErrorMessage,
    snapshotRequestBody,
    type RecoderCheckpoint,
};
