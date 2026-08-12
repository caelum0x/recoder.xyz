// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-swarm", () => ({
    RecoderSwarmView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderSwarmViewModel } from "./recoder-swarm-model";

const CockpitUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_converge_cockpit/call";
const UnblockUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_swarm_unblock/call";

function makeModel(): RecoderSwarmViewModel {
    return new RecoderSwarmViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a governed-edge `data` envelope in the sendSuccess shape the edge returns.
function ok(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

// A completed cockpit read carrying the tool's `{ snapshot }` result.
function completedSnapshot(snapshot: unknown) {
    return ok({ status: "completed", risk: "low", result: { snapshot }, auditEventId: "e" });
}

// A completed unblock carrying the tool's own result object.
function completedUnblock(result: unknown) {
    return ok({ status: "completed", risk: "medium", result, auditEventId: "e" });
}

// A cockpit snapshot with a mixed set of pane states — only the blocked ones (an idle
// prompt / an approval wait) should survive the projection.
function mixedSnapshot() {
    return {
        taskGroup: "grp1",
        agents: [
            {
                workspaceId: "ws-blocked",
                kind: "claude",
                state: "agent_idle_prompt",
                settled: false,
                nativeStatus: true,
                question: "Which auth provider should I wire?",
            },
            { workspaceId: "ws-working", kind: "codex", state: "working", settled: false, nativeStatus: true },
            { workspaceId: "ws-done", kind: "cursor", state: "review_ready", settled: true, nativeStatus: true },
            {
                workspaceId: "ws-approve",
                kind: "crush",
                state: "awaiting_approval",
                settled: true,
                nativeStatus: false,
            },
        ],
        settledCount: 2,
        totalCount: 4,
        contested: [],
        autoMergeableCount: 0,
        needsPickCount: 0,
        cleanCount: 0,
        fileVersions: [],
        convergeReady: false,
        summaryLine: "2/4 settled",
        degraded: false,
    };
}

describe("RecoderSwarmViewModel.loadBlocked", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects only the blocked panes from the cockpit snapshot, in order, with truthful fields", async () => {
        const fetchMock = vi.fn().mockResolvedValue(completedSnapshot(mixedSnapshot()));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setTaskGroup("grp1");
        await model.loadBlocked();

        expect(fetchMock).toHaveBeenCalledWith(
            CockpitUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ args: { taskGroup: "grp1" } }),
            })
        );
        const blocked = globalStore.get(model.blockedAtom);
        expect(blocked).not.toBeNull();
        expect(blocked).toEqual([
            {
                workspaceId: "ws-blocked",
                agentKind: "claude",
                status: "agent_idle_prompt",
                question: "Which auth provider should I wire?",
                nativeStatus: true,
            },
            {
                workspaceId: "ws-approve",
                agentKind: "crush",
                status: "awaiting_approval",
                nativeStatus: false,
            },
        ]);
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("surfaces a truthful empty-list notice when a live group has no blocked panes", async () => {
        const snapshot = mixedSnapshot();
        snapshot.agents = snapshot.agents.filter((a) => a.state != "agent_idle_prompt" && a.state != "awaiting_approval");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.loadBlocked("grp1");

        expect(globalStore.get(model.blockedAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toContain("No blocked panes");
    });

    it("shows an honest miss notice with no list when the group resolves null", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(null)));

        const model = makeModel();
        await model.loadBlocked("unknown-grp");

        expect(globalStore.get(model.blockedAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toContain("No convergence group");
    });

    it("surfaces a degraded snapshot's reason verbatim while still projecting its blocked panes", async () => {
        const snapshot = mixedSnapshot();
        snapshot.degraded = true;
        (snapshot as Record<string, unknown>).reason = "convergence needs ≥2 panes (found 1)";
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedSnapshot(snapshot)));

        const model = makeModel();
        await model.loadBlocked("grp1");

        expect(globalStore.get(model.blockedAtom)).toHaveLength(2);
        expect(globalStore.get(model.noticeAtom)).toBe("convergence needs ≥2 panes (found 1)");
    });

    it("surfaces a policy denial from the governed edge without a fabricated list", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(ok({ status: "denied", risk: "medium", reason: "cockpit denied by policy" }))
        );

        const model = makeModel();
        await model.loadBlocked("grp1");

        expect(globalStore.get(model.blockedAtom)).toBeNull();
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
        await model.loadBlocked("grp1");

        expect(globalStore.get(model.blockedAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("MCP server not registered: conductor");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.loadBlocked("grp1");

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.blockedAtom)).toBeNull();
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });

    it("clears the panel on an empty group without issuing any request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.loadBlocked("   ");

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.blockedAtom)).toBeNull();
        expect(globalStore.get(model.noticeAtom)).toBe("");
    });
});

describe("RecoderSwarmViewModel.unblock", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("escalates by default: posts autoAnswer:false and projects the escalation outcome", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            completedUnblock({
                action: "escalated",
                requestId: "req-42",
                question: "Which auth provider?",
                reason: "auto-answer disabled by policy (escalate by default)",
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.unblock("ws-blocked");

        expect(fetchMock).toHaveBeenCalledWith(
            UnblockUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ args: { workspaceId: "ws-blocked", autoAnswer: false } }),
            })
        );
        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toEqual({
            action: "escalated",
            requestId: "req-42",
            question: "Which auth provider?",
            reason: "auto-answer disabled by policy (escalate by default)",
        });
        expect(outcome.notice).toBe("");
        expect(globalStore.get(model.unblockingAtom)["ws-blocked"]).toBe(false);
    });

    it("posts autoAnswer:true (and the shared taskGroup) when the toggle is on, projecting the answered outcome", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            completedUnblock({
                action: "answered",
                answer: "Use Better Auth on recoder.xyz",
                source: "sibling",
                question: "Which auth provider?",
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setTaskGroup("grp1");
        model.setAutoAnswer(true);
        await model.unblock("ws-blocked");

        expect(fetchMock).toHaveBeenCalledWith(
            UnblockUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ args: { workspaceId: "ws-blocked", taskGroup: "grp1", autoAnswer: true } }),
            })
        );
        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toEqual({
            action: "answered",
            answer: "Use Better Auth on recoder.xyz",
            source: "sibling",
            question: "Which auth provider?",
        });
        expect(outcome.notice).toBe("");
    });

    it("lets an explicit opt override the toggle without mutating the panel default", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            completedUnblock({ action: "escalated", requestId: "req-1", question: null, reason: "escalate" })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setAutoAnswer(true);
        await model.unblock("ws-blocked", { autoAnswer: false });

        expect(fetchMock).toHaveBeenCalledWith(
            UnblockUrl,
            expect.objectContaining({
                body: JSON.stringify({ args: { workspaceId: "ws-blocked", autoAnswer: false } }),
            })
        );
        expect(globalStore.get(model.autoAnswerAtom)).toBe(true);
    });

    it("surfaces a SERVICE_UNAVAILABLE from a failed gate verbatim (never hidden, no fabricated action)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                ok({
                    status: "failed",
                    risk: "medium",
                    reason: "SERVICE_UNAVAILABLE: swarm unblock is not wired",
                    error: "SERVICE_UNAVAILABLE: swarm unblock is not wired",
                    auditEventId: "e",
                })
            )
        );

        const model = makeModel();
        await model.unblock("ws-blocked");

        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toBeNull();
        expect(outcome.notice).toBe("SERVICE_UNAVAILABLE: swarm unblock is not wired");
    });

    it("surfaces a policy denial from the governed edge verbatim without an action", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(ok({ status: "denied", risk: "high", reason: "unblock denied by policy" }))
        );

        const model = makeModel();
        await model.unblock("ws-blocked");

        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toBeNull();
        expect(outcome.notice).toBe("unblock denied by policy");
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
        await model.unblock("ws-blocked");

        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toBeNull();
        expect(outcome.notice).toBe("MCP server not registered: conductor");
    });

    it("reports an unknown-workspace miss truthfully ({ workspace: null } → no action)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedUnblock({ workspace: null })));

        const model = makeModel();
        await model.unblock("ws-ghost");

        const outcome = globalStore.get(model.outcomeAtom)["ws-ghost"];
        expect(outcome.result).toBeNull();
        expect(outcome.notice).toBe("Workspace not found.");
    });

    it("surfaces the tool's input-validation error verbatim without an action", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedUnblock({ error: "workspaceId is required" })));

        const model = makeModel();
        await model.unblock("ws-blocked");

        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toBeNull();
        expect(outcome.notice).toBe("workspaceId is required");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.unblock("ws-blocked");

        const outcome = globalStore.get(model.outcomeAtom)["ws-blocked"];
        expect(outcome.result).toBeNull();
        expect(outcome.notice).toBe("Not connected.");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.unblockingAtom)["ws-blocked"]).toBe(false);
    });

    it("issues no request for an empty workspace id", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.unblock("   ");

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
