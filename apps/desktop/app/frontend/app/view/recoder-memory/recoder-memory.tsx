// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import {
    FIELD_LABEL,
    INPUT,
    PAGE_TITLE,
    PICK_BTN_ON,
    PRIMARY_BTN,
    QUIET_BTN,
    QUIET_BTN_XS,
    STATE_CHIP,
} from "@/app/view/recoder/recoder-styles";
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

// The launcher seeds this store with the dev's repos, most-recent first; the head
// entry is the repo they are actively working. Kept in sync with recoder-model's
// RECENT_REPOS_KEY so the "this repo" recall scope points at the same target.
const RECENT_REPOS_KEY = "recoder:recent-repos";

// The repo the "this repo" toggle scopes recall to. Degrade-safe: a corrupt or
// absent store yields "" so the toggle stays a truthful no-op instead of guessing.
function readCurrentRepoRef(): string {
    try {
        const raw = globalThis.localStorage?.getItem(RECENT_REPOS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) {
            return "";
        }
        const first = arr.find((x: unknown): x is string => typeof x == "string" && x.trim() != "");
        return first ?? "";
    } catch {
        return "";
    }
}

// WHY-it-surfaced chips read as plain words; "recency" becomes "recent" so the
// row explains the moat (repo-scoped / fresh recall) in one calm glance.
const SIGNAL_LABEL: Record<RecallSignal, string> = {
    "repo-match": "repo-match",
    recency: "recent",
    lexical: "lexical",
};

interface MemoryItemRowProps {
    item: RecoderMemoryItem;
    busy: boolean;
    onForget: () => void;
}

function MemoryItemRow({ item, busy, onForget }: MemoryItemRowProps) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={item.memoryId}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{item.title || "Untitled lesson"}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{item.scope}</span>
            </div>
            {item.body != "" && <div className="text-xs text-secondary line-clamp-3">{item.body}</div>}
            {item.evidence?.taskId && (
                <div className="text-xs text-secondary font-mono truncate">task {item.evidence.taskId}</div>
            )}
            <div className="flex items-center">
                <button disabled={busy} className={`${QUIET_BTN_XS} ml-auto`} onClick={onForget}>
                    {busy ? "…" : "Forget"}
                </button>
            </div>
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
    // Only the user-facing why-signals surface here. The raw source engine and
    // score are internal recall mechanics — never leaked into the calm row.
    const signals = result.provenance?.signals ?? [];
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={result.id}>
            {result.title != null && result.title != "" && (
                <div className="text-sm font-medium truncate">{result.title}</div>
            )}
            <div className="text-sm">{result.memory}</div>
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
                <span className="text-sm font-medium truncate">{candidate.title || "Untitled lesson"}</span>
                <span className={`${STATE_CHIP} ml-auto`}>ephemeral</span>
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
    const scopeThisRepo = useAtomValue(model.scopeThisRepoAtom);
    const repoRef = useAtomValue(model.repoRefAtom);
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

    useEffect(() => {
        model.setRepoRef(readCurrentRepoRef());
    }, [model]);

    const handleForget = (item: RecoderMemoryItem) => {
        const reason = window.prompt(`Forget "${item.title || "this lesson"}"? Optional reason:`, "");
        if (reason == null) {
            return;
        }
        model.forgetItem(item.memoryId, reason);
    };

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
                {repoRef != "" && (
                    <button
                        className={scopeThisRepo ? PICK_BTN_ON : QUIET_BTN}
                        title={`Rank this repo's prior-run lessons first — ${repoRef}`}
                        aria-pressed={scopeThisRepo}
                        onClick={() => {
                            model.setScopeThisRepo(!scopeThisRepo);
                            if (query.trim() != "") {
                                model.search();
                            }
                        }}
                    >
                        This repo
                    </button>
                )}
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
                            title="No lessons yet"
                            hint="They accumulate as agents complete work."
                        />
                    )}
                    {items.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>Lessons ({items.length})</div>
                            {items.map((item) => (
                                <MemoryItemRow
                                    key={item.memoryId}
                                    item={item}
                                    busy={acting == item.memoryId}
                                    onForget={() => handleForget(item)}
                                />
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
