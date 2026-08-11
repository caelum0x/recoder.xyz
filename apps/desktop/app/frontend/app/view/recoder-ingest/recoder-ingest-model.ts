// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderIngestView } from "./recoder-ingest";

// The normalized outcome of ONE inline-text ingest, projected from the first (and
// only) IngestResult the route returns for a single-doc POST. `chunks`/`upserted`
// are surfaced verbatim so the terminal reports the TRUE count, never a fabricated
// one; `notice` is the honest capability-scoped line for the outcome status.
type RecoderIngestOutcome = {
    status: "ingested" | "empty" | "not_configured";
    chunks: number;
    upserted: number;
    notice: string;
};

// Truthful line when the retrieval index is offline (no embedder/vector store):
// teach-the-repo cannot write anything, and the user learns why instead of a fake
// "added" confirmation.
const NotConfiguredNotice = "Repo index not configured — team knowledge cannot be added until the index is configured.";

// Truthful line when the store accepted the doc but produced no indexable chunks
// (e.g. text that reduced to nothing after preprocessing) — nothing was written.
const EmptyNotice = "No indexable text — nothing was added to team knowledge.";

class RecoderIngestViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    textAtom: PrimitiveAtom<string>;
    ingestingAtom: PrimitiveAtom<boolean>;
    outcomeAtom: PrimitiveAtom<RecoderIngestOutcome>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;
    indexedAtom: PrimitiveAtom<boolean>;
    indexNoticeAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-ingest";
        this.viewIcon = atom("book");
        this.viewName = atom("Teach");
        this.textAtom = atom("") as PrimitiveAtom<string>;
        this.ingestingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.outcomeAtom = atom(null) as PrimitiveAtom<RecoderIngestOutcome>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.indexedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.indexNoticeAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderIngestView;
    }

    setText(value: string) {
        globalStore.set(this.textAtom, value);
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

    // Teach-the-repo WRITE: POST the textarea content as ONE inline-text doc to
    // /retrieval/ingest so it flows into the SAME tenant-bound default collection
    // the shipped ask-the-repo search reads (no `collection` sent → both resolve to
    // rt__<ns>__default). An empty (whitespace) text guards without a request,
    // mirroring recoder-codebase-model. Degrade-safe: a non-2xx surfaces the truthful
    // reason and a transport failure surfaces "Not connected." — never a faked add.
    async ingest() {
        const text = globalStore.get(this.textAtom).trim();
        if (text === "") {
            return;
        }
        globalStore.set(this.ingestingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.outcomeAtom, null);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/retrieval/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docs: [{ text }] }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.errorAtom, readErrorReason(body) || `Ingest unavailable (${res.status})`);
                return;
            }
            const outcome = projectIngestOutcome(body);
            if (outcome == null) {
                globalStore.set(this.errorAtom, "Ingest returned no result.");
                return;
            }
            globalStore.set(this.outcomeAtom, outcome);
        } catch {
            globalStore.set(this.errorAtom, "Not connected.");
            globalStore.set(this.outcomeAtom, null);
        } finally {
            globalStore.set(this.ingestingAtom, false);
        }
    }
}

// --- ingest projection -------------------------------------------------------

// Project the first IngestResult of a single-doc POST into a terminal-renderable
// outcome, branching on its truthful status. An unrecognised status or a missing
// result returns null so the caller degrades honestly rather than showing a
// fabricated "ingested". `chunks`/`upserted` are read verbatim (never invented).
function projectIngestOutcome(body: unknown): RecoderIngestOutcome | null {
    const data = body?.data != null && typeof (body as { data?: unknown }).data === "object"
        ? ((body as { data: Record<string, unknown> }).data)
        : {};
    const results = Array.isArray(data.results) ? data.results : [];
    const first = results[0];
    if (first == null || typeof first !== "object") {
        return null;
    }
    const result = first as Record<string, unknown>;
    const status = typeof result.status === "string" ? result.status : "";
    const chunks = readCount(result.chunks);
    const upserted = readCount(result.upserted);
    const reason = typeof result.reason === "string" ? result.reason : "";
    if (status === "not_configured") {
        return { status: "not_configured", chunks: 0, upserted: 0, notice: NotConfiguredNotice };
    }
    if (status === "empty") {
        return { status: "empty", chunks, upserted, notice: reason || EmptyNotice };
    }
    if (status === "ingested") {
        return { status: "ingested", chunks, upserted, notice: "" };
    }
    return null;
}

function readCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

export { RecoderIngestViewModel, type RecoderIngestOutcome };
