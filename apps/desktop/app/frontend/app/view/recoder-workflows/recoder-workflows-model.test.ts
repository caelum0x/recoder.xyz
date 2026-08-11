// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-workflows", () => ({
    RecoderWorkflowsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderWorkflowsViewModel } from "./recoder-workflows-model";

const WorkflowsUrl = "http://127.0.0.1:3100/api/agent-os/workflows";

function makeModel(): RecoderWorkflowsViewModel {
    return new RecoderWorkflowsViewModel({ blockId: "b1" } as ViewModelInitType);
}

function okFetch(data: unknown) {
    return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

describe("RecoderWorkflowsViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects workflows into node sequences and surfaces dispatchConfigured=true", async () => {
        const data = {
            dispatchConfigured: true,
            workflows: [
                {
                    workflowId: "verify-approve-ship",
                    name: "Verify → Approve → Ship",
                    version: "1.0.0",
                    nodes: [
                        { nodeId: "n1", kind: "verification", label: "Run verification", config: {} },
                        { nodeId: "n2", kind: "approval-wait", label: "Await approval", dependsOn: ["n1"], config: {} },
                        { nodeId: "n3", kind: "pull-request", label: "Open PR", dependsOn: ["n2"], config: {} },
                        { nodeId: "n4", kind: "deploy", label: "Deploy", dependsOn: ["n3"], config: {} },
                    ],
                },
            ],
        };
        const fetchMock = okFetch(data);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(WorkflowsUrl);
        expect(globalStore.get(model.dispatchConfiguredAtom)).toBe(true);
        expect(globalStore.get(model.workflowsAtom)).toEqual([
            {
                id: "verify-approve-ship",
                name: "Verify → Approve → Ship",
                nodeCount: 4,
                nodes: [
                    { name: "Run verification", kind: "verification" },
                    { name: "Await approval", kind: "approval-wait" },
                    { name: "Open PR", kind: "pull-request" },
                    { name: "Deploy", kind: "deploy" },
                ],
            },
        ]);
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("surfaces dispatchConfigured=false truthfully while still projecting workflows", async () => {
        const data = {
            dispatchConfigured: false,
            workflows: [
                {
                    workflowId: "wf1",
                    name: "Pipeline",
                    version: "1",
                    nodes: [{ nodeId: "a", kind: "agent", label: "Plan", config: {} }],
                },
            ],
        };
        vi.stubGlobal("fetch", okFetch(data));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.dispatchConfiguredAtom)).toBe(false);
        expect(globalStore.get(model.workflowsAtom)).toHaveLength(1);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("falls back to nodeId for a node with no label and drops workflows without identity", async () => {
        const data = {
            dispatchConfigured: true,
            workflows: [
                {
                    workflowId: "wf1",
                    name: "",
                    version: "1",
                    nodes: [
                        { nodeId: "step-1", kind: "tool", config: {} },
                        { nodeId: "", kind: "tool", label: "", config: {} },
                    ],
                },
                { workflowId: "", name: "", version: "1", nodes: [] },
            ],
        };
        vi.stubGlobal("fetch", okFetch(data));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.workflowsAtom)).toEqual([
            {
                id: "wf1",
                name: "wf1",
                nodeCount: 1,
                nodes: [{ name: "step-1", kind: "tool" }],
            },
        ]);
    });

    it("shows 'No workflows defined' when the catalog is empty", async () => {
        vi.stubGlobal("fetch", okFetch({ dispatchConfigured: false, workflows: [] }));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.workflowsAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("No workflows defined");
        expect(globalStore.get(model.dispatchConfiguredAtom)).toBe(false);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("surfaces the backend reason on a non-2xx response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ error: { message: "workflow store offline" } }),
            })
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.workflowsAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("workflow store offline");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.workflowsAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
