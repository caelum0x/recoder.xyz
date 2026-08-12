// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-fanout", () => ({
    RecoderFanoutView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderFanoutViewModel } from "./recoder-fanout-model";

const CockpitUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_converge_cockpit/call";
const FanoutUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_converge_fanout/call";

function makeModel(): RecoderFanoutViewModel {
    return new RecoderFanoutViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a governed-edge `data` envelope in the sendSuccess shape the edge returns.
function ok(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

// A completed cockpit read carrying the tool's `{ snapshot }` result.
function completedSnapshot(snapshot: unknown) {
    return ok({ status: "completed", risk: "low", result: { snapshot }, auditEventId: "e" });
}

describe("RecoderFanoutViewModel.loadCockpit", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects a healthy cockpit snapshot into the terminal view model", async () => {
        const snapshot = {
            taskGroup: "grp1",
            agents: [
                { workspaceId: "ws1", kind: "claude", state: "review_ready", settled: true, nativeStatus: true },
                { workspaceId: "ws2", kind: "crush", state: "working", settled: false, nativeStatus: false },
            ],
            settledCount: 1,
            totalCount: 2,
            contested: [
                { path: "src/a.ts", agents: ["ws1", "ws2"], synthesizable: true },
                { path: "src/b.ts", agents: ["ws1", "ws2"], synthesizable: false, reason: "overlap" },
            ],
            autoMergeableCount: 1,
            needsPickCount: 1,
            cleanCount: 3,
            fileVersions: [
                {
                    path: "src/b.ts",
                    base: "base body",
                    versions: [
                        { workspaceId: "ws1", agent: "claude", content: "v1" },
                        { workspaceId: "ws2", agent: "crush", content: null, reason: "deleted" },
                    ],
                },
            ],
            convergeReady: false,
            summaryLine: "1/2 settled · 2 files contested · 1 auto-mergeable · 1 needs a pick",
            degraded: false,
        };
        const fetchMock = vi.fn().mockResolvedValue(completedSnapshot(snapshot));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setTaskGroup("grp1");
        await model.loadCockpit();

        expect(fetchMock).toHaveBeenCalledWith(
            CockpitUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ args: { taskGroup: "grp1" } }),
            })
        );
        const view = globalStore.get(model.snapshotAtom);
        expect(view).not.toBeNull();
        expect(view!.settledCount).toBe(1);
        expect(view!.totalCount).toBe(2);
        expect(view!.autoMergeableCount).toBe(1);
        expect(view!.needsPickCount).toBe(1);
        expect(view!.cleanCount).toBe(3);
        expect(view!.agents).toHaveLength(2);
        expect(view!.contested.map((c) => c.path)).toEqual(["src/a.ts", "src/b.ts"]);
        expect(view!.contested[1].reason).toBe("overlap");
        expect(view!.fileVersions[0].versions[1]).toEqual({
            workspaceId: "ws2",
            agent: "crush",
            content: null,
            reason: "deleted",
        });
        expect(view!.convergeReady).toBe(false);
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("reflects convergeReady:true straight from a fully-settled snapshot", async () => {
        const snapshot = {
            taskGroup: "grp2",
            agents: [
                { workspaceId: "ws1", kind: "claude", state: "review_ready", settled: true, nativeStatus: true },
                { workspaceId: "ws2", kind: "codex", state: "review_ready", settled: true, nativeStatus: true },
            ],
            settledCount: 2,
            totalCount: 2,
            contested: [],
            autoMergeableCount: 0,
            needsPickCount: 0,
            cleanCount: 4,
            fileVersions: [],
            convergeReady: true,
            summaryLine: "2/2 settled · 0 files contested · 0 auto-mergeable · 0 needs a pick",
            degraded: false,
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.loadCockpit("grp2");

        expect(globalStore.get(model.snapshotAtom)!.convergeReady).toBe(true);
    });

    it("never fabricates counts: a degraded snapshot keeps truthful zeros + surfaces the reason", async () => {
        const snapshot = {
            taskGroup: "grp3",
            agents: [{ workspaceId: "ws1", kind: "claude", state: "working", settled: false, nativeStatus: true }],
            settledCount: 0,
            totalCount: 1,
            contested: [],
            autoMergeableCount: 0,
            needsPickCount: 0,
            cleanCount: 0,
            fileVersions: [],
            convergeReady: false,
            summaryLine: "0/1 settled · convergence unavailable (convergence needs ≥2 panes (found 1))",
            degraded: true,
            reason: "convergence needs ≥2 panes (found 1)",
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.loadCockpit("grp3");

        const view = globalStore.get(model.snapshotAtom);
        expect(view!.degraded).toBe(true);
        expect(view!.autoMergeableCount).toBe(0);
        expect(view!.needsPickCount).toBe(0);
        expect(globalStore.get(model.noticeAtom)).toBe("convergence needs ≥2 panes (found 1)");
    });

    it("shows an honest miss notice with no snapshot when the group resolves null", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(null)));

        const model = makeModel();
        await model.loadCockpit("unknown-grp");

        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toContain("No convergence group");
    });

    it("surfaces a policy denial from the governed edge without a fabricated snapshot", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(ok({ status: "denied", risk: "medium", reason: "cockpit denied by policy" }))
        );

        const model = makeModel();
        await model.loadCockpit("grp4");

        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("cockpit denied by policy");
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
        await model.loadCockpit("grp5");

        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("MCP server not registered: conductor");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.loadCockpit("grp6");

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });

    it("clears the panel on an empty group without issuing any request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.loadCockpit("   ");

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.snapshotAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("");
    });
});

describe("RecoderFanoutViewModel.launch", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts the fan-out body and pins the returned taskGroup, then reloads the cockpit", async () => {
        const fanoutResult = {
            status: "completed",
            risk: "high",
            result: {
                taskGroup: "grp-new",
                workspaceIds: ["ws1", "ws2"],
                converged: { workspaceId: "wsc", branch: "converge/grp-new" },
                perAgent: [
                    { kind: "claude", nativeStatus: true, workspaceId: "ws1", settled: true, reason: "review_ready" },
                    { kind: "codex", nativeStatus: true, workspaceId: "ws2", settled: true, reason: "review_ready" },
                ],
            },
            auditEventId: "e",
        };
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == FanoutUrl) {
                return Promise.resolve(ok(fanoutResult));
            }
            return Promise.resolve(completedSnapshot(null));
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setRepoPath("/repo");
        model.setSpaceId("space1");
        model.setProjectId("proj1");
        await model.launch("build the thing", ["claude", "codex"]);

        expect(fetchMock).toHaveBeenCalledWith(
            FanoutUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    args: {
                        task: "build the thing",
                        agentKinds: ["claude", "codex"],
                        repoPath: "/repo",
                        spaceId: "space1",
                        projectId: "proj1",
                    },
                }),
            })
        );
        const result = globalStore.get(model.launchResultAtom);
        expect(result!.taskGroup).toBe("grp-new");
        expect(result!.converged).toEqual({ workspaceId: "wsc", branch: "converge/grp-new" });
        expect(globalStore.get(model.taskGroupAtom)).toBe("grp-new");
        expect(fetchMock).toHaveBeenCalledWith(CockpitUrl, expect.objectContaining({ method: "POST" }));
    });

    it("fails fast with a truthful notice and posts nothing when fewer than two agents are picked", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setRepoPath("/repo");
        model.setSpaceId("space1");
        model.setProjectId("proj1");
        await model.launch("build", ["claude"]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.launchNoticeAtom)).toContain("at least 2");
    });

    it("fails fast with a truthful notice when the governed context is missing", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.launch("build", ["claude", "codex"]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.launchNoticeAtom)).toContain("required");
    });

    it("surfaces the tool's input-validation refusal verbatim without a launch result", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                ok({
                    status: "completed",
                    risk: "high",
                    result: { ok: false, error: "unknown agent kind 'bogus'" },
                    auditEventId: "e",
                })
            )
        );

        const model = makeModel();
        model.setRepoPath("/repo");
        model.setSpaceId("space1");
        model.setProjectId("proj1");
        await model.launch("build", ["claude", "codex"]);

        expect(globalStore.get(model.launchResultAtom)).toBeNull();
        expect(globalStore.get(model.launchNoticeAtom)).toBe("unknown agent kind 'bogus'");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        model.setRepoPath("/repo");
        model.setSpaceId("space1");
        model.setProjectId("proj1");
        await model.launch("build", ["claude", "codex"]);

        expect(globalStore.get(model.launchNoticeAtom)).toBe("Not connected.");
        expect(globalStore.get(model.launchResultAtom)).toBeNull();
        expect(globalStore.get(model.launchingAtom)).toBe(false);
    });
});
