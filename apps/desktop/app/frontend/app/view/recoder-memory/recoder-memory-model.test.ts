// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-memory", () => ({
    RecoderMemoryView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderMemoryViewModel } from "./recoder-memory-model";

const AcceptUrl = "http://127.0.0.1:3100/api/agent-os/memory/candidates/c1/accept";
const RejectUrl = "http://127.0.0.1:3100/api/agent-os/memory/candidates/c1/reject";

function makeModel(): RecoderMemoryViewModel {
    return new RecoderMemoryViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Both memory edges reply with the sendSuccess envelope around a BARE array
// (no combined {items,candidates} shape exists on the backend).
function mockMemoryFetch(items: unknown, candidates: unknown) {
    return vi.fn().mockImplementation((url: string) => {
        const data = String(url).endsWith("/api/agent-os/memory/items") ? items : candidates;
        return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data }),
        });
    });
}

describe("RecoderMemoryViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads items and candidates from their bare-array edges", async () => {
        const item = { memoryId: "m1", scope: "repo", title: "fact", body: "b", status: "active" };
        const candidate = {
            candidateId: "c1",
            scope: "repo",
            title: "pending",
            body: "b",
            status: "candidate_created",
            proposedBy: "agent",
        };
        const fetchMock = mockMemoryFetch([item], [candidate]);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/agent-os/memory/items");
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/agent-os/memory/candidates");
        expect(globalStore.get(model.itemsAtom)).toEqual([item]);
        expect(globalStore.get(model.candidatesAtom)).toEqual([candidate]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("keeps only pending candidates (candidate_created/reviewed)", async () => {
        const pending = { candidateId: "c1", status: "candidate_created" };
        const reviewed = { candidateId: "c2", status: "reviewed" };
        const accepted = { candidateId: "c3", status: "accepted" };
        vi.stubGlobal("fetch", mockMemoryFetch([], [pending, reviewed, accepted]));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.candidatesAtom)).toEqual([pending, reviewed]);
    });

    it("tolerates a non-array data payload without crashing", async () => {
        vi.stubGlobal("fetch", mockMemoryFetch({ items: [] }, null));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.itemsAtom)).toEqual([]);
        expect(globalStore.get(model.candidatesAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("surfaces a truthful error when either edge answers non-2xx", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if (String(url).endsWith("/api/agent-os/memory/items")) {
                    return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
                }
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
            })
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.errorAtom)).toBe("Memory unavailable (503)");
    });

    it("degrades to disconnected on transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.itemsAtom)).toEqual([]);
        expect(globalStore.get(model.candidatesAtom)).toEqual([]);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});

function okJson(data: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

describe("RecoderMemoryViewModel.acceptCandidate", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts to /candidates/:id/accept, reports the promotion, then refreshes", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ promoted: true, verdict: { effect: "allow", reason: "ok" } });
            }
            return okJson([]);
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.acceptCandidate("c1");

        expect(fetchMock).toHaveBeenCalledWith(AcceptUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/agent-os/memory/candidates");
        expect(globalStore.get(model.actionNoticeAtom)).toBe("Promoted to durable memory.");
        expect(globalStore.get(model.actionErrorAtom)).toBe("");
        expect(globalStore.get(model.actingAtom)).toBe("");
    });

    it("never fabricates a promotion: a needs_approval verdict surfaces the pending outcome", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({
                    promoted: false,
                    verdict: { effect: "needs_approval", reason: "awaiting reviewer" },
                });
            }
            return okJson([]);
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.acceptCandidate("c1");

        expect(globalStore.get(model.actionNoticeAtom)).toBe("awaiting reviewer");
        expect(globalStore.get(model.actionErrorAtom)).toBe("");
    });

    it("reports a policy denial truthfully without promoting", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ promoted: false, verdict: { effect: "deny", reason: "" } });
            }
            return okJson([]);
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.acceptCandidate("c1");

        expect(globalStore.get(model.actionNoticeAtom)).toBe("Accept was not permitted by policy.");
    });

    it("surfaces a truthful action error on non-2xx and does not refresh", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.acceptCandidate("c1");

        expect(globalStore.get(model.actionErrorAtom)).toBe("Could not accept (403)");
        expect(globalStore.get(model.actingAtom)).toBe("");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("surfaces the transport error message on fetch failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.acceptCandidate("c1");

        expect(globalStore.get(model.actionErrorAtom)).toBe("ECONNREFUSED");
        expect(globalStore.get(model.actingAtom)).toBe("");
    });
});

describe("RecoderMemoryViewModel.rejectCandidate", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts a reason to /candidates/:id/reject, then refreshes", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return okJson({ candidate: { candidateId: "c1", status: "rejected" } });
            }
            return okJson([]);
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.rejectCandidate("c1");

        expect(fetchMock).toHaveBeenCalledWith(
            RejectUrl,
            expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Rejected by reviewer" }) })
        );
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/agent-os/memory/candidates");
        expect(globalStore.get(model.actionNoticeAtom)).toBe("Candidate rejected.");
        expect(globalStore.get(model.actingAtom)).toBe("");
    });

    it("surfaces a truthful action error on non-2xx and does not refresh", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.rejectCandidate("c1");

        expect(globalStore.get(model.actionErrorAtom)).toBe("Could not reject (404)");
        expect(globalStore.get(model.actingAtom)).toBe("");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
