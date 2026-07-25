// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-approvals", () => ({
    RecoderApprovalsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderApprovalsViewModel, type RecoderApproval } from "./recoder-approvals-model";

const ListUrl = "http://127.0.0.1:3100/api/agent-os/approvals";

function makeModel(): RecoderApprovalsViewModel {
    return new RecoderApprovalsViewModel({ blockId: "b1" } as ViewModelInitType);
}

function makeApproval(overrides: Partial<RecoderApproval> = {}): RecoderApproval {
    return {
        id: "a1",
        action: "deploy",
        riskTier: "high",
        status: "pending",
        requestedBy: "agent-1",
        createdAt: "2026-07-25T12:00:00.000Z",
        ...overrides,
    };
}

function okJson(data: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

describe("RecoderApprovalsViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads the live envelope shape { data: { approvals: [...] } }", async () => {
        const approval = makeApproval();
        const fetchMock = vi.fn().mockImplementation(() => okJson({ approvals: [approval] }));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(ListUrl);
        expect(globalStore.get(model.approvalsAtom)).toEqual([approval]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });

    it("still accepts a bare array under data", async () => {
        const approval = makeApproval();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => okJson([approval]))
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.approvalsAtom)).toEqual([approval]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("keeps only pending approvals", async () => {
        const pending = makeApproval({ id: "a1", status: "pending" });
        const approved = makeApproval({ id: "a2", status: "approved" });
        const denied = makeApproval({ id: "a3", status: "denied" });
        const expired = makeApproval({ id: "a4", status: "expired" });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => okJson({ approvals: [pending, approved, denied, expired] }))
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.approvalsAtom)).toEqual([pending]);
    });

    it("tolerates a non-array data payload without crashing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => okJson({ nothing: "here" }))
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.approvalsAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("surfaces a truthful error when the edge answers non-2xx", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.errorAtom)).toBe("Approvals unavailable (503)");
    });

    it("prefers the backend error message when the error envelope carries one", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({ success: false, error: { message: "authentication required" } }),
            })
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.errorAtom)).toBe("authentication required");
    });

    it("degrades to disconnected on transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.approvalsAtom)).toEqual([]);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});

describe("RecoderApprovalsViewModel.decide", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("approves via POST /approvals/:id/decide with decision=approved, then refreshes", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ approval: makeApproval({ status: "approved" }) });
            }
            return okJson({ approvals: [] });
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.decide("a1", "approve");

        expect(fetchMock).toHaveBeenCalledWith(`${ListUrl}/a1/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "approved" }),
        });
        expect(fetchMock).toHaveBeenCalledWith(ListUrl);
        expect(globalStore.get(model.actionErrorAtom)).toBe("");
        expect(globalStore.get(model.actingAtom)).toBe("");
    });

    it("rejects by sending decision=denied (the backend vocabulary, not 'reject')", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ approval: makeApproval({ status: "denied" }) });
            }
            return okJson({ approvals: [] });
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.decide("a2", "reject");

        expect(fetchMock).toHaveBeenCalledWith(
            `${ListUrl}/a2/decide`,
            expect.objectContaining({ body: JSON.stringify({ decision: "denied" }) })
        );
    });

    it("surfaces a truthful action error on non-2xx and does not refresh", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.decide("a1", "approve");

        expect(globalStore.get(model.actionErrorAtom)).toBe("Could not approve (403)");
        expect(globalStore.get(model.actingAtom)).toBe("");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("surfaces the transport error message on fetch failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.decide("a1", "reject");

        expect(globalStore.get(model.actionErrorAtom)).toBe("ECONNREFUSED");
        expect(globalStore.get(model.actingAtom)).toBe("");
    });
});
