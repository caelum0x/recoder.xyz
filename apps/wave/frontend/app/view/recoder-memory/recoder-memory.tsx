// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
    RecoderMemoryCandidate,
    RecoderMemoryItem,
    RecoderMemoryResult,
    RecoderMemoryViewModel,
} from "./recoder-memory-model";

function MemoryItemRow({ item }: { item: RecoderMemoryItem }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={item.memoryId}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{item.title || "Untitled memory"}</span>
                <span className="text-xs text-secondary rounded bg-border/60 px-1.5 py-0.5 ml-auto">{item.scope}</span>
            </div>
            {item.body != "" && <div className="text-xs text-secondary line-clamp-3">{item.body}</div>}
            {item.evidence?.taskId && (
                <div className="text-xs text-secondary font-mono truncate">task {item.evidence.taskId}</div>
            )}
        </div>
    );
}

function ResultRow({ result }: { result: RecoderMemoryResult }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={result.id}>
            <div className="text-sm">{result.memory}</div>
        </div>
    );
}

function CandidateRow({ candidate }: { candidate: RecoderMemoryCandidate }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={candidate.candidateId}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{candidate.title || "Untitled candidate"}</span>
                <span className="text-xs text-secondary rounded bg-border/60 px-1.5 py-0.5 ml-auto">
                    {candidate.status}
                </span>
            </div>
            {candidate.body != "" && <div className="text-xs text-secondary line-clamp-3">{candidate.body}</div>}
            <div className="text-xs text-secondary">by {candidate.proposedBy || "unknown"}</div>
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
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

    const hasQuery = query.trim() != "";
    const showDisconnected = !connected && !loading && error == "";
    const showEmpty = connected && !loading && items.length == 0 && candidates.length == 0;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Memory</span>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
            </div>
            <div className="flex items-center gap-2">
                <input
                    className="flex-1 rounded border border-border bg-transparent px-2 py-0.5 text-sm outline-none focus:border-accent"
                    placeholder="Search memory…"
                    value={query}
                    onChange={(e) => model.setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            model.search();
                        }
                    }}
                />
                <button
                    disabled={searching}
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                    onClick={() => model.search()}
                >
                    {searching ? "…" : "Search"}
                </button>
            </div>
            {error != "" && <div className="text-error text-sm">{error}</div>}
            {loading && items.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showDisconnected && (
                <div className="text-secondary text-sm">
                    Not connected — start the Recoder backend to browse durable memory.
                </div>
            )}

            {hasQuery && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary">Search results</div>
                    {searchNotice != "" && <div className="text-secondary text-sm">{searchNotice}</div>}
                    {results.map((r) => (
                        <ResultRow key={r.id} result={r} />
                    ))}
                </div>
            )}

            {!hasQuery && (
                <>
                    {showEmpty && <div className="text-secondary text-sm">No memories yet.</div>}
                    {items.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className="text-xs uppercase tracking-wide text-secondary">Memory ({items.length})</div>
                            {items.map((item) => (
                                <MemoryItemRow key={item.memoryId} item={item} />
                            ))}
                        </div>
                    )}
                    {candidates.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className="text-xs uppercase tracking-wide text-secondary">
                                Pending candidates ({candidates.length})
                            </div>
                            {candidates.map((c) => (
                                <CandidateRow key={c.candidateId} candidate={c} />
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
