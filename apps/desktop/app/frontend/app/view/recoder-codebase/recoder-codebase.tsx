// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, PAGE_TITLE, QUIET_BTN, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderCodebasePassage, RecoderCodebaseSymbol, RecoderCodebaseViewModel } from "./recoder-codebase-model";

const REFRESH_MS = 6000;

function PassageRow({ passage }: { passage: RecoderCodebasePassage }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2" title={passage.id}>
            <div className="text-sm whitespace-pre-wrap break-words">{passage.text}</div>
            {passage.source != null && passage.source != "" && (
                <div className="text-xs text-secondary font-mono truncate">{passage.source}</div>
            )}
        </div>
    );
}

interface SymbolRowProps {
    symbol: RecoderCodebaseSymbol;
    busy: boolean;
    onDefinition: () => void;
    onReferences: () => void;
    onCallGraph: () => void;
}

function SymbolRow({ symbol, busy, onDefinition, onReferences, onCallGraph }: SymbolRowProps) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={symbol.id}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{symbol.label}</span>
                {symbol.detail != null && symbol.detail != "" && (
                    <span className={`${STATE_CHIP} ml-auto font-mono`}>{symbol.detail}</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button disabled={busy} className={QUIET_BTN} onClick={onDefinition}>
                    Definition
                </button>
                <button disabled={busy} className={QUIET_BTN} onClick={onReferences}>
                    References
                </button>
                <button disabled={busy} className={QUIET_BTN} onClick={onCallGraph}>
                    Call graph
                </button>
            </div>
        </div>
    );
}

function RecoderCodebaseView({ model }: ViewComponentProps<RecoderCodebaseViewModel>) {
    const query = useAtomValue(model.queryAtom);
    const passages = useAtomValue(model.passagesAtom);
    const symbols = useAtomValue(model.symbolsAtom);
    const searching = useAtomValue(model.searchingAtom);
    const ragNotice = useAtomValue(model.ragNoticeAtom);
    const codeNotice = useAtomValue(model.codeNoticeAtom);
    const sourcesNotice = useAtomValue(model.sourcesNoticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);
    const indexNotice = useAtomValue(model.indexNoticeAtom);
    const drill = useAtomValue(model.drillAtom);
    const drillNotice = useAtomValue(model.drillNoticeAtom);
    const drilling = useAtomValue(model.drillingAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const hasQuery = query.trim() != "";
    const showDisconnected = !connected && !loading;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Codebase</span>
                {indexNotice != "" && <span className={`${STATE_CHIP} ml-auto`}>{indexNotice}</span>}
            </div>
            <div className="flex items-center gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="Ask the repo…"
                    value={query}
                    onChange={(e) => model.setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            model.search();
                        }
                    }}
                />
                <button disabled={searching} className={QUIET_BTN} onClick={() => model.search()}>
                    {searching ? "…" : "Ask"}
                </button>
            </div>
            <RecoderErrorRow message={error} />
            {loading && !hasQuery && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Codebase intel loads once it is ready." />
            )}

            {hasQuery && (
                <>
                    <div className="flex flex-col gap-1">
                        <div className={FIELD_LABEL}>Passages</div>
                        {sourcesNotice != "" && <div className="text-secondary text-sm">{sourcesNotice}</div>}
                        {ragNotice != "" && <div className="text-secondary text-sm">{ragNotice}</div>}
                        {passages.map((p) => (
                            <PassageRow key={p.id} passage={p} />
                        ))}
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className={FIELD_LABEL}>Code graph</div>
                        {codeNotice != "" && <div className="text-secondary text-sm">{codeNotice}</div>}
                        {symbols.map((s) => (
                            <SymbolRow
                                key={s.id}
                                symbol={s}
                                busy={drilling != ""}
                                onDefinition={() => model.definition(s.label)}
                                onReferences={() => model.findReferences(s.label)}
                                onCallGraph={() => model.callGraph(s.label)}
                            />
                        ))}
                    </div>

                    {(drill.length > 0 || drillNotice != "") && (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>Drill-down</div>
                            {drillNotice != "" && <div className="text-secondary text-sm">{drillNotice}</div>}
                            {drill.map((s) => (
                                <div
                                    key={s.id}
                                    className="flex items-center gap-2 rounded border border-border p-2"
                                    title={s.id}
                                >
                                    <span className="text-sm font-medium truncate">{s.label}</span>
                                    {s.detail != null && s.detail != "" && (
                                        <span className={`${STATE_CHIP} ml-auto font-mono`}>{s.detail}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {!hasQuery && !showDisconnected && (
                <RecoderEmpty
                    title="Ask the repo"
                    hint="Search indexed passages and the code graph. Results degrade truthfully when the repo is not indexed."
                />
            )}
        </div>
    );
}

RecoderCodebaseView.displayName = "RecoderCodebaseView";

export { RecoderCodebaseView };
