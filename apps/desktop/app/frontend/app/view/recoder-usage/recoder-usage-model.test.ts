// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-usage", () => ({
    RecoderUsageView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderUsageViewModel } from "./recoder-usage-model";

const UsageUrl = "http://127.0.0.1:3100/api/gateway/inference/usage";

function makeModel(): RecoderUsageViewModel {
    return new RecoderUsageViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a bare /inference/usage payload (totals + recent + optional scope) in the
// sendSuccess envelope the backend serves.
function mockUsageFetch(data: unknown, ok = true, status = 200) {
    return vi.fn().mockResolvedValue({ ok, status, json: async () => ({ success: ok, data }) });
}

describe("RecoderUsageViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects recent inference rows (tier/tokens/cost) and totals verbatim, newest-first", async () => {
        const data = {
            totals: { inputTokens: 1600, outputTokens: 400, totalTokens: 2000, costMicroUsd: 8400, calls: 2 },
            recent: [
                {
                    model: "openai/gpt-4o-mini",
                    provider: "openai",
                    tier: "loopback",
                    inputTokens: 1200,
                    outputTokens: 300,
                    totalTokens: 1500,
                    costMicroUsd: 4200,
                    createdAt: "2026-08-01T10:20:30.000Z",
                },
                {
                    model: "anthropic/claude-3-haiku",
                    provider: "anthropic",
                    tier: "napi",
                    inputTokens: 400,
                    outputTokens: 100,
                    totalTokens: 500,
                    costMicroUsd: 4200,
                    createdAt: "2026-08-01T10:19:00.000Z",
                },
            ],
        };
        const fetchMock = mockUsageFetch(data);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(UsageUrl);
        const display = globalStore.get(model.displayAtom);
        expect(display.totals.totalTokens).toBe("2,000");
        expect(display.totals.cost).toBe("$0.0084");
        expect(display.totals.calls).toBe("2");
        expect(display.recent).toHaveLength(2);
        // Backend delivers recent most-recent-first; the projection preserves it.
        expect(display.recent[0].model).toBe("openai/gpt-4o-mini");
        expect(display.recent[0].provider).toBe("openai");
        expect(display.recent[0].tier).toBe("loopback");
        expect(display.recent[0].inputTokens).toBe("1,200");
        expect(display.recent[0].outputTokens).toBe("300");
        expect(display.recent[0].totalTokens).toBe("1,500");
        expect(display.recent[0].cost).toBe("$0.0042");
        expect(display.recent[1].tier).toBe("napi");
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });

    it("shows a truthful 'No inference calls yet' notice and no rows on an empty ledger", async () => {
        vi.stubGlobal("fetch", mockUsageFetch({ totals: {}, recent: [] }));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.displayAtom).recent).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("No inference calls yet");
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("surfaces the backend reason and clears the ledger on a non-2xx response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ error: { message: "usage ledger unavailable" } }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.errorAtom)).toBe("usage ledger unavailable");
        expect(globalStore.get(model.displayAtom).recent).toEqual([]);
        expect(globalStore.get(model.displayAtom).totals.cost).toBe("$0.00");
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });

    it("falls back to a status-coded reason when a non-2xx carries no error body", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.errorAtom)).toBe("Usage unavailable (401)");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });

    it("degrades to 'Not connected.' and clears results on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.displayAtom).recent).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
