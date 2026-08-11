// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-ingest", () => ({
    RecoderIngestView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderIngestViewModel } from "./recoder-ingest-model";

const IngestUrl = "http://127.0.0.1:3100/api/agent-os/retrieval/ingest";
const StatusUrl = "http://127.0.0.1:3100/api/agent-os/retrieval/status";

function makeModel(): RecoderIngestViewModel {
    return new RecoderIngestViewModel({ blockId: "b1" } as ViewModelInitType);
}

// A single-doc ingest reply wrapped in the sendSuccess envelope (the route
// answers 201 with { data: { results: [IngestResult] } }).
function mockIngestFetch(result: unknown, ok = true, status = 201) {
    return vi.fn().mockResolvedValue({
        ok,
        status,
        json: async () => ({ success: ok, data: { results: result == null ? [] : [result] } }),
    });
}

describe("RecoderIngestViewModel.ingest", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects an 'ingested' outcome from a healthy single-doc reply", async () => {
        const fetchMock = mockIngestFetch({
            status: "ingested",
            collection: "rt__acme__default",
            docId: "d1",
            chunks: 4,
            upserted: 4,
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setText("team convention: always paginate list endpoints");
        await model.ingest();

        expect(fetchMock).toHaveBeenCalledWith(
            IngestUrl,
            expect.objectContaining({ method: "POST" })
        );
        const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
        expect(body.docs).toEqual([
            { text: "team convention: always paginate list endpoints" },
        ]);
        const outcome = globalStore.get(model.outcomeAtom);
        expect(outcome?.status).toBe("ingested");
        expect(outcome?.chunks).toBe(4);
        expect(outcome?.upserted).toBe(4);
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.ingestingAtom)).toBe(false);
    });

    it("issues no request and keeps no outcome on an empty (whitespace) text", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setText("   \n  ");
        await model.ingest();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.outcomeAtom)).toBeNull();
    });

    it("surfaces a truthful not_configured notice and never fabricates a chunk count", async () => {
        vi.stubGlobal(
            "fetch",
            mockIngestFetch({
                status: "not_configured",
                collection: "rt__acme__default",
                docId: "d1",
                chunks: 0,
                upserted: 0,
                reason: "no embedder configured",
            })
        );

        const model = makeModel();
        model.setText("some knowledge");
        await model.ingest();

        const outcome = globalStore.get(model.outcomeAtom);
        expect(outcome?.status).toBe("not_configured");
        expect(outcome?.notice).toContain("not configured");
        expect(outcome?.chunks).toBe(0);
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("degrades with a truthful reason (not an outcome) on a non-2xx reply", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ error: { message: "retrieval temporarily unavailable" } }),
            })
        );

        const model = makeModel();
        model.setText("knowledge");
        await model.ingest();

        expect(globalStore.get(model.outcomeAtom)).toBeNull();
        expect(globalStore.get(model.errorAtom)).toBe("retrieval temporarily unavailable");
        expect(globalStore.get(model.ingestingAtom)).toBe(false);
    });

    it("degrades to 'Not connected.' and clears the outcome on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        model.setText("knowledge");
        await model.ingest();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.outcomeAtom)).toBeNull();
        expect(globalStore.get(model.ingestingAtom)).toBe(false);
    });
});

describe("RecoderIngestViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reports an indexed repo when retrieval status is configured", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { configured: true } }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(StatusUrl);
        expect(globalStore.get(model.indexedAtom)).toBe(true);
        expect(globalStore.get(model.indexNoticeAtom)).toBe("indexed");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("reports 'not indexed' when retrieval is not configured", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true, data: { configured: false } }),
            })
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.indexedAtom)).toBe(false);
        expect(globalStore.get(model.indexNoticeAtom)).toBe("not indexed");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("degrades to disconnected on a non-2xx status", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.indexedAtom)).toBe(false);
    });

    it("degrades to disconnected on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.indexedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
