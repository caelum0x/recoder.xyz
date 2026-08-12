// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-playbooks", () => ({
    RecoderPlaybooksView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderPlaybooksViewModel } from "./recoder-playbooks-model";

const ListUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_playbook_list/call";
const RunUrl = "http://127.0.0.1:3100/api/mcp/tools/conductor/recoder_playbook_run/call";

function makeModel(): RecoderPlaybooksViewModel {
    return new RecoderPlaybooksViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a governed-edge `data` envelope in the sendSuccess shape the edge returns.
function ok(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

// A completed list read carrying the tool's array result straight back.
function completedList(entries: unknown) {
    return ok({ status: "completed", risk: "low", result: entries, auditEventId: "e" });
}

// A completed run read carrying the tool's PlaybookRunResult straight back.
function completedRun(result: unknown) {
    return ok({ status: "completed", risk: "high", result, auditEventId: "e" });
}

// A pinned governed launch context — the preconditions the run needs.
function primed(): RecoderPlaybooksViewModel {
    const model = makeModel();
    model.setRepoPath("/repo");
    model.setSpaceId("space1");
    model.setProjectId("proj1");
    return model;
}

describe("RecoderPlaybooksViewModel.loadList", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects the built-in playbooks into {id, description} and selects the first", async () => {
        const entries = [
            { id: "fan-converge", description: "Fan ONE task to N agents and auto-converge.", steps: ["fanout"] },
            {
                id: "fan-unblock-converge",
                description: "Fan, then swarm-unblock the blocked panes.",
                steps: ["fanout", "unblock_blocked"],
            },
            {
                id: "fan-converge-refan",
                description: "Fan, converge, then re-fan a narrowed follow-up.",
                steps: ["fanout", "re_fan"],
            },
        ];
        const fetchMock = vi.fn().mockResolvedValue(completedList(entries));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.loadList();

        expect(fetchMock).toHaveBeenCalledWith(
            ListUrl,
            expect.objectContaining({ method: "POST", body: JSON.stringify({ args: {} }) })
        );
        const list = globalStore.get(model.playbooksAtom);
        expect(list).toEqual([
            { id: "fan-converge", description: "Fan ONE task to N agents and auto-converge." },
            { id: "fan-unblock-converge", description: "Fan, then swarm-unblock the blocked panes." },
            { id: "fan-converge-refan", description: "Fan, converge, then re-fan a narrowed follow-up." },
        ]);
        expect(globalStore.get(model.selectedPlaybookAtom)).toBe("fan-converge");
        expect(globalStore.get(model.listNoticeAtom)).toBe("");
    });

    it("drops shapeless catalog entries instead of fabricating a fake recipe", async () => {
        const entries = [{ id: "fan-converge", description: "desc" }, { description: "no id" }, 42];
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedList(entries)));

        const model = makeModel();
        await model.loadList();

        expect(globalStore.get(model.playbooksAtom)).toEqual([{ id: "fan-converge", description: "desc" }]);
    });

    it("surfaces a truthful notice on a non-2xx (conductor MCP not registered) with no entries", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: async () => ({ error: { message: "MCP server not registered: conductor" } }),
            })
        );

        const model = makeModel();
        await model.loadList();

        expect(globalStore.get(model.playbooksAtom)).toEqual([]);
        expect(globalStore.get(model.listNoticeAtom)).toBe("MCP server not registered: conductor");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.loadList();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.playbooksAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.listLoadingAtom)).toBe(false);
    });
});

describe("RecoderPlaybooksViewModel.run", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts the pinned context + task + agentKinds and projects the ordered steps with their REAL statuses", async () => {
        const runResult = {
            playbookId: "fan-unblock-converge",
            taskGroup: "grp-new",
            steps: [
                { kind: "fanout", status: "ok" },
                {
                    kind: "unblock_blocked",
                    status: "ok",
                    unblock: [
                        { workspaceId: "ws1", result: { action: "escalated", requestId: "r1", question: null, reason: "no answer" } },
                        { workspaceId: "ws2", result: { action: "answered", answer: "yes", source: "memory", question: "ok?" } },
                    ],
                },
            ],
            converged: { workspaceId: "wsc", branch: "recoder/converge-grp-new" },
        };
        const fetchMock = vi.fn().mockResolvedValue(completedRun(runResult));
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.run({ playbookId: "fan-unblock-converge", task: "build the thing", agentKinds: ["claude", "codex"] });

        expect(fetchMock).toHaveBeenCalledWith(
            RunUrl,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    args: {
                        playbookId: "fan-unblock-converge",
                        task: "build the thing",
                        agentKinds: ["claude", "codex"],
                        repoPath: "/repo",
                        spaceId: "space1",
                        projectId: "proj1",
                    },
                }),
            })
        );
        const result = globalStore.get(model.runResultAtom);
        expect(result!.playbookId).toBe("fan-unblock-converge");
        expect(result!.steps.map((s) => `${s.kind}:${s.status}`)).toEqual(["fanout:ok", "unblock_blocked:ok"]);
        expect(result!.steps[1].unblock).toEqual([
            { workspaceId: "ws1", action: "escalated", faultReason: "" },
            { workspaceId: "ws2", action: "answered", faultReason: "" },
        ]);
        expect(result!.converged).toEqual({ workspaceId: "wsc", branch: "recoder/converge-grp-new" });
        expect(globalStore.get(model.taskGroupAtom)).toBe("grp-new");
        expect(globalStore.get(model.runNoticeAtom)).toBe("");
    });

    it("forwards the followupTask for the re-fan recipe", async () => {
        const runResult = {
            playbookId: "fan-converge-refan",
            taskGroup: "grp-r1",
            steps: [{ kind: "fanout", status: "ok" }, { kind: "re_fan", status: "ok" }],
            converged: { workspaceId: "wsc", branch: "recoder/converge-r2" },
        };
        const fetchMock = vi.fn().mockResolvedValue(completedRun(runResult));
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.run({
            playbookId: "fan-converge-refan",
            task: "build",
            agentKinds: ["claude", "codex"],
            followupTask: "tighten it",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            RunUrl,
            expect.objectContaining({
                body: JSON.stringify({
                    args: {
                        playbookId: "fan-converge-refan",
                        task: "build",
                        agentKinds: ["claude", "codex"],
                        repoPath: "/repo",
                        spaceId: "space1",
                        projectId: "proj1",
                        followupTask: "tighten it",
                    },
                }),
            })
        );
    });

    it("keeps a degraded step's real status + reason (never shown as ok)", async () => {
        const runResult = {
            playbookId: "fan-converge-refan",
            taskGroup: "grp-r1",
            steps: [
                { kind: "fanout", status: "ok" },
                {
                    kind: "re_fan",
                    status: "degraded",
                    reason: "no prior converged branch exists for task group 'grp-r1'",
                },
            ],
            converged: { workspaceId: "wsc", branch: "recoder/converge-grp-r1" },
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedRun(runResult)));

        const model = primed();
        await model.run({ playbookId: "fan-converge-refan", task: "build", agentKinds: ["claude", "codex"] });

        const result = globalStore.get(model.runResultAtom);
        expect(result!.steps[1].status).toBe("degraded");
        expect(result!.steps[1].reason).toBe("no prior converged branch exists for task group 'grp-r1'");
    });

    it("surfaces a truthful unblock fault per-pane (faultReason, no fabricated action)", async () => {
        const runResult = {
            playbookId: "fan-unblock-converge",
            taskGroup: "grp-f",
            steps: [
                { kind: "fanout", status: "ok" },
                {
                    kind: "unblock_blocked",
                    status: "degraded",
                    reason: "swarm-unblock faulted: SERVICE_UNAVAILABLE",
                    unblock: [{ workspaceId: "ws1", faultReason: "swarm-unblock faulted: SERVICE_UNAVAILABLE" }],
                },
            ],
            converged: { workspaceId: "wsc", branch: "recoder/converge-grp-f" },
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedRun(runResult)));

        const model = primed();
        await model.run({ playbookId: "fan-unblock-converge", task: "build", agentKinds: ["claude", "codex"] });

        const pane = globalStore.get(model.runResultAtom)!.steps[1].unblock[0];
        expect(pane).toEqual({ workspaceId: "ws1", action: "", faultReason: "swarm-unblock faulted: SERVICE_UNAVAILABLE" });
    });

    it("keeps converged:null + surfaces the convergeReason when nothing converged (no fabricated branch)", async () => {
        const runResult = {
            playbookId: "fan-converge",
            taskGroup: "grp-x",
            steps: [{ kind: "fanout", status: "degraded", reason: "convergence needs ≥2 panes (found 1)" }],
            converged: null,
            convergeReason: "convergence needs ≥2 panes (found 1)",
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completedRun(runResult)));

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        const result = globalStore.get(model.runResultAtom);
        expect(result!.converged).toBeNull();
        expect(result!.convergeReason).toBe("convergence needs ≥2 panes (found 1)");
        expect(globalStore.get(model.runNoticeAtom)).toBe("convergence needs ≥2 panes (found 1)");
        // A pinned taskGroup is fine, but NO branch was fabricated.
        expect(globalStore.get(model.taskGroupAtom)).toBe("grp-x");
    });

    it("surfaces the tool's input-validation refusal verbatim without a run result", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(completedRun({ ok: false, error: "unknown agent kind 'bogus'" }))
        );

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        expect(globalStore.get(model.runResultAtom)).toBeNull();
        expect(globalStore.get(model.runNoticeAtom)).toBe("unknown agent kind 'bogus'");
    });

    it("surfaces a SERVICE_UNAVAILABLE refusal verbatim (run seam unwired) with no result or pinned group", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                ok({
                    status: "failed",
                    risk: "high",
                    reason: "SERVICE_UNAVAILABLE: conductor playbook run seam is not wired",
                    auditEventId: "e",
                })
            )
        );

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        expect(globalStore.get(model.runResultAtom)).toBeNull();
        expect(globalStore.get(model.runNoticeAtom)).toBe(
            "SERVICE_UNAVAILABLE: conductor playbook run seam is not wired"
        );
        expect(globalStore.get(model.taskGroupAtom)).toBe("");
    });

    it("surfaces a policy denial from the governed edge without a fabricated run", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(ok({ status: "denied", risk: "high", reason: "playbook run denied by policy" }))
        );

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        expect(globalStore.get(model.runResultAtom)).toBeNull();
        expect(globalStore.get(model.runNoticeAtom)).toBe("playbook run denied by policy");
    });

    it("surfaces a truthful notice on a non-2xx (conductor MCP not registered) with no result", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: async () => ({ error: { message: "MCP server not registered: conductor" } }),
            })
        );

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        expect(globalStore.get(model.runResultAtom)).toBeNull();
        expect(globalStore.get(model.runNoticeAtom)).toBe("MCP server not registered: conductor");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        expect(globalStore.get(model.runNoticeAtom)).toBe("Not connected.");
        expect(globalStore.get(model.runResultAtom)).toBeNull();
        expect(globalStore.get(model.runningAtom)).toBe(false);
    });

    it("fails fast with a truthful notice and posts nothing when no playbook is selected", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.run({ playbookId: "", task: "build", agentKinds: ["claude", "codex"] });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.runNoticeAtom)).toContain("Pick a playbook");
    });

    it("fails fast without a request when the task is empty", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "   ", agentKinds: ["claude", "codex"] });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.runNoticeAtom)).toContain("task description");
    });

    it("fails fast without a request when fewer than two agents are picked", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = primed();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude"] });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.runNoticeAtom)).toContain("at least 2");
    });

    it("fails fast with a truthful notice when the governed context is missing", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.run({ playbookId: "fan-converge", task: "build", agentKinds: ["claude", "codex"] });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.runNoticeAtom)).toContain("required");
    });
});
