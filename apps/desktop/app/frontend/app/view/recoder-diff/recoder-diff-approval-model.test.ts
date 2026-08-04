// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-diff", () => ({
    RecoderDiffView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { atom } from "jotai";
import type { RecoderApproval } from "../recoder-approvals/recoder-approvals-model";
import { RecoderDiffViewModel, type RecoderWorkspace } from "./recoder-diff-model";

const ApprovalsUrl = "http://127.0.0.1:3100/api/agent-os/approvals";

function makeModel(): RecoderDiffViewModel {
    const initOpts = {
        blockId: "b1",
        waveEnv: { wos: { getWaveObjectAtom: () => atom({} as Block) } },
    } as unknown as ViewModelInitType;
    return new RecoderDiffViewModel(initOpts);
}

function makeWorkspace(overrides: Partial<RecoderWorkspace> = {}): RecoderWorkspace {
    return {
        workspaceId: "ws-1",
        branch: "feat/x",
        state: "awaiting_approval",
        runtimeId: "claude_code",
        taskId: "task-1",
        runId: "run-1",
        ...overrides,
    };
}

function makeApproval(overrides: Partial<RecoderApproval> = {}): RecoderApproval {
    return {
        id: "a1",
        action: "command.run",
        riskTier: "high",
        status: "pending",
        requestedBy: "agent-1",
        reason: "run a shell command",
        runId: "run-1",
        taskId: "task-1",
        createdAt: "2026-08-04T12:00:00.000Z",
        ...overrides,
    };
}

function okJson(data: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

describe("RecoderDiffViewModel.refreshInlineApproval", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("shows the correlated pending approval when the run is awaiting_approval", async () => {
        const approval = makeApproval();
        const fetchMock = vi.fn().mockImplementation(() => okJson({ approvals: [approval] }));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [makeWorkspace()]);
        await model.refreshInlineApproval("ws-1");

        expect(fetchMock).toHaveBeenCalledWith(ApprovalsUrl);
        expect(globalStore.get(model.inlineApprovalAtom)).toEqual(approval);
    });

    it("does not read approvals and clears the card when the run is not awaiting_approval", async () => {
        const fetchMock = vi.fn().mockImplementation(() => okJson({ approvals: [makeApproval()] }));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.inlineApprovalAtom, makeApproval());
        globalStore.set(model.workspacesAtom, [makeWorkspace({ state: "running" })]);
        await model.refreshInlineApproval("ws-1");

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.inlineApprovalAtom)).toBeNull();
    });

    it("shows no card when awaiting_approval but nothing correlates", async () => {
        const unrelated = makeApproval({ id: "a2", runId: "run-9", taskId: "task-9" });
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => okJson({ approvals: [unrelated] })));

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [makeWorkspace()]);
        await model.refreshInlineApproval("ws-1");

        expect(globalStore.get(model.inlineApprovalAtom)).toBeNull();
    });

    it("degrades to no card (never a fake) when the approvals edge answers non-2xx", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [makeWorkspace()]);
        await model.refreshInlineApproval("ws-1");

        expect(globalStore.get(model.inlineApprovalAtom)).toBeNull();
    });

    it("degrades to no card on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [makeWorkspace()]);
        await model.refreshInlineApproval("ws-1");

        expect(globalStore.get(model.inlineApprovalAtom)).toBeNull();
    });
});

describe("RecoderDiffViewModel.decideInlineApproval", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("approves via POST /approvals/:id/decide with decision=approved, then clears the card", async () => {
        const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ approval: makeApproval({ status: "approved" }) });
            }
            return okJson({ workspaces: [] });
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.inlineApprovalAtom, makeApproval());
        await model.decideInlineApproval("approve");

        expect(fetchMock).toHaveBeenCalledWith(`${ApprovalsUrl}/a1/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "approved" }),
        });
        expect(globalStore.get(model.inlineApprovalAtom)).toBeNull();
        expect(globalStore.get(model.approvalErrorAtom)).toBe("");
        expect(globalStore.get(model.approvalDecidingAtom)).toBe(false);
    });

    it("rejects by sending decision=denied (the governance vocabulary, not 'reject')", async () => {
        const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ approval: makeApproval({ status: "denied" }) });
            }
            return okJson({ workspaces: [] });
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.inlineApprovalAtom, makeApproval({ id: "a2" }));
        await model.decideInlineApproval("reject");

        expect(fetchMock).toHaveBeenCalledWith(
            `${ApprovalsUrl}/a2/decide`,
            expect.objectContaining({ body: JSON.stringify({ decision: "denied" }) })
        );
    });

    it("surfaces a truthful error and KEEPS the card when the decide fails (never a fake approve)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        const approval = makeApproval();
        globalStore.set(model.inlineApprovalAtom, approval);
        await model.decideInlineApproval("approve");

        expect(globalStore.get(model.approvalErrorAtom)).toBe("Could not approve (403)");
        expect(globalStore.get(model.inlineApprovalAtom)).toEqual(approval);
        expect(globalStore.get(model.approvalDecidingAtom)).toBe(false);
        // Only the decide POST fired — a failed decision never triggers the refresh.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when there is no card to decide", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.inlineApprovalAtom, null);
        await model.decideInlineApproval("approve");

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
