// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
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

// WHY a lesson surfaced — mirrors the backend RecallSignal vocabulary
// (backend/src/domains/memory/types.ts). Each is only present when its
// scope-boost genuinely fired, so rendering them shows the recall is learning
// across runs (repo-scoped / fresh) rather than generic.
type RecallSignal = "repo-match" | "recency" | "lexical";

const RECALL_SIGNALS: readonly RecallSignal[] = ["repo-match", "recency", "lexical"];

// Fused recall record projected from POST /api/agent-os/memory/recall
// (RecalledMemory { id, title?, body, provenance }); only the fields the
// terminal renders. Provenance is optional here because the projection drops
// malformed attribution rather than fabricating it.
type RecoderMemoryProvenance = {
    source: string;
    ref: string;
    score: number;
    scope?: string;
    signals?: readonly RecallSignal[];
};

type RecoderMemoryResult = {
    id: string;
    memory: string;
    title?: string;
    provenance?: RecoderMemoryProvenance;
};

class RecoderMemoryViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    queryAtom: PrimitiveAtom<string>;
    scopeThisRepoAtom: PrimitiveAtom<boolean>;
    repoRefAtom: PrimitiveAtom<string>;
    itemsAtom: PrimitiveAtom<RecoderMemoryItem[]>;
    candidatesAtom: PrimitiveAtom<RecoderMemoryCandidate[]>;
    resultsAtom: PrimitiveAtom<RecoderMemoryResult[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    searchingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    searchNoticeAtom: PrimitiveAtom<string>;
    sourcesNoticeAtom: PrimitiveAtom<string>;
    connectedAtom: PrimitiveAtom<boolean>;
    actingAtom: PrimitiveAtom<string>;
    actionErrorAtom: PrimitiveAtom<string>;
    actionNoticeAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-memory";
        this.viewIcon = atom("brain");
        this.viewName = atom("Memory");
        this.queryAtom = atom("") as PrimitiveAtom<string>;
        this.scopeThisRepoAtom = atom(false) as PrimitiveAtom<boolean>;
        this.repoRefAtom = atom("") as PrimitiveAtom<string>;
        this.itemsAtom = atom([]) as PrimitiveAtom<RecoderMemoryItem[]>;
        this.candidatesAtom = atom([]) as PrimitiveAtom<RecoderMemoryCandidate[]>;
        this.resultsAtom = atom([]) as PrimitiveAtom<RecoderMemoryResult[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.searchingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.searchNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.sourcesNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.actingAtom = atom("") as PrimitiveAtom<string>;
        this.actionErrorAtom = atom("") as PrimitiveAtom<string>;
        this.actionNoticeAtom = atom("") as PrimitiveAtom<string>;
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
        globalStore.set(this.actionErrorAtom, "");
        try {
            const base = getRecoderBackendUrl();
            // Both edges answer with the sendSuccess envelope around a BARE array
            // ({ success, data: MemoryItem[] } / { success, data: MemoryCandidate[] });
            // there is no combined {items,candidates} route.
            const [itemsRes, candidatesRes] = await Promise.all([
                fetch(`${base}/api/agent-os/memory/items`),
                fetch(`${base}/api/agent-os/memory/candidates`),
            ]);
            if (!itemsRes.ok || !candidatesRes.ok) {
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                const failed = !itemsRes.ok ? itemsRes : candidatesRes;
                const detail = await readFetchError(failed);
                globalStore.set(this.errorAtom, detail || `Memory unavailable (${failed.status})`);
                return;
            }
            const itemsBody = await itemsRes.json();
            const candidatesBody = await candidatesRes.json();
            const items = Array.isArray(itemsBody?.data) ? (itemsBody.data as RecoderMemoryItem[]) : [];
            const candidates = Array.isArray(candidatesBody?.data)
                ? (candidatesBody.data as RecoderMemoryCandidate[])
                : [];
            const pending = candidates.filter((c) => c?.status === "candidate_created" || c?.status === "reviewed");
            globalStore.set(this.itemsAtom, items);
            globalStore.set(this.candidatesAtom, pending);
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
            globalStore.set(this.itemsAtom, []);
            globalStore.set(this.candidatesAtom, []);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    setQuery(value: string) {
        globalStore.set(this.queryAtom, value);
    }

    // Toggle cross-run repo-scoped recall. When on (and a repoRef is known), the
    // next search narrows to this repo AND passes the repoRef the fusion layer
    // needs to rank THIS repo's prior-run lessons above generic ones (repo-match).
    setScopeThisRepo(value: boolean) {
        globalStore.set(this.scopeThisRepoAtom, value);
    }

    // Record the repo the "this repo" toggle scopes to (the repo path the dev is
    // working). Empty ⇒ the toggle is a truthful no-op (no repo to fire against).
    setRepoRef(value: string) {
        globalStore.set(this.repoRefAtom, value);
    }

    // Build the recall POST body. When "this repo" is on AND a repoRef is known,
    // it adds `scope: "repo"` (narrows the item/source filter) plus `scopeRef` and
    // `repoRef` (the fusion layer's repo-match boost keys off `repoRef`). Absent a
    // repoRef the toggle is inert, so an unscoped tenant recall goes out unchanged.
    recallBody(query: string): Record<string, unknown> {
        const repoRef = globalStore.get(this.repoRefAtom).trim();
        if (!globalStore.get(this.scopeThisRepoAtom) || repoRef == "") {
            return { query };
        }
        return { query, scope: "repo", scopeRef: repoRef, repoRef };
    }

    // Fused recall via POST /memory/recall. Empty query clears results without a
    // request. Degrade-safe: transport failure or fully-degraded sources surface a
    // neutral, truthful notice and empty results, never a crash or a fabricated hit.
    async search() {
        const query = globalStore.get(this.queryAtom).trim();
        if (query === "") {
            globalStore.set(this.resultsAtom, []);
            globalStore.set(this.searchNoticeAtom, "");
            globalStore.set(this.sourcesNoticeAtom, "");
            return;
        }
        globalStore.set(this.searchingAtom, true);
        globalStore.set(this.searchNoticeAtom, "");
        globalStore.set(this.sourcesNoticeAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/memory/recall`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.recallBody(query)),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.resultsAtom, []);
                globalStore.set(this.searchNoticeAtom, readErrorReason(body) || "Search unavailable.");
                return;
            }
            const data = body?.data ?? {};
            const memories = Array.isArray(data?.memories) ? data.memories : [];
            const results: RecoderMemoryResult[] = memories.map((m: unknown) => projectRecalledMemory(m));
            globalStore.set(this.resultsAtom, results);
            const sources = Array.isArray(data?.sources) ? data.sources : [];
            const down = sources.filter((s: { available?: boolean }) => s?.available === false);
            if (down.length > 0 && down.length < sources.length) {
                globalStore.set(this.sourcesNoticeAtom, partialRecallNotice(down));
            }
            if (results.length === 0) {
                if (sources.length > 0 && down.length === sources.length) {
                    // No engine names to the user — the reason is backend plumbing.
                    globalStore.set(this.searchNoticeAtom, "Memory is temporarily unavailable — try again in a moment.");
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

    // Promote a pending candidate → durable memory via POST /candidates/:id/accept.
    // The edge is GATED: a { promoted:false } response is a TRUTHFUL non-promotion
    // (policy-denied or pending approval), surfaced as a notice — never faked as a
    // success. Refreshes on the success path so the list reflects the real state.
    async acceptCandidate(candidateId: string) {
        if (candidateId == "") {
            return;
        }
        globalStore.set(this.actingAtom, candidateId);
        globalStore.set(this.actionErrorAtom, "");
        globalStore.set(this.actionNoticeAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/agent-os/memory/candidates/${encodeURIComponent(candidateId)}/accept`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                }
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.actionErrorAtom, readErrorReason(body) || `Could not accept (${res.status})`);
                return;
            }
            globalStore.set(this.actionNoticeAtom, acceptOutcomeNotice(body?.data));
        } catch (e) {
            globalStore.set(this.actionErrorAtom, e instanceof Error ? e.message : String(e));
            return;
        } finally {
            globalStore.set(this.actingAtom, "");
        }
        await this.refresh();
    }

    // Reject a pending candidate via POST /candidates/:id/reject. Low-risk audited
    // state change; the backend requires a reason, so a default reviewer note is
    // sent. Refreshes on the success path so the rejected wisp drops from pending.
    async rejectCandidate(candidateId: string) {
        if (candidateId == "") {
            return;
        }
        globalStore.set(this.actingAtom, candidateId);
        globalStore.set(this.actionErrorAtom, "");
        globalStore.set(this.actionNoticeAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/agent-os/memory/candidates/${encodeURIComponent(candidateId)}/reject`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: "Rejected by reviewer" }),
                }
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.actionErrorAtom, readErrorReason(body) || `Could not reject (${res.status})`);
                return;
            }
            globalStore.set(this.actionNoticeAtom, "Candidate rejected.");
        } catch (e) {
            globalStore.set(this.actionErrorAtom, e instanceof Error ? e.message : String(e));
            return;
        } finally {
            globalStore.set(this.actingAtom, "");
        }
        await this.refresh();
    }

    // Forget (tombstone) a durable item via POST /items/:id/forget. The edge is
    // GATED: only `{ forgotten:true }` means the item was removed from active
    // recall — a `{ forgotten:false, verdict }` is a TRUTHFUL non-forget (policy
    // denied or pending approval), surfaced verbatim and never faked. The backend
    // requires a reason, so a blank one defaults. Refreshes ONLY when the item was
    // actually forgotten, so the row drops without hiding a denied attempt.
    async forgetItem(memoryId: string, reason: string) {
        if (memoryId == "") {
            return;
        }
        globalStore.set(this.actingAtom, memoryId);
        globalStore.set(this.actionErrorAtom, "");
        globalStore.set(this.actionNoticeAtom, "");
        let forgotten = false;
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/agent-os/memory/items/${encodeURIComponent(memoryId)}/forget`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: reason.trim() || "Forgotten by reviewer" }),
                }
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.actionErrorAtom, readErrorReason(body) || `Could not forget (${res.status})`);
                return;
            }
            const data = body?.data;
            globalStore.set(this.actionNoticeAtom, forgetOutcomeNotice(data));
            forgotten = data != null && typeof data == "object" && (data as Record<string, unknown>).forgotten === true;
        } catch (e) {
            globalStore.set(this.actionErrorAtom, e instanceof Error ? e.message : String(e));
            return;
        } finally {
            globalStore.set(this.actingAtom, "");
        }
        if (forgotten) {
            await this.refresh();
        }
    }
}

// Project one RecalledMemory defensively. Provenance is kept only when the
// source/ref are strings and the score is a finite number (clamped to [0,1]
// for display); anything malformed drops the field rather than fabricating
// attribution or crashing the render.
function projectRecalledMemory(value: unknown): RecoderMemoryResult {
    const m = value != null && typeof value == "object" ? (value as Record<string, unknown>) : {};
    const result: RecoderMemoryResult = {
        id: String(m.id ?? ""),
        memory: String(m.body ?? ""),
    };
    if (typeof m.title == "string" && m.title != "") {
        result.title = m.title;
    }
    const provenance = readProvenance(m.provenance);
    if (provenance != null) {
        result.provenance = provenance;
    }
    return result;
}

function readProvenance(value: unknown): RecoderMemoryProvenance {
    const p = value != null && typeof value == "object" ? (value as Record<string, unknown>) : null;
    if (p == null || typeof p.source != "string" || typeof p.ref != "string") {
        return null;
    }
    if (typeof p.score != "number" || !Number.isFinite(p.score)) {
        return null;
    }
    let provenance: RecoderMemoryProvenance = {
        source: p.source,
        ref: p.ref,
        score: Math.min(1, Math.max(0, p.score)),
    };
    if (typeof p.scope == "string" && p.scope != "") {
        provenance = { ...provenance, scope: p.scope };
    }
    const signals = readSignals(p.signals);
    if (signals.length > 0) {
        provenance = { ...provenance, signals };
    }
    return provenance;
}

// Keep only the known scope-boost signals, deduped and in canonical order, so a
// malformed or unknown tag never leaks into the UI or fabricates a "why".
function readSignals(value: unknown): RecallSignal[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const present = new Set(value.filter((s): s is string => typeof s == "string"));
    return RECALL_SIGNALS.filter((s) => present.has(s));
}

// Truthful partial-degrade line WITHOUT naming engines (the invisible-engines
// contract): a half-empty recall never reads as complete, but "beads/colbert/
// mem0" are backend plumbing the user must never see — a count is equally
// truthful and stays terminal-plain.
function partialRecallNotice(down: { source?: unknown; reason?: unknown }[]): string {
    const n = down.length;
    const src = n == 1 ? "source is" : "sources are";
    return `${n} memory ${src} temporarily unavailable — showing partial results.`;
}

// Translate the gated AcceptResult into a truthful one-line outcome. `promoted`
// is the ONLY signal that a durable item was written; every other verdict is a
// non-promotion reported honestly (pending approval, or policy-denied).
function acceptOutcomeNotice(data: unknown): string {
    const d = data != null && typeof data == "object" ? (data as Record<string, unknown>) : {};
    if (d.promoted === true) {
        return "Promoted to durable memory.";
    }
    const verdict = d.verdict != null && typeof d.verdict == "object" ? (d.verdict as Record<string, unknown>) : {};
    const effect = typeof verdict.effect == "string" ? verdict.effect : "";
    const reason = typeof verdict.reason == "string" ? verdict.reason : "";
    if (effect == "needs_approval") {
        return reason || "Accept sent for approval — pending review.";
    }
    return reason || "Accept was not permitted by policy.";
}

// Translate the gated ForgetResult into a truthful one-line outcome. `forgotten`
// is the ONLY signal that the durable item was tombstoned out of active recall;
// every other verdict is a non-forget reported honestly (pending approval, or the
// verbatim policy-deny reason).
function forgetOutcomeNotice(data: unknown): string {
    const d = data != null && typeof data == "object" ? (data as Record<string, unknown>) : {};
    if (d.forgotten === true) {
        return "Forgotten.";
    }
    const verdict = d.verdict != null && typeof d.verdict == "object" ? (d.verdict as Record<string, unknown>) : {};
    const effect = typeof verdict.effect == "string" ? verdict.effect : "";
    const reason = typeof verdict.reason == "string" ? verdict.reason : "";
    if (effect == "needs_approval") {
        return reason || "Forget sent for approval — pending review.";
    }
    return reason || "Forget was not permitted by policy.";
}

export {
    RecoderMemoryViewModel,
    type RecallSignal,
    type RecoderMemoryItem,
    type RecoderMemoryCandidate,
    type RecoderMemoryProvenance,
    type RecoderMemoryResult,
};
