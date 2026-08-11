// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-codebase", () => ({
    RecoderCodebaseView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderCodebaseViewModel } from "./recoder-codebase-model";

const SearchUrl = "http://127.0.0.1:3100/api/agent-os/retrieval/search";
const StatusUrl = "http://127.0.0.1:3100/api/agent-os/retrieval/status";
const SymbolUrl = "http://127.0.0.1:3100/api/mcp/tools/recodergit/symbol_search/call";
const DefinitionUrl = "http://127.0.0.1:3100/api/mcp/tools/recodergit/definition/call";

function makeModel(): RecoderCodebaseViewModel {
    return new RecoderCodebaseViewModel({ blockId: "b1" } as ViewModelInitType);
}

function isSearch(url: string): boolean {
    return String(url).endsWith("/api/agent-os/retrieval/search");
}

// Compose a fetch mock that answers the RAG search edge with `ragData` (a bare
// SearchResult) and the MCP recodergit edge with `codeWire` (the governed edge's
// data envelope). Both replies are wrapped in the sendSuccess envelope.
function mockSearchFetch(ragData: unknown, codeWire: unknown) {
    return vi.fn().mockImplementation((url: string) => {
        const data = isSearch(url) ? ragData : codeWire;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
    });
}

describe("RecoderCodebaseViewModel.search", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects RAG passages and code-intel symbols from a healthy dual response", async () => {
        const ragData = {
            status: "ok",
            query: "search",
            reranker: "colbert",
            passages: [
                { id: "p1", text: "how search works", score: 0.91, source: "src/search.ts" },
                { id: 2, text: "second passage", score: 0.5 },
            ],
            sources: [{ source: "qdrant", available: true, contributed: 2 }],
        };
        const codeWire = {
            status: "completed",
            risk: "low",
            result: { symbols: [{ name: "searchRepo", filePath: "src/search.ts", kind: "function" }] },
            auditEventId: "evt1",
        };
        const fetchMock = mockSearchFetch(ragData, codeWire);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setQuery("search");
        await model.search();

        expect(fetchMock).toHaveBeenCalledWith(SearchUrl, expect.objectContaining({ method: "POST" }));
        expect(fetchMock).toHaveBeenCalledWith(SymbolUrl, expect.objectContaining({ method: "POST" }));
        expect(globalStore.get(model.passagesAtom)).toEqual([
            { id: "p1", text: "how search works", score: 0.91, source: "src/search.ts" },
            { id: "2", text: "second passage", score: 0.5 },
        ]);
        expect(globalStore.get(model.symbolsAtom)).toEqual([
            { id: "searchRepo", label: "searchRepo", detail: "src/search.ts" },
        ]);
        expect(globalStore.get(model.ragNoticeAtom)).toBe("");
        expect(globalStore.get(model.codeNoticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("shows a truthful 'repo not indexed' notice and no passages when RAG degrades to not_configured", async () => {
        const ragData = { status: "not_configured", query: "q", reranker: "identity", passages: [] };
        const codeWire = { status: "completed", result: { symbols: [] }, auditEventId: "e" };
        vi.stubGlobal("fetch", mockSearchFetch(ragData, codeWire));

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.passagesAtom)).toEqual([]);
        expect(globalStore.get(model.ragNoticeAtom)).toContain("not indexed");
    });

    it("never fabricates a code hit: a completed {available:false} tool payload degrades truthfully", async () => {
        const ragData = { status: "ok", query: "q", reranker: "identity", passages: [] };
        const codeWire = {
            status: "completed",
            result: { available: false, reason: "repo not indexed (call index/connect first)" },
            auditEventId: "e",
        };
        vi.stubGlobal("fetch", mockSearchFetch(ragData, codeWire));

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.symbolsAtom)).toEqual([]);
        expect(globalStore.get(model.codeNoticeAtom)).toBe("repo not indexed (call index/connect first)");
    });

    it("treats a completed {ok:false} tool payload as a truthful degrade too", async () => {
        const ragData = { status: "ok", query: "q", reranker: "identity", passages: [] };
        const codeWire = {
            status: "completed",
            result: { ok: false, reason: "recodergit engine disabled" },
            auditEventId: "e",
        };
        vi.stubGlobal("fetch", mockSearchFetch(ragData, codeWire));

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.symbolsAtom)).toEqual([]);
        expect(globalStore.get(model.codeNoticeAtom)).toBe("recodergit engine disabled");
    });

    it("surfaces a policy denial from the governed edge without fabricating a graph, keeping RAG hits", async () => {
        const ragData = {
            status: "ok",
            query: "q",
            reranker: "identity",
            passages: [{ id: "p1", text: "hit", score: 0.7 }],
        };
        const codeWire = { status: "denied", risk: "medium", reason: "code-intel denied by policy", auditEventId: "e" };
        vi.stubGlobal("fetch", mockSearchFetch(ragData, codeWire));

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.passagesAtom)).toHaveLength(1);
        expect(globalStore.get(model.symbolsAtom)).toEqual([]);
        expect(globalStore.get(model.codeNoticeAtom)).toBe("code-intel denied by policy");
    });

    it("degrades to 'Not connected.' and clears results on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.passagesAtom)).toEqual([]);
        expect(globalStore.get(model.symbolsAtom)).toEqual([]);
        expect(globalStore.get(model.searchingAtom)).toBe(false);
    });

    it("clears results and notices on an empty query without issuing any request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.passagesAtom, [{ id: "p1", text: "stale", score: 1 }]);
        globalStore.set(model.symbolsAtom, [{ id: "s1", label: "stale" }]);
        globalStore.set(model.ragNoticeAtom, "old");
        globalStore.set(model.codeNoticeAtom, "old");
        model.setQuery("   ");
        await model.search();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.passagesAtom)).toEqual([]);
        expect(globalStore.get(model.symbolsAtom)).toEqual([]);
        expect(globalStore.get(model.ragNoticeAtom)).toBe("");
        expect(globalStore.get(model.codeNoticeAtom)).toBe("");
    });
});

describe("RecoderCodebaseViewModel.refresh", () => {
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

describe("RecoderCodebaseViewModel.definition (drill-down)", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects a completed definition drill-down to the same edge and status branching", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            expect(url).toBe(DefinitionUrl);
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        status: "completed",
                        result: { symbols: [{ symbol: "searchRepo", path: "src/search.ts" }] },
                        auditEventId: "e",
                    },
                }),
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.definition("searchRepo");

        expect(globalStore.get(model.drillAtom)).toEqual([
            { id: "searchRepo", label: "searchRepo", detail: "src/search.ts" },
        ]);
        expect(globalStore.get(model.drillNoticeAtom)).toBe("");
    });

    it("surfaces a truthful degrade on a needs_approval drill-down without fabricating symbols", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: { status: "needs_approval", reason: "awaiting reviewer", auditEventId: "e" },
                }),
            })
        );

        const model = makeModel();
        await model.definition("searchRepo");

        expect(globalStore.get(model.drillAtom)).toEqual([]);
        expect(globalStore.get(model.drillNoticeAtom)).toBe("awaiting reviewer");
    });
});
