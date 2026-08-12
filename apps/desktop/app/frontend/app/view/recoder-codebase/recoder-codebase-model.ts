// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderCodebaseView } from "./recoder-codebase";

// One ranked passage projected from POST /api/agent-os/retrieval/search
// (RetrievalPassage { id, text, score, source? }); only the fields the terminal
// renders. The id is normalized to a string because the backend may return a
// number.
type RecoderCodebasePassage = {
    id: string;
    text: string;
    score: number;
    source?: string;
};

// One code-graph hit projected from the recodergit code-intel MCP tool payload.
// The raw engine payload is opaque (passed through untouched by the backend), so
// the projection reads only the labelled fields it recognises and drops anything
// it cannot name rather than fabricating a symbol.
type RecoderCodebaseSymbol = {
    id: string;
    label: string;
    detail?: string;
};

// The normalized outcome of ONE governed recodergit code-intel call, decoupled
// from the wire so search() and the drill-downs share identical status branching.
type CodeIntelOutcome = {
    hits: RecoderCodebaseSymbol[];
    notice: string;
};

// The normalized outcome of the RAG search leg.
type RagOutcome = {
    passages: RecoderCodebasePassage[];
    notice: string;
    sourcesNotice: string;
};

// Default RAG top-K; a small window keeps the ask-the-repo panel terminal-plain.
const DefaultTopK = 8;

// Truthful, engine-name-free line when the code graph cannot answer. The reason
// for a policy verdict is surfaced verbatim; this is only the generic fallback.
const CodeUnavailableNotice = "Code graph unavailable — repo not indexed.";

// Truthful line when RAG reports it is not configured (no embedder/vector store).
const RepoNotIndexedNotice = "Repo not indexed — code search is offline until the repo is indexed.";

class RecoderCodebaseViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    queryAtom: PrimitiveAtom<string>;
    passagesAtom: PrimitiveAtom<RecoderCodebasePassage[]>;
    symbolsAtom: PrimitiveAtom<RecoderCodebaseSymbol[]>;
    searchingAtom: PrimitiveAtom<boolean>;
    ragNoticeAtom: PrimitiveAtom<string>;
    codeNoticeAtom: PrimitiveAtom<string>;
    sourcesNoticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;
    indexedAtom: PrimitiveAtom<boolean>;
    indexNoticeAtom: PrimitiveAtom<string>;
    drillAtom: PrimitiveAtom<RecoderCodebaseSymbol[]>;
    drillNoticeAtom: PrimitiveAtom<string>;
    drillingAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-codebase";
        this.viewIcon = atom("magnifying-glass");
        this.viewName = atom("Codebase");
        this.queryAtom = atom("") as PrimitiveAtom<string>;
        this.passagesAtom = atom([]) as PrimitiveAtom<RecoderCodebasePassage[]>;
        this.symbolsAtom = atom([]) as PrimitiveAtom<RecoderCodebaseSymbol[]>;
        this.searchingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.ragNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.codeNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.sourcesNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.indexedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.indexNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.drillAtom = atom([]) as PrimitiveAtom<RecoderCodebaseSymbol[]>;
        this.drillNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.drillingAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderCodebaseView;
    }

    setQuery(value: string) {
        globalStore.set(this.queryAtom, value);
    }

    // Index-health strip: GET /retrieval/status → { configured }. Degrade-safe —
    // any transport failure or non-2xx leaves connected=false + not indexed so the
    // strip shows a neutral state rather than fabricating "indexed".
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/retrieval/status`);
            if (!res.ok) {
                globalStore.set(this.connectedAtom, false);
                globalStore.set(this.indexedAtom, false);
                globalStore.set(this.indexNoticeAtom, "not indexed");
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const body = await res.json().catch(() => null);
            const configured = body?.data?.configured === true;
            globalStore.set(this.indexedAtom, configured);
            globalStore.set(this.indexNoticeAtom, configured ? "indexed" : "not indexed");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.indexedAtom, false);
            globalStore.set(this.indexNoticeAtom, "");
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Ask-the-repo: RAG passages + recodergit code-graph hits in parallel. Empty
    // query clears both panels without a request. Degrade-safe: a transport failure
    // on either leg surfaces a neutral "Not connected." and empty results — never a
    // crash and never a fabricated hit.
    async search() {
        const query = globalStore.get(this.queryAtom).trim();
        if (query === "") {
            globalStore.set(this.passagesAtom, []);
            globalStore.set(this.symbolsAtom, []);
            globalStore.set(this.ragNoticeAtom, "");
            globalStore.set(this.codeNoticeAtom, "");
            globalStore.set(this.sourcesNoticeAtom, "");
            return;
        }
        globalStore.set(this.searchingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.ragNoticeAtom, "");
        globalStore.set(this.codeNoticeAtom, "");
        globalStore.set(this.sourcesNoticeAtom, "");
        try {
            const base = getRecoderBackendUrl();
            const [rag, code] = await Promise.all([
                fetchRagSearch(base, query, DefaultTopK),
                fetchCodeIntel(base, "symbol_search", { query }),
            ]);
            globalStore.set(this.passagesAtom, rag.passages);
            globalStore.set(this.ragNoticeAtom, rag.notice);
            globalStore.set(this.sourcesNoticeAtom, rag.sourcesNotice);
            globalStore.set(this.symbolsAtom, code.hits);
            globalStore.set(this.codeNoticeAtom, code.notice);
        } catch {
            globalStore.set(this.errorAtom, "Not connected.");
            globalStore.set(this.passagesAtom, []);
            globalStore.set(this.symbolsAtom, []);
        } finally {
            globalStore.set(this.searchingAtom, false);
        }
    }

    // Drill-downs over the SAME governed edge with identical status branching. Each
    // resolves a symbol to its 360° context / callers / callees; a policy verdict or
    // not-indexed payload degrades truthfully instead of showing a fabricated graph.
    async definition(symbol: string) {
        await this.drill("definition", symbol);
    }

    async findReferences(symbol: string) {
        await this.drill("find_references", symbol);
    }

    async callGraph(symbol: string) {
        await this.drill("call_graph", symbol);
    }

    async drill(tool: string, symbol: string) {
        const target = symbol.trim();
        if (target === "") {
            return;
        }
        globalStore.set(this.drillingAtom, `${tool}:${target}`);
        globalStore.set(this.drillNoticeAtom, "");
        try {
            const code = await fetchCodeIntel(getRecoderBackendUrl(), tool, { symbol: target });
            globalStore.set(this.drillAtom, code.hits);
            globalStore.set(this.drillNoticeAtom, code.notice);
        } catch {
            globalStore.set(this.drillAtom, []);
            globalStore.set(this.drillNoticeAtom, "Not connected.");
        } finally {
            globalStore.set(this.drillingAtom, "");
        }
    }
}

// --- RAG projection ----------------------------------------------------------

// Run the RAG search leg. A non-2xx yields a truthful notice; a `not_configured`
// body (a 200 by contract) surfaces the "repo not indexed" line with no passages;
// otherwise passages are projected and a partial-degrade notice is set when SOME
// (not all) candidate generators were down. Throws only on transport failure.
async function fetchRagSearch(base: string, query: string, topK: number): Promise<RagOutcome> {
    const res = await fetch(`${base}/api/agent-os/retrieval/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { passages: [], notice: readErrorReason(body) || `Search unavailable (${res.status})`, sourcesNotice: "" };
    }
    const data = body?.data != null && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
    if (data.status === "not_configured") {
        return { passages: [], notice: RepoNotIndexedNotice, sourcesNotice: "" };
    }
    const passages = projectPassages(data.passages);
    return {
        passages,
        notice: passages.length === 0 ? "No passages matched." : "",
        sourcesNotice: partialSourcesNotice(data.sources),
    };
}

function projectPassages(value: unknown): RecoderCodebasePassage[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: RecoderCodebasePassage[] = [];
    for (const raw of value) {
        const p = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        if (typeof p.text !== "string" || p.text === "") {
            continue;
        }
        const passage: RecoderCodebasePassage = {
            id: String(p.id ?? ""),
            text: p.text,
            score: typeof p.score === "number" && Number.isFinite(p.score) ? p.score : 0,
        };
        const source = typeof p.source === "string" && p.source !== "" ? p.source : "";
        out.push(source === "" ? passage : { ...passage, source });
    }
    return out;
}

// Truthful partial-degrade line for RAG WITHOUT naming generators (qdrant/colbert
// are backend plumbing the user must never see): a half-empty search never reads
// as complete, but a count is equally truthful and stays terminal-plain.
function partialSourcesNotice(value: unknown): string {
    if (!Array.isArray(value)) {
        return "";
    }
    const down = value.filter((s) => s != null && typeof s === "object" && (s as { available?: unknown }).available === false);
    if (down.length === 0 || down.length === value.length) {
        return "";
    }
    const noun = down.length === 1 ? "source is" : "sources are";
    return `${down.length} search ${noun} temporarily unavailable — showing partial results.`;
}

// --- code-intel (recodergit) projection --------------------------------------

// Run ONE governed recodergit code-intel call. Non-2xx yields a truthful notice;
// otherwise the wire outcome is branched by gate status and by the tool payload's
// own degrade shape. Throws only on transport failure so the caller can render
// "Not connected.".
async function fetchCodeIntel(base: string, tool: string, args: Record<string, unknown>): Promise<CodeIntelOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/recodergit/${tool}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { hits: [], notice: readErrorReason(body) || `Code graph unavailable (${res.status})` };
    }
    return projectCodeIntelWire(body);
}

// Branch on the governed edge's `data.status` (completed vs denied/needs_approval/
// failed) AND on the tool payload's own truthful degrade ({available:false} or
// {ok:false}). A denial/approval reason is surfaced verbatim; a `failed` verdict
// falls to the generic line (its reason may carry internal engine detail).
function projectCodeIntelWire(body: unknown): CodeIntelOutcome {
    const data = (body as { data?: unknown })?.data != null && typeof (body as { data?: unknown }).data === "object"
        ? ((body as { data: Record<string, unknown> }).data)
        : {};
    const status = typeof data.status === "string" ? data.status : "";
    if (status !== "completed") {
        return { hits: [], notice: gateDegradeNotice(status, data.reason) };
    }
    const payload = data.result;
    if (isDegradePayload(payload)) {
        return { hits: [], notice: degradeReason(payload) || CodeUnavailableNotice };
    }
    return { hits: projectSymbols(payload), notice: "" };
}

function gateDegradeNotice(status: string, reason: unknown): string {
    const r = typeof reason === "string" ? reason : "";
    if (status === "needs_approval") {
        return r || "Code graph query is pending approval.";
    }
    if (status === "denied") {
        return r || "Code graph query was not permitted by policy.";
    }
    return CodeUnavailableNotice;
}

// A truthful degrade payload from the recodergit tool: the in-proc lib returns
// {available:false, reason} (not indexed / lib absent / engine error), while a
// disabled engine surfaces {ok:false, reason}. Either means "no graph", never a hit.
function isDegradePayload(payload: unknown): boolean {
    if (payload == null || typeof payload !== "object") {
        return false;
    }
    const p = payload as Record<string, unknown>;
    return p.available === false || p.ok === false;
}

function degradeReason(payload: unknown): string {
    const p = payload != null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    return typeof p.reason === "string" ? p.reason : "";
}

const HIT_ARRAY_KEYS: readonly string[] = ["symbols", "matches", "results", "hits"];
const LABEL_KEYS: readonly string[] = ["name", "symbol", "title", "qualifiedName", "id"];
const DETAIL_KEYS: readonly string[] = ["filePath", "path", "location", "file"];
const ID_KEYS: readonly string[] = ["uid", "id"];

// Project the opaque engine payload into terminal-renderable hits. The vendored
// recodergit payload is passed through untouched by the backend, so the shape is
// not statically known: read the first array field we recognise and keep only
// entries that carry a real label. An unlabelled entry is DROPPED rather than
// shown as a fabricated "" symbol.
function projectSymbols(payload: unknown): RecoderCodebaseSymbol[] {
    const arr = findHitArray(payload);
    const out: RecoderCodebaseSymbol[] = [];
    for (const raw of arr) {
        const item = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const label = firstString(item, LABEL_KEYS);
        if (label === "") {
            continue;
        }
        const detail = firstString(item, DETAIL_KEYS);
        const id = firstString(item, ID_KEYS) || label;
        const hit: RecoderCodebaseSymbol = { id, label };
        out.push(detail === "" ? hit : { ...hit, detail });
    }
    return out;
}

function findHitArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
        return payload;
    }
    const p = payload != null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    for (const key of HIT_ARRAY_KEYS) {
        if (Array.isArray(p[key])) {
            return p[key] as unknown[];
        }
    }
    return [];
}

function firstString(item: Record<string, unknown>, keys: readonly string[]): string {
    for (const key of keys) {
        const value = item[key];
        if (typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }
    }
    return "";
}

export {
    RecoderCodebaseViewModel,
    type CodeIntelOutcome,
    type RagOutcome,
    type RecoderCodebasePassage,
    type RecoderCodebaseSymbol,
};
