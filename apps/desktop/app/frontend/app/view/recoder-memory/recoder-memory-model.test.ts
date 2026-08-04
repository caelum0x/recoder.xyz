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
const RecallUrl = "http://127.0.0.1:3100/api/agent-os/memory/recall";

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

    it("separates durable items from shaped harvest candidates onto distinct atoms", async () => {
        const item = { memoryId: "m1", scope: "repo", title: "durable fact", body: "b", status: "active" };
        const lesson = {
            candidateId: "c1",
            scope: "repo",
            title: "converged 3 agents",
            body: "converged 3 agents; kept auth-fix; contested router.ts; verified pnpm test",
            status: "candidate_created",
            proposedBy: "conductor",
        };
        vi.stubGlobal("fetch", mockMemoryFetch([item], [lesson]));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.itemsAtom)).toEqual([item]);
        expect(globalStore.get(model.candidatesAtom)).toEqual([lesson]);
        // The shaped lesson body is surfaced verbatim (never flattened into items).
        expect(globalStore.get(model.candidatesAtom)[0].body).toContain("contested router.ts");
    });

    it("leaves both atoms empty on a connected first run so the calm empty voice shows", async () => {
        vi.stubGlobal("fetch", mockMemoryFetch([], []));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.itemsAtom)).toEqual([]);
        expect(globalStore.get(model.candidatesAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("");
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

describe("RecoderMemoryViewModel.search", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("retains per-hit provenance (source/ref/score/scope) from the recall response", async () => {
        const fetchMock = vi.fn().mockImplementation(() =>
            okJson({
                memories: [
                    {
                        id: "m1",
                        title: "fact title",
                        body: "the fact",
                        provenance: { source: "mem0", ref: "mem0:1", score: 0.82, scope: "repo" },
                    },
                    {
                        id: "m2",
                        body: "another",
                        provenance: { source: "beads", ref: "bd-1", score: 1.7 },
                    },
                ],
                sources: [{ source: "mem0", available: true }],
                reranker: "identity",
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setQuery("fact");
        await model.search();

        expect(fetchMock).toHaveBeenCalledWith(RecallUrl, expect.objectContaining({ method: "POST" }));
        expect(globalStore.get(model.resultsAtom)).toEqual([
            {
                id: "m1",
                memory: "the fact",
                title: "fact title",
                provenance: { source: "mem0", ref: "mem0:1", score: 0.82, scope: "repo" },
            },
            {
                id: "m2",
                memory: "another",
                provenance: { source: "beads", ref: "bd-1", score: 1 },
            },
        ]);
        expect(globalStore.get(model.searchNoticeAtom)).toBe("");
        expect(globalStore.get(model.sourcesNoticeAtom)).toBe("");
    });

    it("projects the scope-boost signals that surfaced each lesson (the recall moat)", async () => {
        const fetchMock = vi.fn().mockImplementation(() =>
            okJson({
                memories: [
                    {
                        id: "m1",
                        body: "repo lesson",
                        provenance: {
                            source: "items",
                            ref: "i1",
                            score: 0.9,
                            scope: "repo",
                            signals: ["repo-match", "recency", "lexical"],
                        },
                    },
                    {
                        id: "m2",
                        body: "generic hit",
                        provenance: { source: "mem0", ref: "r2", score: 0.4 },
                    },
                ],
                sources: [{ source: "items", available: true }],
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setQuery("lesson");
        await model.search();

        const results = globalStore.get(model.resultsAtom);
        expect(results[0].provenance?.signals).toEqual(["repo-match", "recency", "lexical"]);
        expect(results[1].provenance?.signals).toBeUndefined();
    });

    it("keeps only known signals in canonical order and drops unknown/empty tags", async () => {
        const fetchMock = vi.fn().mockImplementation(() =>
            okJson({
                memories: [
                    {
                        id: "m1",
                        body: "a",
                        provenance: {
                            source: "items",
                            ref: "i1",
                            score: 0.5,
                            signals: ["lexical", "made-up", "repo-match", 7],
                        },
                    },
                    {
                        id: "m2",
                        body: "b",
                        provenance: { source: "mem0", ref: "r2", score: 0.5, signals: [] },
                    },
                    {
                        id: "m3",
                        body: "c",
                        provenance: { source: "mem0", ref: "r3", score: 0.5, signals: "lexical" },
                    },
                ],
                sources: [{ source: "items", available: true }],
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        const results = globalStore.get(model.resultsAtom);
        expect(results[0].provenance?.signals).toEqual(["repo-match", "lexical"]);
        expect(results[1].provenance?.signals).toBeUndefined();
        expect(results[2].provenance?.signals).toBeUndefined();
    });

    it("omits malformed provenance instead of crashing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() =>
                okJson({
                    memories: [
                        { id: "m1", body: "a", provenance: { source: "mem0", ref: "r1", score: Number.NaN } },
                        { id: "m2", body: "b", provenance: { ref: "r2", score: 0.5 } },
                        { id: "m3", body: "c", provenance: "junk" },
                        { id: "m4", body: "d" },
                    ],
                    sources: [{ source: "mem0", available: true }],
                })
            )
        );

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.resultsAtom)).toEqual([
            { id: "m1", memory: "a" },
            { id: "m2", memory: "b" },
            { id: "m3", memory: "c" },
            { id: "m4", memory: "d" },
        ]);
    });

    it("surfaces a partial-degrade notice naming each down source while keeping results", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() =>
                okJson({
                    memories: [
                        { id: "m1", body: "hit", provenance: { source: "mem0", ref: "r1", score: 0.9 } },
                    ],
                    sources: [
                        { source: "mem0", available: true },
                        { source: "beads", available: false, reason: "bd daemon unreachable" },
                        { source: "colbert", available: false },
                    ],
                })
            )
        );

        const model = makeModel();
        model.setQuery("hit");
        await model.search();

        expect(globalStore.get(model.resultsAtom)).toHaveLength(1);
        expect(globalStore.get(model.sourcesNoticeAtom)).toBe(
            "partial recall: beads unavailable (bd daemon unreachable), colbert unavailable"
        );
        expect(globalStore.get(model.searchNoticeAtom)).toBe("");
    });

    it("keeps the full-degrade reason notice when every source is down and results are empty", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() =>
                okJson({
                    memories: [],
                    sources: [
                        { source: "mem0", available: false, reason: "mem0 sidecar down" },
                        { source: "beads", available: false },
                    ],
                })
            )
        );

        const model = makeModel();
        model.setQuery("q");
        await model.search();

        expect(globalStore.get(model.resultsAtom)).toEqual([]);
        expect(globalStore.get(model.searchNoticeAtom)).toBe("mem0 sidecar down");
        expect(globalStore.get(model.sourcesNoticeAtom)).toBe("");
    });

    it("clears the previous sources notice on a new search", async () => {
        const partial = {
            memories: [{ id: "m1", body: "hit" }],
            sources: [
                { source: "mem0", available: true },
                { source: "beads", available: false, reason: "down" },
            ],
        };
        const healthy = {
            memories: [{ id: "m1", body: "hit" }],
            sources: [
                { source: "mem0", available: true },
                { source: "beads", available: true },
            ],
        };
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => okJson(partial))
            .mockImplementation(() => okJson(healthy));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        model.setQuery("hit");
        await model.search();
        expect(globalStore.get(model.sourcesNoticeAtom)).toBe("partial recall: beads unavailable (down)");

        await model.search();
        expect(globalStore.get(model.sourcesNoticeAtom)).toBe("");
        expect(globalStore.get(model.resultsAtom)).toHaveLength(1);
    });

    it("clears results and both notices on an empty query without a request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.resultsAtom, [{ id: "m1", memory: "stale" }]);
        globalStore.set(model.searchNoticeAtom, "No matches.");
        globalStore.set(model.sourcesNoticeAtom, "partial recall: beads unavailable");
        model.setQuery("   ");
        await model.search();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.resultsAtom)).toEqual([]);
        expect(globalStore.get(model.searchNoticeAtom)).toBe("");
        expect(globalStore.get(model.sourcesNoticeAtom)).toBe("");
    });
});

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
