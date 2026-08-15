// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

const { createBlockMock } = vi.hoisted(() => ({ createBlockMock: vi.fn().mockResolvedValue("blk-1") }));

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore(), createBlock: createBlockMock };
});

vi.mock("./recoder-fanout", () => ({
    RecoderFanoutView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderFanoutViewModel, cockpitPollDelayMs, resolveConvergeSelection } from "./recoder-fanout-model";

const CockpitUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_converge_cockpit/call";
const FanoutUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_converge_fanout/call";
const ReFanUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_converge_refan/call";
const ComposeUrl = "http://127.0.0.1:3100/api/conductor/workspaces/compare/grp-ready/converge";

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

describe("RecoderFanoutViewModel.reFan", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // A completed re-fan read carrying the tool's ReFanResult straight back.
    function completedReFan(result: unknown) {
        return ok({ status: "completed", risk: "high", result, auditEventId: "e" });
    }

    // A pinned round-1 group + governed launch context — the preconditions the re-fan needs.
    function primed(): RecoderFanoutViewModel {
        const model = makeModel();
        model.setTaskGroup("fan-round1");
        model.setRepoPath("/repo");
        model.setSpaceId("space1");
        model.setProjectId("proj1");
        return model;
    }

    it("posts the pinned group + narrowed task + kinds, then pins the new round-2 group and reloads", async () => {
        const refanResult = {
            refused: false,
            priorTaskGroup: "fan-round1",
            priorConverge: { workspaceId: "ws_r1", branch: "recoder/converge-abcd" },
            provenanceLink: { fromTaskGroup: "fan-round1", sourceCount: 3, fileCount: 5, assistedPaths: ["src/x.ts"] },
            taskGroup: "fan-round2",
            workspaceIds: ["ws_c", "ws_x"],
            converged: { workspaceId: "ws_r2", branch: "recoder/converge-r2" },
            perAgent: [
                { kind: "claude", nativeStatus: true, workspaceId: "ws_c", settled: true, reason: "review_ready" },
                { kind: "codex", nativeStatus: true, workspaceId: "ws_x", settled: true, reason: "review_ready" },
            ],
        };
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ReFanUrl) {
                return Promise.resolve(completedReFan(refanResult));
            }
            return Promise.resolve(completedSnapshot(null));
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.reFan("narrow it down", ["claude", "codex"]);

        expect(fetchMock).toHaveBeenCalledWith(
            ReFanUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    args: {
                        taskGroup: "fan-round1",
                        narrowedTask: "narrow it down",
                        agentKinds: ["claude", "codex"],
                        repoPath: "/repo",
                        spaceId: "space1",
                        projectId: "proj1",
                    },
                }),
            })
        );
        const result = globalStore.get(model.refanResultAtom);
        expect(result!.refused).toBe(false);
        expect(result!.priorTaskGroup).toBe("fan-round1");
        expect(result!.newTaskGroup).toBe("fan-round2");
        expect(result!.converged).toEqual({ workspaceId: "ws_r2", branch: "recoder/converge-r2" });
        expect(result!.provenanceLink).toEqual({
            fromTaskGroup: "fan-round1",
            sourceCount: 3,
            fileCount: 5,
            assistedPaths: ["src/x.ts"],
        });
        expect(globalStore.get(model.taskGroupAtom)).toBe("fan-round2");
        expect(fetchMock).toHaveBeenCalledWith(CockpitUrl, expect.objectContaining({ method: "POST" }));
        expect(globalStore.get(model.refanNoticeAtom)).toBe("");
    });

    it("surfaces a no-prior-convergence refusal VERBATIM with no fabricated branch and no re-pin", async () => {
        const reason =
            "no prior converged branch exists for task group 'fan-round1' — nothing to re-fan from (run recoder_converge_fanout first)";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(completedReFan({ refused: true, priorTaskGroup: "fan-round1", reason }))
        );

        const model = primed();
        await model.reFan("narrow it down", ["claude", "codex"]);

        const result = globalStore.get(model.refanResultAtom);
        expect(result!.refused).toBe(true);
        expect(result!.converged).toBeNull();
        expect(result!.newTaskGroup).toBeNull();
        expect(result!.reason).toBe(reason);
        expect(globalStore.get(model.refanNoticeAtom)).toBe(reason);
        expect(globalStore.get(model.taskGroupAtom)).toBe("fan-round1");
    });

    it("keeps a truthful converged:null + reason when the second round settles <2 done", async () => {
        const refanResult = {
            refused: false,
            priorTaskGroup: "fan-round1",
            priorConverge: { workspaceId: "ws_r1", branch: "recoder/converge-abcd" },
            provenanceLink: null,
            taskGroup: "fan-round2",
            workspaceIds: ["ws_c"],
            converged: null,
            convergeReason: "convergence needs ≥2 panes (found 1)",
            perAgent: [{ kind: "claude", nativeStatus: true, workspaceId: "ws_c", settled: true, reason: "review_ready" }],
        };
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ReFanUrl) {
                return Promise.resolve(completedReFan(refanResult));
            }
            return Promise.resolve(completedSnapshot(null));
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.reFan("narrow it down", ["claude", "codex"]);

        const result = globalStore.get(model.refanResultAtom);
        expect(result!.refused).toBe(false);
        expect(result!.converged).toBeNull();
        expect(result!.newTaskGroup).toBe("fan-round2");
        expect(globalStore.get(model.refanNoticeAtom)).toBe("convergence needs ≥2 panes (found 1)");
        expect(globalStore.get(model.taskGroupAtom)).toBe("fan-round2");
    });

    it("surfaces a truthful notice on a non-2xx (conductor MCP not registered) with no re-pin", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: async () => ({ error: { message: "MCP server not registered: conductor" } }),
            })
        );

        const model = primed();
        await model.reFan("narrow it down", ["claude", "codex"]);

        expect(globalStore.get(model.refanResultAtom)).toBeNull();
        expect(globalStore.get(model.refanNoticeAtom)).toBe("MCP server not registered: conductor");
        expect(globalStore.get(model.taskGroupAtom)).toBe("fan-round1");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = primed();
        await model.reFan("narrow it down", ["claude", "codex"]);

        expect(globalStore.get(model.refanNoticeAtom)).toBe("Not connected.");
        expect(globalStore.get(model.refanResultAtom)).toBeNull();
        expect(globalStore.get(model.refanningAtom)).toBe(false);
    });

    it("issues no request when no round-1 group is pinned", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setRepoPath("/repo");
        model.setSpaceId("space1");
        model.setProjectId("proj1");
        await model.reFan("narrow it down", ["claude", "codex"]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.refanNoticeAtom)).toContain("round-1");
    });

    it("fails fast without a request when fewer than two agents are picked", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.reFan("narrow it down", ["claude"]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.refanNoticeAtom)).toContain("at least 2");
    });
});

describe("RecoderFanoutViewModel.converge", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        createBlockMock.mockClear();
    });

    // A convergeReady snapshot for the pinned group `grp-ready`, carrying one
    // synthesizable contested path so the compose selection is asserted end-to-end.
    function readySnapshot(convergeReady: boolean) {
        return {
            taskGroup: "grp-ready",
            agents: [
                { workspaceId: "ws1", kind: "claude", state: "review_ready", settled: true, nativeStatus: true },
                { workspaceId: "ws2", kind: "codex", state: "review_ready", settled: true, nativeStatus: true },
            ],
            settledCount: 2,
            totalCount: 2,
            contested: [{ path: "src/a.ts", agents: ["ws1", "ws2"], synthesizable: true }],
            autoMergeableCount: 1,
            needsPickCount: 0,
            cleanCount: 3,
            fileVersions: [],
            convergeReady,
            summaryLine: "2/2 settled · 1 auto-mergeable · 0 needs a pick",
            degraded: false,
        };
    }

    // The compose edge envelope: `{ data: { convergence: { workspaceId, branch } } }`.
    function composeOk(convergence: unknown) {
        return ok({ convergence });
    }

    // Pin `grp-ready` + load a cockpit snapshot (ready or not) so converge() has state.
    async function primeReady(model: RecoderFanoutViewModel, fetchMock: ReturnType<typeof vi.fn>) {
        vi.stubGlobal("fetch", fetchMock);
        model.setTaskGroup("grp-ready");
        await model.loadCockpit();
    }

    function composeCalls(fetchMock: ReturnType<typeof vi.fn>) {
        return fetchMock.mock.calls.filter((c) => String(c[0]) == ComposeUrl);
    }

    it("posts the compose edge for the pinned group with a synthesize selection, then pins the converged branch", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ComposeUrl) {
                return Promise.resolve(composeOk({ workspaceId: "ws-converged", branch: "recoder/converge-ready" }));
            }
            return Promise.resolve(completedSnapshot(readySnapshot(true)));
        });

        const model = makeModel();
        await primeReady(model, fetchMock);
        await model.converge();

        expect(fetchMock).toHaveBeenCalledWith(
            ComposeUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ selection: { "src/a.ts": "@synthesize" } }),
            })
        );
        expect(globalStore.get(model.convergedAtom)).toEqual({
            workspaceId: "ws-converged",
            branch: "recoder/converge-ready",
        });
        expect(globalStore.get(model.convergeNoticeAtom)).toBe("");
        expect(globalStore.get(model.convergingAtom)).toBe(false);
    });

    it("surfaces a backend refusal verbatim and never fabricates a branch", async () => {
        const reason = "converge conflict: src/a.ts needs a pick";
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ComposeUrl) {
                return Promise.resolve({
                    ok: false,
                    status: 409,
                    json: async () => ({ error: { message: reason } }),
                });
            }
            return Promise.resolve(completedSnapshot(readySnapshot(true)));
        });

        const model = makeModel();
        await primeReady(model, fetchMock);
        await model.converge();

        expect(composeCalls(fetchMock)).toHaveLength(1);
        expect(globalStore.get(model.convergedAtom)).toBeNull();
        expect(globalStore.get(model.convergeNoticeAtom)).toBe(reason);
        expect(globalStore.get(model.convergingAtom)).toBe(false);
    });

    it("degrades truthfully on a transport failure without fabricating a branch", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ComposeUrl) {
                return Promise.reject(new Error("ECONNREFUSED"));
            }
            return Promise.resolve(completedSnapshot(readySnapshot(true)));
        });

        const model = makeModel();
        await primeReady(model, fetchMock);
        await model.converge();

        expect(composeCalls(fetchMock)).toHaveLength(1);
        expect(globalStore.get(model.convergedAtom)).toBeNull();
        expect(globalStore.get(model.convergeNoticeAtom)).toContain("Converge unavailable");
    });

    it("is a no-op when the snapshot is not convergeReady", async () => {
        const fetchMock = vi.fn().mockResolvedValue(completedSnapshot(readySnapshot(false)));

        const model = makeModel();
        await primeReady(model, fetchMock);
        await model.converge();

        expect(composeCalls(fetchMock)).toHaveLength(0);
        expect(globalStore.get(model.convergedAtom)).toBeNull();
    });

    it("is a no-op the second time — an already-converged group composes only once", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ComposeUrl) {
                return Promise.resolve(composeOk({ workspaceId: "ws-converged", branch: "recoder/converge-ready" }));
            }
            return Promise.resolve(completedSnapshot(readySnapshot(true)));
        });

        const model = makeModel();
        await primeReady(model, fetchMock);
        await model.converge();
        await model.converge();

        expect(composeCalls(fetchMock)).toHaveLength(1);
    });

    it("openConvergedReview opens the unified review surface for the workspace id", () => {
        const model = makeModel();
        model.openConvergedReview("ws-converged");

        expect(createBlockMock).toHaveBeenCalledWith({
            meta: {
                view: "recoder-detail",
                "recoder:detailface": "review",
                "recoder:workspaceid": "ws-converged",
            },
        });
    });

    it("openConvergedReview opens nothing for an empty id", () => {
        const model = makeModel();
        model.openConvergedReview("   ");

        expect(createBlockMock).not.toHaveBeenCalled();
    });
});

describe("cockpitPollDelayMs (adaptive live cadence)", () => {
    const settled = { settledCount: 2, totalCount: 2 } as never;
    const working = { settledCount: 1, totalCount: 2 } as never;

    it("polls FAST (2.5s) while any pane is still working", () => {
        expect(cockpitPollDelayMs(working, null)).toBe(2500);
    });

    it("polls NORMAL (6s) once every pane has settled", () => {
        expect(cockpitPollDelayMs(settled, null)).toBe(6000);
        expect(cockpitPollDelayMs(null, null)).toBe(6000);
    });

    it("STOPS (0) once the group has converged — the branch is terminal", () => {
        expect(cockpitPollDelayMs(working, { workspaceId: "ws-c", branch: "b" })).toBe(0);
    });
});

describe("resolveConvergeSelection (contested-file picks)", () => {
    it("auto-synthesizes a synthesizable path and marks a non-synthesizable one unresolved", () => {
        const { selection, unresolved } = resolveConvergeSelection(
            [
                { path: "src/auto.ts", agents: ["ws1", "ws2"], synthesizable: true },
                { path: "src/pick.ts", agents: ["ws1", "ws2"], synthesizable: false },
            ],
            {},
        );
        expect(selection).toEqual({ "src/auto.ts": "@synthesize" });
        expect(unresolved).toEqual(["src/pick.ts"]);
    });

    it("honors the dev's pick (a sibling workspaceId) over the auto default", () => {
        const { selection, unresolved } = resolveConvergeSelection(
            [
                { path: "src/auto.ts", agents: ["ws1", "ws2"], synthesizable: true },
                { path: "src/pick.ts", agents: ["ws1", "ws2"], synthesizable: false },
            ],
            { "src/auto.ts": "ws2", "src/pick.ts": "ws1" },
        );
        expect(selection).toEqual({ "src/auto.ts": "ws2", "src/pick.ts": "ws1" });
        expect(unresolved).toEqual([]);
    });
});

describe("RecoderFanoutViewModel contested-file picker", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        createBlockMock.mockClear();
    });

    // A convergeReady snapshot carrying ONE non-synthesizable contested path that
    // requires a human pick before converge can resolve it.
    function needsPickSnapshot() {
        return {
            taskGroup: "grp-ready",
            agents: [
                { workspaceId: "ws1", kind: "claude", state: "review_ready", settled: true, nativeStatus: true },
                { workspaceId: "ws2", kind: "codex", state: "review_ready", settled: true, nativeStatus: true },
            ],
            settledCount: 2,
            totalCount: 2,
            contested: [{ path: "src/pick.ts", agents: ["ws1", "ws2"], synthesizable: false }],
            autoMergeableCount: 0,
            needsPickCount: 1,
            cleanCount: 0,
            fileVersions: [],
            convergeReady: true,
            summaryLine: "2/2 settled · 0 auto-mergeable · 1 needs a pick",
            degraded: false,
        };
    }

    async function primeNeedsPick(model: RecoderFanoutViewModel) {
        const fetchMock = vi.fn().mockResolvedValue(completedSnapshot(needsPickSnapshot()));
        vi.stubGlobal("fetch", fetchMock);
        model.setTaskGroup("grp-ready");
        await model.loadCockpit();
        return fetchMock;
    }

    it("blocks converge with a truthful 'needs a pick' notice and never posts", async () => {
        const model = makeModel();
        const fetchMock = await primeNeedsPick(model);
        fetchMock.mockClear();

        await model.converge();

        expect(fetchMock.mock.calls.filter((c) => String(c[0]) == ComposeUrl)).toHaveLength(0);
        expect(globalStore.get(model.convergeNoticeAtom)).toContain("need a pick");
        expect(globalStore.get(model.convergeNoticeAtom)).toContain("src/pick.ts");
        expect(globalStore.get(model.convergedAtom)).toBeNull();
    });

    it("posts the dev's pick once selected, then pins the converged branch", async () => {
        const model = makeModel();
        await primeNeedsPick(model);

        model.setContestedSelection("src/pick.ts", "ws1");

        const composeMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ComposeUrl) {
                return Promise.resolve(ok({ convergence: { workspaceId: "ws-c", branch: "recoder/converge-ready" } }));
            }
            return Promise.resolve(completedSnapshot(needsPickSnapshot()));
        });
        vi.stubGlobal("fetch", composeMock);

        await model.converge();

        expect(composeMock).toHaveBeenCalledWith(
            ComposeUrl,
            expect.objectContaining({ body: JSON.stringify({ selection: { "src/pick.ts": "ws1" } }) }),
        );
        expect(globalStore.get(model.convergedAtom)).toEqual({ workspaceId: "ws-c", branch: "recoder/converge-ready" });
    });

    it("setContestedSelection updates immutably and an empty value clears the pick", () => {
        const model = makeModel();
        model.setContestedSelection("src/pick.ts", "ws1");
        expect(globalStore.get(model.contestedSelectionAtom)).toEqual({ "src/pick.ts": "ws1" });
        model.setContestedSelection("src/pick.ts", "");
        expect(globalStore.get(model.contestedSelectionAtom)).toEqual({});
    });

    it("flows an @assisted (AI-merge) choice through converge as the file's selection", async () => {
        const model = makeModel();
        await primeNeedsPick(model);

        model.setContestedSelection("src/pick.ts", "@assisted");

        const composeMock = vi.fn().mockImplementation((url: string) => {
            if (String(url) == ComposeUrl) {
                return Promise.resolve(ok({ convergence: { workspaceId: "ws-c", branch: "recoder/converge-ready" } }));
            }
            return Promise.resolve(completedSnapshot(needsPickSnapshot()));
        });
        vi.stubGlobal("fetch", composeMock);

        await model.converge();

        expect(composeMock).toHaveBeenCalledWith(
            ComposeUrl,
            expect.objectContaining({ body: JSON.stringify({ selection: { "src/pick.ts": "@assisted" } }) }),
        );
    });
});
