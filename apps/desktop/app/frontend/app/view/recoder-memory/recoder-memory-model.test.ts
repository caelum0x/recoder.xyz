// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

import { globalStore } from "@/app/store/global";
import { RecoderMemoryViewModel } from "./recoder-memory-model";

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
