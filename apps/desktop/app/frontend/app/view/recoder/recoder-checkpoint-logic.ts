// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Checkpoint list surface over GET /api/conductor/workspaces/:id/checkpoints —
// snapshots of a workspace's git state the operator can restore or branch from.
// Backend shape: { success, data: { checkpoints: CheckpointRecord[] } } with the
// record fields defined by the conductor's checkpoint-store port.

type RecoderCheckpoint = {
    checkpointId: string;
    label: string;
    // "commit" (clean worktree) or "stash" (uncommitted edits captured too).
    kind: string;
    // True when uncommitted changes were folded into the snapshot.
    dirty: boolean;
    createdAt: string;
};

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

export { checkpointDisplayLabel, parseCheckpointList, type RecoderCheckpoint };
