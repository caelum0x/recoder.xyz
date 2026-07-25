// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason, readFetchError } from "../recoder/recoder-errors";
import { RecoderMemoryView } from "./recoder-memory";

// Mirrors the Agent OS MemoryItem domain type (packages/agent-os/src/domain/memory-item.ts).
// Only the fields the terminal renders are declared.
type RecoderMemoryItem = {
    memoryId: string;
    scope: string;
    title: string;
    body: string;
    status: string;
    evidence?: { taskId?: string; artifactId?: string };
};

// Mirrors the Agent OS MemoryCandidate domain type — pending reviewed-memory
// proposals that have not yet been accepted into durable memory.
type RecoderMemoryCandidate = {
    candidateId: string;
    scope: string;
    title: string;
    body: string;
    status: string;
    proposedBy: string;
};

// Fused recall record projected from POST /api/agent-os/memory/recall
// (RecalledMemory { id, body, provenance }); only the fields the terminal renders.
type RecoderMemoryResult = {
    id: string;
    memory: string;
};

class RecoderMemoryViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    queryAtom: PrimitiveAtom<string>;
    itemsAtom: PrimitiveAtom<RecoderMemoryItem[]>;
    candidatesAtom: PrimitiveAtom<RecoderMemoryCandidate[]>;
    resultsAtom: PrimitiveAtom<RecoderMemoryResult[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    searchingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    searchNoticeAtom: PrimitiveAtom<string>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-memory";
        this.viewIcon = atom("brain");
        this.viewName = atom("Memory");
        this.queryAtom = atom("") as PrimitiveAtom<string>;
        this.itemsAtom = atom([]) as PrimitiveAtom<RecoderMemoryItem[]>;
        this.candidatesAtom = atom([]) as PrimitiveAtom<RecoderMemoryCandidate[]>;
        this.resultsAtom = atom([]) as PrimitiveAtom<RecoderMemoryResult[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.searchingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.searchNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderMemoryView;
    }

    // Degrade-safe: any transport failure or non-2xx leaves connected=false so
    // the panel shows a neutral "not connected" message rather than crashing or
    // fabricating memories.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/memory/candidates`);
            if (!res.ok) {
                globalStore.set(this.connectedAtom, false);
                const detail = await readFetchError(res);
                globalStore.set(this.errorAtom, detail || `Memory unavailable (${res.status})`);
                return;
            }
            const body = await res.json();
            const data = body?.data ?? {};
            const items = Array.isArray(data?.items) ? (data.items as RecoderMemoryItem[]) : [];
            const candidates = Array.isArray(data?.candidates) ? (data.candidates as RecoderMemoryCandidate[]) : [];
            const pending = candidates.filter((c) => c?.status === "candidate_created" || c?.status === "reviewed");
            globalStore.set(this.itemsAtom, items);
            globalStore.set(this.candidatesAtom, pending);
            globalStore.set(this.connectedAtom, true);
        } catch {
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.itemsAtom, []);
            globalStore.set(this.candidatesAtom, []);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    setQuery(value: string) {
        globalStore.set(this.queryAtom, value);
    }

    // Fused recall via POST /memory/recall. Empty query clears results without a
    // request. Degrade-safe: transport failure or fully-degraded sources surface a
    // neutral, truthful notice and empty results, never a crash or a fabricated hit.
    async search() {
        const query = globalStore.get(this.queryAtom).trim();
        if (query === "") {
            globalStore.set(this.resultsAtom, []);
            globalStore.set(this.searchNoticeAtom, "");
            return;
        }
        globalStore.set(this.searchingAtom, true);
        globalStore.set(this.searchNoticeAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/memory/recall`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.resultsAtom, []);
                globalStore.set(this.searchNoticeAtom, readErrorReason(body) || "Search unavailable.");
                return;
            }
            const data = body?.data ?? {};
            const memories = Array.isArray(data?.memories) ? data.memories : [];
            const results: RecoderMemoryResult[] = memories.map((m: { id?: string; body?: string }) => ({
                id: String(m?.id ?? ""),
                memory: String(m?.body ?? ""),
            }));
            globalStore.set(this.resultsAtom, results);
            if (results.length === 0) {
                const sources = Array.isArray(data?.sources) ? data.sources : [];
                const down = sources.filter((s: { available?: boolean }) => s?.available === false);
                if (sources.length > 0 && down.length === sources.length) {
                    const reason = down.find((s: { reason?: string }) => s?.reason)?.reason;
                    globalStore.set(this.searchNoticeAtom, reason ? String(reason) : "memory sources unavailable");
                } else {
                    globalStore.set(this.searchNoticeAtom, "No matches.");
                }
            }
        } catch {
            globalStore.set(this.resultsAtom, []);
            globalStore.set(this.searchNoticeAtom, "Not connected.");
        } finally {
            globalStore.set(this.searchingAtom, false);
        }
    }
}

export {
    RecoderMemoryViewModel,
    type RecoderMemoryItem,
    type RecoderMemoryCandidate,
    type RecoderMemoryResult,
};
