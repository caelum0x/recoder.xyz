// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
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

// Semantic recall record returned by /api/agent-os/memory/search (mem0 engine).
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
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/memory`);
            if (!res.ok) {
                globalStore.set(this.connectedAtom, false);
                globalStore.set(this.errorAtom, `backend returned ${res.status}`);
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

    // Semantic recall via the mem0 engine. Empty query clears results without a
    // request. Degrade-safe: transport failure or an unavailable engine surfaces
    // a neutral notice and empty results, never a crash.
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
            const url = `${getRecoderBackendUrl()}/api/agent-os/memory/search?query=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            if (!res.ok) {
                globalStore.set(this.resultsAtom, []);
                globalStore.set(this.searchNoticeAtom, `search failed (${res.status})`);
                return;
            }
            const body = await res.json();
            const data = body?.data ?? {};
            const results = Array.isArray(data?.results) ? (data.results as RecoderMemoryResult[]) : [];
            globalStore.set(this.resultsAtom, results);
            if (data?.available === false) {
                globalStore.set(this.searchNoticeAtom, data?.reason ? String(data.reason) : "memory engine unavailable");
            } else if (results.length === 0) {
                globalStore.set(this.searchNoticeAtom, "No matches.");
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
