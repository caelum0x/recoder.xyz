// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore(), createBlock: vi.fn() };
});

vi.mock("./recoder-needs-you", () => ({
    RecoderNeedsYouView: () => null,
}));

import { createBlock, globalStore } from "@/app/store/global";
import { RecoderNeedsYouViewModel } from "./recoder-needs-you-model";

const NeedsYouUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_needs_you/call";

function makeModel(): RecoderNeedsYouViewModel {
    return new RecoderNeedsYouViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a governed-edge `data` envelope in the sendSuccess shape the edge returns.
function ok(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

// A completed queue read carries the NeedsYouSnapshot DIRECTLY as `data.result` (the tool's
// handler returns the snapshot; the edge does not nest it under a `snapshot` key).
function completedSnapshot(snapshot: unknown) {
    return ok({ status: "completed", risk: "low", result: snapshot, auditEventId: "e" });
}

// A ranked snapshot: awaiting_approval highest, then review_ready, then a live `working` pane
// (ranked but NOT counted as needing you). `count` counts only the settle set (2 here).
function rankedSnapshot() {
    return {
        scope: { owner: "u1" },
        entries: [
            { workspaceId: "ws-approve", agentKind: "claude", state: "awaiting_approval", rank: 40, nativeStatus: true, needsYou: true, seen: false },
            { workspaceId: "ws-review", agentKind: "codex", state: "review_ready", rank: 30, nativeStatus: false, needsYou: true, seen: true },
            { workspaceId: "ws-run", agentKind: "cursor", state: "working", rank: 10, nativeStatus: true, needsYou: false, seen: false },
        ],
        count: 2,
        total: 3,
        degraded: false,
    };
}

describe("RecoderNeedsYouViewModel.load", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("projects the ranked snapshot with truthful fields and posts an owner-scoped read (no filter)", async () => {
        const fetchMock = vi.fn().mockResolvedValue(completedSnapshot(rankedSnapshot()));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.load();

        expect(fetchMock).toHaveBeenCalledWith(
            NeedsYouUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ args: {} }),
            })
        );
        const snapshot = globalStore.get(model.snapshotAtom);
        expect(snapshot).not.toBeNull();
        expect(snapshot.entries).toEqual([
            { workspaceId: "ws-approve", agentKind: "claude", state: "awaiting_approval", rank: 40, nativeStatus: true, needsYou: true, seen: false },
            { workspaceId: "ws-review", agentKind: "codex", state: "review_ready", rank: 30, nativeStatus: false, needsYou: true, seen: true },
            { workspaceId: "ws-run", agentKind: "cursor", state: "working", rank: 10, nativeStatus: true, needsYou: false, seen: false },
        ]);
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("projects count/total truthfully from the wire (never recomputed from the entries)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(rankedSnapshot())));

        const model = makeModel();
        await model.load();

        const snapshot = globalStore.get(model.snapshotAtom);
        // Three entries, but only two need you — the count is the backend's, not entries.length.
        expect(snapshot.entries).toHaveLength(3);
        expect(snapshot.count).toBe(2);
        expect(snapshot.total).toBe(3);
    });

    it("preserves the backend rank order WITHOUT client re-sorting", async () => {
        // Deliberately NOT in descending rank order — a client re-sort would reorder these.
        const snapshot = {
            scope: {},
            entries: [
                { workspaceId: "ws-b", agentKind: "codex", state: "working", rank: 10, nativeStatus: true, needsYou: false, seen: false },
                { workspaceId: "ws-a", agentKind: "claude", state: "awaiting_approval", rank: 40, nativeStatus: true, needsYou: true, seen: false },
                { workspaceId: "ws-c", agentKind: "cursor", state: "review_ready", rank: 30, nativeStatus: true, needsYou: true, seen: false },
            ],
            count: 2,
            total: 3,
            degraded: false,
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.load();

        expect(globalStore.get(model.snapshotAtom).entries.map((e: { workspaceId: string }) => e.workspaceId)).toEqual([
            "ws-b",
            "ws-a",
            "ws-c",
        ]);
    });

    it("shows an unknown-state entry but does NOT count it as needing you", async () => {
        const snapshot = {
            scope: {},
            entries: [
                { workspaceId: "ws-approve", agentKind: "claude", state: "awaiting_approval", rank: 40, nativeStatus: true, needsYou: true, seen: false },
                { workspaceId: "ws-mystery", agentKind: "pi", state: "unknown", rank: 0, nativeStatus: true, needsYou: false, seen: false },
            ],
            count: 1,
            total: 2,
            degraded: false,
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.load();

        const view = globalStore.get(model.snapshotAtom);
        const mystery = view.entries.find((e: { workspaceId: string }) => e.workspaceId == "ws-mystery");
        expect(mystery).toBeDefined();
        expect(mystery.state).toBe("unknown");
        expect(mystery.needsYou).toBe(false);
        // The count stays the backend's — the unknown pane never inflates it.
        expect(view.count).toBe(1);
    });

    it("surfaces a degraded snapshot's reason verbatim while KEEPING its last-known entries (no fake all-clear)", async () => {
        const snapshot = rankedSnapshot();
        (snapshot as Record<string, unknown>).degraded = true;
        (snapshot as Record<string, unknown>).reason = "stream closed — reconnecting (attempt 1/10)";
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.load();

        const view = globalStore.get(model.snapshotAtom);
        expect(view).not.toBeNull();
        expect(view.degraded).toBe(true);
        expect(view.entries).toHaveLength(3);
        expect(globalStore.get(model.noticeAtom)).toBe("stream closed — reconnecting (attempt 1/10)");
    });

    it("distinguishes a truthful empty queue (count 0, not degraded) from a degrade", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(completedSnapshot({ scope: {}, entries: [], count: 0, total: 0, degraded: false }))
        );

        const model = makeModel();
        await model.load();

        const view = globalStore.get(model.snapshotAtom);
        expect(view).not.toBeNull();
        expect(view.entries).toEqual([]);
        expect(view.count).toBe(0);
        expect(view.degraded).toBe(false);
        expect(globalStore.get(model.noticeAtom)).toBe("");
    });

    it("surfaces a SERVICE_UNAVAILABLE from a failed gate verbatim (never hidden, no fabricated queue)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                ok({
                    status: "failed",
                    risk: "low",
                    reason: "SERVICE_UNAVAILABLE: needs-you queue is not wired",
                    error: "SERVICE_UNAVAILABLE: needs-you queue is not wired",
                    auditEventId: "e",
                })
            )
        );

        const model = makeModel();
        await model.load();

        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("SERVICE_UNAVAILABLE: needs-you queue is not wired");
    });

    it("surfaces a policy denial from the governed edge verbatim without a fabricated queue", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(ok({ status: "denied", risk: "medium", reason: "needs-you denied by policy" }))
        );

        const model = makeModel();
        await model.load();

        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("needs-you denied by policy");
    });

    it("surfaces a truthful notice on a non-2xx (conductor MCP not registered)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: async () => ({ error: { message: "MCP server not registered: conductor" } }),
            })
        );

        const model = makeModel();
        await model.load();

        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("MCP server not registered: conductor");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.load();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });

    it("posts the taskGroup filter when set, and maps an explicit owner to the userId arg", async () => {
        const fetchMock = vi.fn().mockResolvedValue(completedSnapshot(rankedSnapshot()));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setTaskGroup("grp1");
        await model.load({ owner: "u2" });

        expect(fetchMock).toHaveBeenCalledWith(
            NeedsYouUrl,
            expect.objectContaining({
                body: JSON.stringify({ args: { taskGroup: "grp1", userId: "u2" } }),
            })
        );
    });
});

describe("RecoderNeedsYouViewModel.focusWorkspace", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("opens the workspace terminal block for a focused pane", async () => {
        const model = makeModel();
        await model.focusWorkspace("ws-approve");

        expect(createBlock).toHaveBeenCalledWith({
            meta: { view: "recoder-terminal", "recoder:workspaceid": "ws-approve" },
        });
    });

    it("is a no-op for an empty workspace id", async () => {
        const model = makeModel();
        await model.focusWorkspace("   ");

        expect(createBlock).not.toHaveBeenCalled();
    });
});
