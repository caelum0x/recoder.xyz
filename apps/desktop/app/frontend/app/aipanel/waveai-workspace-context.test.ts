// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { RecoderWorkspace } from "@/app/view/recoder/recoder-board-logic";
import { atom, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import {
    fetchWorkspaceDiffFiles,
    gatherWorkspaceContext,
    pickRecoderBoardModel,
    type BlockComponentModelLike,
} from "./waveai-workspace-context";

const store = createStore();
const get = store.get.bind(store) as <T>(a: any) => T;

function makeWorkspace(id: string): RecoderWorkspace {
    return {
        workspaceId: id,
        branch: `recoder/${id}`,
        runtimeId: "codex",
        worktreePath: "",
        state: "awaiting_review",
        projectId: "acme-api",
    } as RecoderWorkspace;
}

function makeBoard(selectedId: string, workspaces: RecoderWorkspace[]): BlockComponentModelLike {
    return {
        viewModel: {
            viewType: "recoder",
            selectedWorkspaceIdAtom: atom(selectedId),
            combinedWorkspacesAtom: atom(workspaces),
            diffSummariesAtom: atom({ [selectedId]: { additions: 4, deletions: 2, files: 1 } }),
        },
    };
}

describe("pickRecoderBoardModel", () => {
    it("picks the recoder board that has a workspace selected", () => {
        const idle = makeBoard("", []);
        const active = makeBoard("ws-2", [makeWorkspace("ws-2")]);
        const other: BlockComponentModelLike = { viewModel: { viewType: "recoder-runs" } };
        expect(pickRecoderBoardModel([other, idle, active], get)).toBe(active.viewModel);
    });

    it("returns null when no board exists or nothing is selected", () => {
        expect(pickRecoderBoardModel([], get)).toBeNull();
        expect(pickRecoderBoardModel(null, get)).toBeNull();
        expect(pickRecoderBoardModel([makeBoard("", [])], get)).toBeNull();
        expect(pickRecoderBoardModel([{ viewModel: { viewType: "recoder" } }], get)).toBeNull();
    });
});

describe("gatherWorkspaceContext", () => {
    it("folds the selected workspace, per-file diff, and codename into a context", async () => {
        const board = makeBoard("ws-2", [makeWorkspace("ws-1"), makeWorkspace("ws-2")]);
        const fetchFiles = vi.fn().mockResolvedValue([{ path: "a.ts", insertions: 3, deletions: 1 }]);
        const ctx = await gatherWorkspaceContext([board], get, fetchFiles);
        expect(fetchFiles).toHaveBeenCalledWith("ws-2");
        expect(ctx.workspaceId).toBe("ws-2");
        expect(ctx.codename).toBe("recoder/ws-2");
        expect(ctx.text).toContain("- a.ts (+3/-1)");
    });

    it("falls back to the aggregate summary when the per-file read degrades", async () => {
        const board = makeBoard("ws-2", [makeWorkspace("ws-2")]);
        const ctx = await gatherWorkspaceContext([board], get, async () => null);
        expect(ctx.text).toContain("Files changed: 1 (+4/-2).");
    });

    it("returns null when the selected id has no workspace record", async () => {
        const board = makeBoard("ws-gone", [makeWorkspace("ws-2")]);
        expect(await gatherWorkspaceContext([board], get, async () => null)).toBeNull();
        expect(await gatherWorkspaceContext([], get, async () => null)).toBeNull();
    });
});

describe("fetchWorkspaceDiffFiles", () => {
    it("returns the file list from an available diff and encodes the id", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: { available: true, files: [{ path: "a.ts", insertions: 1, deletions: 0 }] } }),
        });
        const files = await fetchWorkspaceDiffFiles("http://127.0.0.1:3100", "ws/../x", fetchFn as any);
        expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:3100/api/conductor/workspaces/ws%2F..%2Fx/diff/files");
        expect(files).toEqual([{ path: "a.ts", insertions: 1, deletions: 0 }]);
    });

    it("degrades to null on http error, unavailable diff, or a thrown fetch", async () => {
        const notOk = vi.fn().mockResolvedValue({ ok: false });
        expect(await fetchWorkspaceDiffFiles("http://b", "ws-1", notOk as any)).toBeNull();
        const unavailable = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { available: false } }) });
        expect(await fetchWorkspaceDiffFiles("http://b", "ws-1", unavailable as any)).toBeNull();
        const boom = vi.fn().mockRejectedValue(new Error("down"));
        expect(await fetchWorkspaceDiffFiles("http://b", "ws-1", boom as any)).toBeNull();
    });
});
