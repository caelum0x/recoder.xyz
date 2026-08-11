// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { usageCostTitle, type MeteringRowDisplay } from "@/app/view/recoder/recoder-metering";
import { FIELD_LABEL, META, PAGE_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderUsageViewModel } from "./recoder-usage-model";

const REFRESH_MS = 6000;

function TotalCell({ label, value, title }: { label: string; value: string; title?: string }) {
    return (
        <div className="flex flex-col gap-0.5" title={title}>
            <div className={FIELD_LABEL}>{label}</div>
            <div className="text-sm font-medium tabular-nums">{value}</div>
        </div>
    );
}

function CallRow({ row }: { row: MeteringRowDisplay }) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={row.attribution}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{row.model}</span>
                <span className={`${STATE_CHIP} font-mono`}>{row.tier}</span>
                {row.provider != "—" && <span className={STATE_CHIP}>{row.provider}</span>}
                <span className="ml-auto text-xs tabular-nums text-secondary">{row.time}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-secondary tabular-nums">
                <span>in {row.inputTokens}</span>
                <span>out {row.outputTokens}</span>
                <span>total {row.totalTokens}</span>
                <span className="ml-auto font-medium text-primary">{row.cost}</span>
            </div>
        </div>
    );
}

function RecoderUsageView({ model }: ViewComponentProps<RecoderUsageViewModel>) {
    const display = useAtomValue(model.displayAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showDisconnected = !connected && !loading && error == "";
    const costTitle = usageCostTitle(display);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Usage</span>
                <span className={`${STATE_CHIP} ml-auto`}>{display.scopeLabel}</span>
            </div>

            <div className="flex flex-wrap gap-4 rounded border border-border p-2" title={costTitle}>
                <TotalCell label="Cost" value={display.totals.cost} title={costTitle} />
                <TotalCell label="Calls" value={display.totals.calls} />
                <TotalCell label="Input" value={display.totals.inputTokens} />
                <TotalCell label="Output" value={display.totals.outputTokens} />
                <TotalCell label="Total tokens" value={display.totals.totalTokens} />
            </div>
            <div className={META}>{costTitle}</div>

            <RecoderErrorRow message={error} />
            {loading && display.recent.length == 0 && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Inference usage loads once it is ready." />
            )}

            {notice != "" && display.recent.length == 0 && !showDisconnected && (
                <RecoderEmpty title={notice} hint="Per-call routing and token usage will appear here." />
            )}

            {display.recent.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Recent calls</div>
                    {display.recent.map((row, i) => (
                        <CallRow key={`${row.time}-${i}`} row={row} />
                    ))}
                </div>
            )}
        </div>
    );
}

RecoderUsageView.displayName = "RecoderUsageView";

export { RecoderUsageView };
