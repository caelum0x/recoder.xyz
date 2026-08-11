// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, PAGE_TITLE, PRIMARY_BTN, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderIngestViewModel } from "./recoder-ingest-model";

const REFRESH_MS = 6000;

function RecoderIngestView({ model }: ViewComponentProps<RecoderIngestViewModel>) {
    const text = useAtomValue(model.textAtom);
    const ingesting = useAtomValue(model.ingestingAtom);
    const outcome = useAtomValue(model.outcomeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);
    const indexed = useAtomValue(model.indexedAtom);
    const indexNotice = useAtomValue(model.indexNoticeAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const hasText = text.trim() != "";
    const showDisconnected = !connected && !loading && indexNotice == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Teach the repo</span>
                {indexNotice != "" && <span className={`${STATE_CHIP} ml-auto`}>{indexNotice}</span>}
            </div>

            <div className="flex flex-col gap-1">
                <div className={FIELD_LABEL}>Team knowledge</div>
                <textarea
                    className={`${INPUT} min-h-[8rem] resize-y font-mono`}
                    placeholder="Paste a convention, decision, or fact your agents should recall…"
                    value={text}
                    onChange={(e) => model.setText(e.target.value)}
                />
                <div className="flex items-center gap-2">
                    <button disabled={ingesting || !hasText} className={PRIMARY_BTN} onClick={() => model.ingest()}>
                        {ingesting ? "Ingesting…" : "Ingest"}
                    </button>
                    <span className="text-secondary text-xs">
                        Added knowledge flows into ask-the-repo search.
                    </span>
                </div>
            </div>

            <RecoderErrorRow message={error} />

            {outcome != null && outcome.status == "ingested" && (
                <div className="text-secondary text-sm">
                    Ingested — {outcome.chunks} chunk{outcome.chunks == 1 ? "" : "s"} embedded, {outcome.upserted}{" "}
                    upserted into team knowledge.
                </div>
            )}
            {outcome != null && outcome.status == "empty" && (
                <div className="text-secondary text-sm">{outcome.notice}</div>
            )}
            {outcome != null && outcome.status == "not_configured" && (
                <RecoderEmpty title="Repo index not configured" hint={outcome.notice} />
            )}

            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Teach-the-repo loads once it is ready." />
            )}

            {outcome == null && error == "" && !showDisconnected && (
                <RecoderEmpty
                    title="Teach the repo"
                    hint="Add team knowledge inline so agents recall it. Nothing is written until the repo index is configured."
                />
            )}
        </div>
    );
}

RecoderIngestView.displayName = "RecoderIngestView";

export { RecoderIngestView };
