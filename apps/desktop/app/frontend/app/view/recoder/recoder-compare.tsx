// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { agentLabel } from "./recoder-agent-labels";
import {
    RecoderViewModel,
    type CompareView,
    type MergeabilityView,
    type ReadinessSignal,
    type ReadinessView,
    type SiblingCompareEntry,
} from "./recoder-model";

const MERGE_BTN =
    "border border-border text-secondary rounded px-2 py-0.5 text-xs hover:bg-border/40 transition-colors cursor-pointer disabled:opacity-50";

// Truthful, never-green verdict chrome: the graphite accent marks a real pass,
// error marks a real block, everything unproven stays neutral so an `unknown`
// verdict can never read as a win.
const VERDICT_STYLE: Record<string, string> = {
    ready: "bg-accent/20 text-accent",
    blocked: "bg-error/20 text-error",
    not_ready: "border border-border text-secondary",
    unknown: "border border-border text-secondary",
};

// Per-signal chrome mirrors the verdict palette: only a real pass earns accent,
// pending/unknown stay neutral so we never coerce an unproven signal into a pass.
const SIGNAL_STYLE: Record<string, string> = {
    pass: "text-accent",
    fail: "text-error",
    pending: "text-secondary",
    unknown: "text-secondary",
};

const SIGNAL_GLYPH: Record<string, string> = {
    pass: "✓",
    fail: "✗",
    pending: "…",
    unknown: "?",
};

function verdictLabel(verdict: string): string {
    return verdict == "not_ready" ? "not ready" : verdict;
}

function ReadinessBadge({ readiness }: { readiness: ReadinessView }) {
    if (readiness == null) {
        return <span className="text-xs text-secondary">readiness unavailable</span>;
    }
    const style = VERDICT_STYLE[readiness.verdict] ?? VERDICT_STYLE.unknown;
    return (
        <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-xs ${style}`}>{verdictLabel(readiness.verdict)}</span>
            <div className="flex items-center gap-1">
                {readiness.signals.map((s: ReadinessSignal) => (
                    <span
                        key={s.id}
                        className={`text-xs ${SIGNAL_STYLE[s.status] ?? SIGNAL_STYLE.unknown}`}
                        title={`${s.id}: ${s.status}${s.detail ? ` — ${s.detail}` : ""}`}
                    >
                        {s.id} {SIGNAL_GLYPH[s.status] ?? SIGNAL_GLYPH.unknown}
                    </span>
                ))}
            </div>
        </div>
    );
}

ReadinessBadge.displayName = "ReadinessBadge";

function MergeabilityBadge({ mergeability }: { mergeability: MergeabilityView }) {
    if (mergeability == null) {
        return <span className="text-xs text-secondary">mergeability unavailable</span>;
    }
    if (!mergeability.available) {
        return (
            <span className="text-xs text-secondary" title={mergeability.reason || "not available"}>
                merge: {mergeability.reason || "unavailable"}
            </span>
        );
    }
    const count = mergeability.conflicts?.length ?? 0;
    const tone = mergeability.verdict == "conflicting" ? "text-error" : "text-secondary";
    return (
        <span
            className={`text-xs ${tone}`}
            title={count > 0 ? mergeability.conflicts.join(", ") : `base ${mergeability.base} ← ${mergeability.branch}`}
        >
            merge: {mergeability.verdict}
            {mergeability.verdict == "conflicting" ? ` (${count} conflict${count == 1 ? "" : "s"})` : ""}
        </span>
    );
}

MergeabilityBadge.displayName = "MergeabilityBadge";

type SiblingCompareRowProps = {
    model: RecoderViewModel;
    sibling: SiblingCompareEntry;
    readiness: ReadinessView;
    mergeability: MergeabilityView;
    status: string;
    busy: boolean;
};

function SiblingCompareRow({ model, sibling, readiness, mergeability, status, busy }: SiblingCompareRowProps) {
    const stat = sibling.diffStat;
    return (
        <div className="flex flex-col gap-1 rounded border border-border px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm">{agentLabel(sibling.agent)}</span>
                <span className="text-xs text-secondary">{sibling.state}</span>
                {stat != null ? (
                    <span className="text-xs text-secondary">
                        +{stat.additions} −{stat.deletions} · {stat.files} file{stat.files == 1 ? "" : "s"}
                    </span>
                ) : (
                    <span className="text-xs text-secondary">{sibling.diffStatReason || "diff unavailable"}</span>
                )}
                <div className="flex-1" />
                <button
                    className={MERGE_BTN}
                    disabled={busy}
                    onClick={() => model.mergeWorkspace(sibling.workspaceId)}
                    title={`Merge ${agentLabel(sibling.agent)}'s branch ${sibling.branch}`}
                >
                    {busy ? "…" : "Merge this"}
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ReadinessBadge readiness={readiness} />
                <MergeabilityBadge mergeability={mergeability} />
            </div>
            {status && <div className="text-xs text-secondary">{status}</div>}
        </div>
    );
}

SiblingCompareRow.displayName = "SiblingCompareRow";

function ContestedSet({ compareView }: { compareView: CompareView }) {
    const contested = compareView.contested ?? [];
    const agentByWs = new Map(compareView.siblings.map((s) => [s.workspaceId, s.agent]));
    if (contested.length == 0) {
        return <div className="text-xs text-secondary">No overlapping files across siblings — no contested set.</div>;
    }
    return (
        <div className="flex flex-col gap-1 rounded border border-border px-2 py-1.5">
            <div className="text-xs uppercase tracking-wide text-secondary">
                Contested — {contested.length} file{contested.length == 1 ? "" : "s"} touched by 2+ agents
            </div>
            {contested.map((c) => (
                <div key={c.path} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="truncate">{c.path}</span>
                    <span className="text-xs text-secondary">
                        {c.workspaceIds.map((id) => agentLabel(agentByWs.get(id) ?? id)).join(" · ")}
                    </span>
                </div>
            ))}
        </div>
    );
}

ContestedSet.displayName = "ContestedSet";

function RecoderComparePanel({ model, compareView }: { model: RecoderViewModel; compareView: CompareView }) {
    const readinessMap = useAtomValue(model.readinessAtom);
    const rowStatus = useAtomValue(model.rowStatusAtom);
    const busyRow = useAtomValue(model.busyRowAtom);
    return (
        <div className="flex flex-col gap-1.5 rounded border border-border p-2">
            <ContestedSet compareView={compareView} />
            <div className="flex flex-col gap-1">
                {compareView.siblings.map((sibling) => {
                    const merge = readinessMap[sibling.workspaceId];
                    return (
                        <SiblingCompareRow
                            key={sibling.workspaceId}
                            model={model}
                            sibling={sibling}
                            readiness={merge?.readiness}
                            mergeability={merge?.mergeability}
                            status={rowStatus[sibling.workspaceId]}
                            busy={busyRow == sibling.workspaceId}
                        />
                    );
                })}
            </div>
        </div>
    );
}

RecoderComparePanel.displayName = "RecoderComparePanel";

export { RecoderComparePanel };
