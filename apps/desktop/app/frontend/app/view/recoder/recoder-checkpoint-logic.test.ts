// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
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
} from "./recoder-checkpoint-logic";

function makeCp(overrides: Partial<RecoderCheckpoint> = {}): RecoderCheckpoint {
    return {
        checkpointId: "cp_x",
        label: "",
        kind: "commit",
        dirty: false,
        createdAt: "",
        headSha: "",
        snapshotSha: "",
        ...overrides,
    };
}

describe("parseCheckpointList — untrusted checkpoints payload", () => {
    it("parses the documented envelope, carrying the shas", () => {
        const body = {
            success: true,
            data: {
                checkpoints: [
                    {
                        checkpointId: "cp_1234567890",
                        label: "before refactor",
                        kind: "stash",
                        dirty: true,
                        createdAt: "2026-08-01T00:00:00.000Z",
                        headSha: "abc",
                        snapshotSha: "def",
                    },
                    { checkpointId: "cp_2", kind: "commit", dirty: false, createdAt: "2026-08-02T00:00:00.000Z" },
                ],
            },
        };
        const list = parseCheckpointList(body);
        expect(list).toHaveLength(2);
        expect(list[0]).toEqual({
            checkpointId: "cp_1234567890",
            label: "before refactor",
            kind: "stash",
            dirty: true,
            createdAt: "2026-08-01T00:00:00.000Z",
            headSha: "abc",
            snapshotSha: "def",
        });
        expect(list[1].label).toBe("");
        expect(list[1].dirty).toBe(false);
        expect(list[1].headSha).toBe("");
        expect(list[1].snapshotSha).toBe("");
    });

    it("degrades every malformed shape to an empty/filtered list", () => {
        expect(parseCheckpointList(null)).toEqual([]);
        expect(parseCheckpointList({})).toEqual([]);
        expect(parseCheckpointList({ data: null })).toEqual([]);
        expect(parseCheckpointList({ data: { checkpoints: "nope" } })).toEqual([]);
        expect(parseCheckpointList({ data: { checkpoints: [null, 42, { label: "no id" }, { checkpointId: "" }] } })).toEqual([]);
    });
});

describe("checkpointDisplayLabel", () => {
    it("prefers the operator's label, else the short id", () => {
        expect(checkpointDisplayLabel(makeCp({ checkpointId: "cp_x", label: "wip" }))).toBe("wip");
        expect(checkpointDisplayLabel(makeCp({ checkpointId: "0123456789abcdef", label: "" }))).toBe("01234567");
    });
});

describe("checkpointShortSha — git-native row chip", () => {
    it("shortens the base HEAD sha to seven chars", () => {
        expect(checkpointShortSha(makeCp({ headSha: "0123456789abcdef" }))).toBe("0123456");
    });

    it("omits the chip when the backend carried no sha", () => {
        expect(checkpointShortSha(makeCp({ headSha: "" }))).toBe("");
    });
});

describe("orderCheckpointsNewestFirst — display ordering", () => {
    it("sorts by createdAt descending", () => {
        const list = [
            makeCp({ checkpointId: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
            makeCp({ checkpointId: "new", createdAt: "2026-08-03T00:00:00.000Z" }),
            makeCp({ checkpointId: "mid", createdAt: "2026-08-02T00:00:00.000Z" }),
        ];
        expect(orderCheckpointsNewestFirst(list).map((c) => c.checkpointId)).toEqual(["new", "mid", "old"]);
    });

    it("is immutable and sorts unparseable timestamps oldest (stable)", () => {
        const list = [
            makeCp({ checkpointId: "a", createdAt: "" }),
            makeCp({ checkpointId: "b", createdAt: "2026-08-02T00:00:00.000Z" }),
            makeCp({ checkpointId: "c", createdAt: "" }),
        ];
        const ordered = orderCheckpointsNewestFirst(list);
        expect(ordered.map((c) => c.checkpointId)).toEqual(["b", "a", "c"]);
        expect(list.map((c) => c.checkpointId)).toEqual(["a", "b", "c"]);
    });
});

describe("selectWorkspaceCheckpoints — stale-guard + ordering", () => {
    const cps = [
        makeCp({ checkpointId: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
        makeCp({ checkpointId: "new", createdAt: "2026-08-02T00:00:00.000Z" }),
    ];

    it("returns the workspace's snapshots newest-first when the fetch matches", () => {
        expect(selectWorkspaceCheckpoints("ws-1", "ws-1", cps).map((c) => c.checkpointId)).toEqual(["new", "old"]);
    });

    it("shows nothing for a stale fetch (another row's snapshots)", () => {
        expect(selectWorkspaceCheckpoints("ws-2", "ws-1", cps)).toEqual([]);
    });
});

describe("hasLoadedCheckpoints — empty-state gate", () => {
    it("is true only after a real read landed for THIS workspace", () => {
        expect(hasLoadedCheckpoints("ws-1", "ws-1")).toBe(true);
        expect(hasLoadedCheckpoints("", "ws-1")).toBe(false);
        expect(hasLoadedCheckpoints("ws-2", "ws-1")).toBe(false);
        expect(hasLoadedCheckpoints("", "")).toBe(false);
    });

    it("has a single one-voice empty line", () => {
        expect(CHECKPOINTS_EMPTY).toBe("No checkpoints yet — Snapshot to capture this run.");
    });
});

describe("snapshotRequestBody — optional label shaping", () => {
    it("carries a trimmed label", () => {
        expect(snapshotRequestBody("  before refactor  ")).toEqual({ label: "before refactor" });
    });

    it("posts a bare object when the label is empty/whitespace/absent", () => {
        expect(snapshotRequestBody("")).toEqual({});
        expect(snapshotRequestBody("   ")).toEqual({});
        expect(snapshotRequestBody(undefined)).toEqual({});
    });
});

describe("readBranchedWorkspaceId — branch → new-workspace hand-off", () => {
    it("reads the new workspace id from the success envelope", () => {
        const body = { success: true, data: { workspace: { workspaceId: "ws-new", state: "running" } } };
        expect(readBranchedWorkspaceId(body)).toBe("ws-new");
    });

    it("returns '' when the envelope carries no workspace id (declines to hand off)", () => {
        expect(readBranchedWorkspaceId(null)).toBe("");
        expect(readBranchedWorkspaceId({})).toBe("");
        expect(readBranchedWorkspaceId({ data: {} })).toBe("");
        expect(readBranchedWorkspaceId({ data: { workspace: null } })).toBe("");
        expect(readBranchedWorkspaceId({ data: { workspace: { workspaceId: 42 } } })).toBe("");
    });
});

describe("error messages — truthful failure surfacing", () => {
    it("reads a 403 as a governance block, else the backend reason or a status fallback", () => {
        expect(restoreErrorMessage(403, "")).toBe("Restore blocked - needs approval.");
        expect(restoreErrorMessage(403, "policy denied restore")).toBe("policy denied restore");
        expect(restoreErrorMessage(500, "")).toBe("Restore failed (500).");
        expect(restoreErrorMessage(409, "worktree busy")).toBe("worktree busy");
    });

    it("uses the same shape for snapshot and branch", () => {
        expect(snapshotErrorMessage(403, "")).toBe("Checkpoint blocked - needs approval.");
        expect(snapshotErrorMessage(500, "")).toBe("Checkpoint failed (500).");
        expect(branchErrorMessage(403, "")).toBe("Branch blocked - needs approval.");
        expect(branchErrorMessage(503, "no worktree")).toBe("no worktree");
    });
});
