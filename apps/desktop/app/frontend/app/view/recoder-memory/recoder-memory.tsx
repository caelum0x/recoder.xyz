// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
    RecallSignal,
    RecoderMemoryCandidate,
    RecoderMemoryItem,
    RecoderMemoryResult,
    RecoderMemoryViewModel,
} from "./recoder-memory-model";

const REFRESH_MS = 6000;

// WHY-it-surfaced chips read as plain words; "recency" becomes "recent" so the
// row explains the moat (repo-scoped / fresh recall) in one calm glance.
const SIGNAL_LABEL: Record<RecallSignal, string> = {
    "repo-match": "repo-match",
    recency: "recent",
    lexical: "lexical",
};

function MemoryItemRow({ item }: { item: RecoderMemoryItem }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={item.memoryId}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{item.title || "Untitled memory"}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{item.scope}</span>
            </div>
            {item.body != "" && <div className="text-xs text-secondary line-clamp-3">{item.body}</div>}
            {item.evidence?.taskId && (
                <div className="text-xs text-secondary font-mono truncate">task {item.evidence.taskId}</div>
            )}
        </div>
    );
}

function SignalChips({ signals }: { signals: readonly RecallSignal[] }) {
    if (signals.length == 0) {
        return null;
    }
    return (
        <div className="flex flex-wrap items-center gap-1">
            {signals.map((s) => (
                <span key={s} className={STATE_CHIP}>
                    {SIGNAL_LABEL[s]}
                </span>
            ))}
        </div>
    );
}

function ResultRow({ result }: { result: RecoderMemoryResult }) {
    const provenance = result.provenance;
    const signals = provenance?.signals ?? [];
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={result.id}>
            {result.title != null && result.title != "" && (
                <div className="text-sm font-medium truncate">{result.title}</div>
            )}
            <div className="text-sm">{result.memory}</div>
            {provenance != null && (
                <div className="text-xs text-secondary font-mono truncate">
                    {provenance.source} · {provenance.score.toFixed(2)}
                    {provenance.scope != null && provenance.scope != "" ? ` · ${provenance.scope}` : ""}
                </div>
            )}
            <SignalChips signals={signals} />
        </div>
    );
}

interface CandidateRowProps {
    candidate: RecoderMemoryCandidate;
    busy: boolean;
    onAccept: () => void;
    onReject: () => void;
}

function CandidateRow({ candidate, busy, onAccept, onReject }: CandidateRowProps) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={candidate.candidateId}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{candidate.title || "Untitled candidate"}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{candidate.status}</span>
            </div>
            {candidate.body != "" && (
                <div className="text-xs text-secondary whitespace-pre-wrap break-words">{candidate.body}</div>
            )}
            <div className="text-xs text-secondary">by {candidate.proposedBy || "unknown"}</div>
            <div className="flex items-center gap-2">
                <button disabled={busy} className={PRIMARY_BTN} onClick={onAccept}>
                    {busy ? "…" : "Accept"}
                </button>
                <button disabled={busy} className={QUIET_BTN} onClick={onReject}>
                    {busy ? "…" : "Reject"}
                </button>
            </div>
        </div>
    );
}

function RecoderMemoryView({ model }: ViewComponentProps<RecoderMemoryViewModel>) {
    const query = useAtomValue(model.queryAtom);
    const items = useAtomValue(model.itemsAtom);
    const candidates = useAtomValue(model.candidatesAtom);
    const results = useAtomValue(model.resultsAtom);
    const loading = useAtomValue(model.loadingAtom);
    const searching = useAtomValue(model.searchingAtom);
    const error = useAtomValue(model.errorAtom);
    const searchNotice = useAtomValue(model.searchNoticeAtom);
    const sourcesNotice = useAtomValue(model.sourcesNoticeAtom);
    const connected = useAtomValue(model.connectedAtom);
    const acting = useAtomValue(model.actingAtom);
    const actionError = useAtomValue(model.actionErrorAtom);
    const actionNotice = useAtomValue(model.actionNoticeAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const hasQuery = query.trim() != "";
    const showDisconnected = !connected && !loading && error == "";
    const showEmpty = connected && !loading && items.length == 0 && candidates.length == 0;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Memory</span>
            </div>
            <div className="flex items-center gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="Search memory…"
                    value={query}
                    onChange={(e) => model.setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            model.search();
                        }
                    }}
                />
                <button disabled={searching} className={QUIET_BTN} onClick={() => model.search()}>
                    {searching ? "…" : "Search"}
                </button>
            </div>
            <RecoderErrorRow message={error} />
            <RecoderErrorRow message={actionError} />
            {actionNotice != "" && <div className="text-secondary text-sm">{actionNotice}</div>}
            {loading && items.length == 0 && <RecoderSkeleton rows={4} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Memory loads once it is ready." />
            )}

            {hasQuery && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Search results</div>
                    {sourcesNotice != "" && <div className="text-secondary text-sm">{sourcesNotice}</div>}
                    {searchNotice != "" && <div className="text-secondary text-sm">{searchNotice}</div>}
                    {results.map((r) => (
                        <ResultRow key={r.id} result={r} />
                    ))}
                </div>
            )}

            {!hasQuery && (
                <>
                    {showEmpty && (
                        <RecoderEmpty
                            title="No memories yet"
                            hint="Facts and conventions are captured here as agents complete work."
                        />
                    )}
                    {items.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>Memory ({items.length})</div>
                            {items.map((item) => (
                                <MemoryItemRow key={item.memoryId} item={item} />
                            ))}
                        </div>
                    )}
                    {candidates.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>Pending candidates ({candidates.length})</div>
                            <div className="text-xs text-secondary">
                                Reusable lessons shaped from completed runs — ephemeral until a reviewer promotes
                                them.
                            </div>
                            {candidates.map((c) => (
                                <CandidateRow
                                    key={c.candidateId}
                                    candidate={c}
                                    busy={acting == c.candidateId}
                                    onAccept={() => model.acceptCandidate(c.candidateId)}
                                    onReject={() => model.rejectCandidate(c.candidateId)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

RecoderMemoryView.displayName = "RecoderMemoryView";

export { RecoderMemoryView };
