// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtom, useAtomValue } from "jotai";
import { Fragment, useEffect, useState } from "react";
import { agentLabel } from "./recoder-agent-labels";
import {
    fetchPairwiseDiff,
    pairwiseLineKind,
    type PairwiseFetchResult,
    type PairwiseFileRow,
    type PairwiseLineKind,
    type PairwiseView,
} from "./recoder-compare-pairwise";
import { ConvergePanel } from "./recoder-converge";
import {
    deriveCompareColumns,
    headerPairSlot,
    toggleSelection,
    type CompareColumn,
    type ConvergeSelection,
} from "./recoder-converge-logic";
import { buildConvergenceEvidence, saveConvergenceEvidence } from "./recoder-evidence";
import {
    computePairwise,
    computeSiblingOverlap,
    computeSuggestedWinner,
    RecoderViewModel,
    type CompareView,
    type ContestedFile,
    type MergeabilityView,
    type PairwiseCompareView,
    type RecoderDiffSummary,
    type ReadinessSignal,
    type ReadinessView,
    type RecoderMergeRecord,
    type SiblingCompareEntry,
} from "./recoder-model";
import { RecoderEmpty } from "./recoder-states";
import { FIELD_LABEL, META, PICK_BTN_ON, QUIET_BTN_XS, SAVE_BTN } from "./recoder-styles";

// Explicit sign so a pairwise delta can never be mistaken for an absolute count;
// a negative already carries its own "-".
function fmtSigned(n: number): string {
    return n >= 0 ? `+${n}` : String(n);
}

// Truthful, never-green verdict chrome: the graphite accent marks a real pass,
// error marks a real block, everything unproven stays neutral so an `unknown`
// verdict can never read as a win. `delivered` (already merged) is a real
// positive → graphite accent; `terminal` (archived/cancelled) is a closed,
// unjudged outcome → neutral.
const VERDICT_STYLE: Record<string, string> = {
    ready: "bg-accent/20 text-accent",
    delivered: "bg-accent/20 text-accent",
    blocked: "bg-error/20 text-error",
    not_ready: "border border-white/8 text-secondary",
    terminal: "border border-white/8 text-secondary",
    unknown: "border border-white/8 text-secondary",
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

const VERDICT_LABEL: Record<string, string> = {
    not_ready: "not ready",
    delivered: "merged",
    terminal: "closed",
};

function verdictLabel(verdict: string): string {
    return VERDICT_LABEL[verdict] ?? verdict;
}

function ReadinessBadge({ readiness }: { readiness: ReadinessView }) {
    if (readiness == null) {
        return <span className={META}>readiness unavailable</span>;
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
            {readiness.pr != null && (
                <span
                    className="text-xs text-secondary border border-border rounded px-1"
                    title={readiness.pr.url || `PR #${readiness.pr.number}`}
                >
                    PR #{readiness.pr.number} {readiness.pr.draft ? "(draft)" : readiness.pr.state}
                </span>
            )}
        </div>
    );
}

ReadinessBadge.displayName = "ReadinessBadge";

function MergeabilityBadge({ mergeability }: { mergeability: MergeabilityView }) {
    if (mergeability == null) {
        return <span className={META}>mergeability unavailable</span>;
    }
    const base = mergeability.base?.trim();
    if (!mergeability.available) {
        return (
            <span className={META} title={mergeability.reason || "not available"}>
                merge: {mergeability.reason || "unavailable"}
                {base ? ` (base ${base})` : ""}
            </span>
        );
    }
    const count = mergeability.conflicts?.length ?? 0;
    const tone = mergeability.verdict == "conflicting" ? "text-error" : "text-secondary";
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className={`text-xs ${tone}`}
                title={count > 0 ? mergeability.conflicts.join(", ") : `base ${mergeability.base} ← ${mergeability.branch}`}
            >
                merge: {mergeability.verdict}
                {mergeability.verdict == "conflicting" ? ` (${count} conflict${count == 1 ? "" : "s"})` : ""}
            </span>
            {base ? <span className={META}>base {base}</span> : null}
        </span>
    );
}

MergeabilityBadge.displayName = "MergeabilityBadge";

// The captured governance verdict of the last merge attempt — the truthful record
// the evidence step reads. Only a real `allow` that actually merged earns accent;
// a blocked/failed attempt reads error, an allowed-but-nothing-to-merge stays
// neutral. Absent record ⇒ nothing rendered (no merge attempted yet).
function MergeVerdictLine({ record }: { record: RecoderMergeRecord }) {
    if (record == null) {
        return null;
    }
    const merged = record.status == "merged";
    const tone = merged ? "text-accent" : record.status == "no_change" ? "text-secondary" : "text-error";
    const verdict = record.verdict;
    const parts: string[] = [];
    if (verdict?.effect) parts.push(`gate ${verdict.effect}`);
    if (verdict?.tier) parts.push(`tier ${verdict.tier}`);
    if (verdict?.engine) parts.push(verdict.engine);
    if (verdict?.degraded) parts.push("degraded");
    const meta = parts.join(" · ");
    const head =
        record.status == "merged"
            ? "merged"
            : record.status == "no_change"
              ? "nothing to merge"
              : record.status == "blocked"
                ? "blocked"
                : "could not complete";
    return (
        <div className={`text-xs ${tone}`} title={record.reason || meta || head}>
            merge verdict: {head}
            {meta ? ` — ${meta}` : ""}
        </div>
    );
}

MergeVerdictLine.displayName = "MergeVerdictLine";

type SiblingCompareColumnProps = {
    model: RecoderViewModel;
    sibling: SiblingCompareEntry;
    siblings: SiblingCompareEntry[];
    column: CompareColumn;
    contested: ContestedFile[];
    taskGroup: string;
    readiness: ReadinessView;
    mergeability: MergeabilityView;
    status: string;
    lastMerge: RecoderMergeRecord;
    busy: boolean;
    pickedA: boolean;
    pickedB: boolean;
    suggestedReason: string;
    onPickHeader: () => void;
};

function SiblingCompareColumn({
    model,
    sibling,
    siblings,
    column,
    contested,
    taskGroup,
    readiness,
    mergeability,
    status,
    lastMerge,
    busy,
    pickedA,
    pickedB,
    suggestedReason,
    onPickHeader,
}: SiblingCompareColumnProps) {
    // Merged is authoritative server truth, not just this session's merge action:
    // after a restart or an out-of-band merge lastMerge is null, but the compare
    // feed reports state 'merged' and readiness reports verdict 'delivered'. Deriving
    // from all three hides the failing re-merge button and reveals Save evidence on reload.
    const merged =
        (lastMerge != null && lastMerge.status == "merged") ||
        sibling.state == "merged" ||
        readiness?.verdict == "delivered";
    const overlap = computeSiblingOverlap(sibling, siblings, contested);
    const overlapAgents =
        overlap != null && overlap.count > 0
            ? Array.from(new Set(Object.values(overlap.agentsByFile).flat()))
                  .map(agentLabel)
                  .join(" · ")
            : "";
    // Fetch the durable sealed audit trail first so the exported artifact prefers
    // the server record; an empty trail (solo) falls back to client assembly inside
    // the builder. Degrade-safe: fetchWorkspaceAudit never throws (returns []).
    const onSaveEvidence = async () => {
        const audit = await model.fetchWorkspaceAudit(sibling.workspaceId);
        const evidence = buildConvergenceEvidence({
            winner: sibling,
            siblings,
            readiness,
            mergeability,
            // A reloaded / out-of-band merge has no in-session lastMerge, so synthesize
            // a truthful minimal record (status + timestamp only) from server state.
            // No verdict/sealed block is fabricated — the artifact honestly shows
            // client-assembled provenance for these fields.
            merge: lastMerge ?? { status: "merged", at: sibling.updatedAt },
            taskGroup: taskGroup ?? "",
            audit,
        });
        saveConvergenceEvidence(evidence);
    };
    return (
        <div className="flex min-w-[16rem] flex-1 shrink-0 basis-64 flex-col gap-1 rounded border border-white/8 px-2 py-2 recoder-transition hover:bg-white/[0.04] hover:border-white/12">
            <button
                className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border px-1 py-0.5 text-left cursor-pointer recoder-transition ${
                    pickedA || pickedB ? "border-accent/50 bg-accent/15" : "border-transparent hover:bg-white/[0.04]"
                }`}
                onClick={onPickHeader}
                title={`Pick ${agentLabel(sibling.agent)} for the line-level A/B diff — click two column headers to load it`}
            >
                {(pickedA || pickedB) && <span className="text-xs text-accent">{pickedA ? "A" : "B"}</span>}
                <span className="text-sm">{agentLabel(sibling.agent)}</span>
                <span className={META}>{column.state}</span>
                {column.stat != null ? (
                    <span className={`${META} font-mono`}>
                        +{column.stat.additions} −{column.stat.deletions}
                    </span>
                ) : (
                    <span className={META}>{column.statReason}</span>
                )}
            </button>
            {suggestedReason != "" && (
                <span
                    className="self-start rounded border border-white/8 px-1.5 py-0.5 text-xs text-secondary"
                    title={`Suggested by the loaded data (${suggestedReason}) — a non-binding hint. You still choose and click Merge.`}
                >
                    suggested · {suggestedReason}
                </span>
            )}
            <ReadinessBadge readiness={readiness} />
            <MergeabilityBadge mergeability={mergeability} />
            {merged ? (
                <span
                    className="self-start rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent"
                    title={`${agentLabel(sibling.agent)}'s branch ${sibling.branch} is merged — nothing left to merge`}
                >
                    Merged
                </span>
            ) : (
                <button
                    className={`self-start ${QUIET_BTN_XS}`}
                    disabled={busy}
                    onClick={() => model.mergeWorkspace(sibling.workspaceId)}
                    title={`Merge ${agentLabel(sibling.agent)}'s branch ${sibling.branch}`}
                >
                    {busy ? "…" : "Merge this"}
                </button>
            )}
            {column.filesReason != "" ? (
                <span className={META}>{column.filesReason}</span>
            ) : column.files.length == 0 ? (
                <span className={META}>no changed files</span>
            ) : (
                <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                    {column.files.map((path) => (
                        <span key={path} className="truncate font-mono text-xs text-secondary" title={path}>
                            {path}
                        </span>
                    ))}
                </div>
            )}
            {mergeability != null &&
                mergeability.available &&
                mergeability.verdict == "conflicting" &&
                (mergeability.conflicts?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-0.5">
                        <div className="text-xs text-error">merge conflicts ({mergeability.conflicts.length}):</div>
                        {mergeability.conflicts.map((path) => (
                            <span key={path} className="font-mono text-xs text-secondary truncate">
                                {path}
                            </span>
                        ))}
                    </div>
                )}
            {overlap == null ? (
                <span className={META} title={sibling.changedFilesReason || undefined}>
                    overlap unknown — changed-file list unavailable
                </span>
            ) : overlap.count == 0 ? (
                mergeability != null && mergeability.available && mergeability.verdict == "conflicting" ? (
                    <span className={META}>conflicts with already-merged work — see merge conflicts above</span>
                ) : (
                    <span className={META}>no file overlap with other agents</span>
                )
            ) : (
                <span className={META} title={overlapAgents ? `Shared with ${overlapAgents}` : undefined}>
                    overlaps {overlap.count} file{overlap.count == 1 ? "" : "s"} with other agents
                </span>
            )}
            {status && <div className={META}>{status}</div>}
            {lastMerge != null && <MergeVerdictLine record={lastMerge} />}
            {overlap != null && overlap.count > 0 && !merged && (
                <div className="flex flex-col gap-0.5 rounded border border-white/8 px-2 py-1">
                    <div className="text-xs text-secondary">
                        Shares {overlap.count} contested file{overlap.count == 1 ? "" : "s"} — read before merging:
                    </div>
                    {overlap.files.map((path) => (
                        <span
                            key={path}
                            className="font-mono text-xs text-secondary truncate"
                            title={(overlap.agentsByFile[path] ?? []).map(agentLabel).join(" · ")}
                        >
                            {path}
                        </span>
                    ))}
                </div>
            )}
            {merged && (
                <div className="flex items-center gap-2">
                    <button
                        className={SAVE_BTN}
                        onClick={onSaveEvidence}
                        title="Fetch the sealed governance audit trail, then download the convergence evidence (JSON + Markdown). Falls back to client-assembled fields when no durable trail exists."
                    >
                        Save evidence
                    </button>
                    <span className={META}>Sealed audit + JSON + Markdown, saved locally</span>
                </div>
            )}
        </div>
    );
}

SiblingCompareColumn.displayName = "SiblingCompareColumn";

// The unified contested strip: one row per path 2+ agents touched, one cell per
// sibling column. Clicking a sibling's cell picks its version as that file's
// winner — building EXACTLY the converge selection map the ConvergePanel composes
// from (one shared source of truth on the model). A sibling that never touched
// the path renders an inert "—", never a pickable fabricated candidate.
function ContestedStrip({
    compareView,
    selection,
    onPick,
}: {
    compareView: CompareView;
    selection: ConvergeSelection;
    onPick: (path: string, workspaceId: string) => void;
}) {
    const contested = compareView.contested ?? [];
    const siblings = compareView.siblings;
    if (contested.length == 0) {
        return <div className={META}>No overlapping files across siblings — no contested set.</div>;
    }
    return (
        <div className="flex flex-col gap-1 rounded border border-white/8 px-2 py-2">
            <div className={FIELD_LABEL}>
                Contested — {contested.length} file{contested.length == 1 ? "" : "s"} touched by 2+ agents · click a
                cell to pick that agent's version
            </div>
            <div className="overflow-x-auto">
                <div
                    className="grid items-center gap-x-2 gap-y-1"
                    style={{ gridTemplateColumns: `minmax(12rem, 2fr) repeat(${siblings.length}, minmax(6rem, 1fr))` }}
                >
                    <span className={META}>file</span>
                    {siblings.map((s) => (
                        <span key={s.workspaceId} className={`${META} truncate`} title={agentLabel(s.agent)}>
                            {agentLabel(s.agent)}
                        </span>
                    ))}
                    {contested.map((c) => (
                        <Fragment key={c.path}>
                            <span className="truncate font-mono text-sm" title={c.path}>
                                {c.path}
                            </span>
                            {siblings.map((s) => {
                                if (!c.workspaceIds.includes(s.workspaceId)) {
                                    return (
                                        <span key={s.workspaceId} className={META}>
                                            —
                                        </span>
                                    );
                                }
                                const picked = selection[c.path] == s.workspaceId;
                                return (
                                    <button
                                        key={s.workspaceId}
                                        className={`justify-self-start ${picked ? PICK_BTN_ON : QUIET_BTN_XS}`}
                                        onClick={() => onPick(c.path, s.workspaceId)}
                                        title={`Take ${agentLabel(s.agent)}'s version of ${c.path}`}
                                    >
                                        {picked ? "✓ winner" : "pick"}
                                    </button>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

ContestedStrip.displayName = "ContestedStrip";

function PairwiseStatLine({ label, stat, reason }: { label: string; stat: RecoderDiffSummary; reason: string }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-secondary">{label}</span>
            {stat != null ? (
                <span className="text-secondary font-mono">
                    +{stat.additions} −{stat.deletions} · {stat.files} file{stat.files == 1 ? "" : "s"}
                </span>
            ) : (
                <span className="text-secondary">{reason || "diff unavailable"}</span>
            )}
        </div>
    );
}

PairwiseStatLine.displayName = "PairwiseStatLine";

// Change type encoded like the Review diff: a luminance step + a left-border
// bar, crimson only as the thin del marker — never green, never colored text.
const PairwiseRowStyle: Record<PairwiseLineKind, string> = {
    add: "bg-white/[0.05] text-primary/90 border-l-2 border-white/25",
    del: "bg-black/25 text-primary/50 border-l-2 border-error/50",
    hunk: "text-accent",
    meta: "text-secondary",
    ctx: "text-primary/70",
};

function PairwiseFileBlock({ file }: { file: PairwiseFileRow }) {
    return (
        <div className="flex flex-col rounded border border-white/8">
            <div className="flex flex-wrap items-center gap-x-2 px-2 py-1">
                <span className="truncate font-mono text-xs">{file.path}</span>
                {file.binary && <span className={META}>binary file differs</span>}
                {!file.available && <span className={META}>{file.unavailableReason || "diff unavailable"}</span>}
                {file.available && !file.binary && file.lines.length == 0 && (
                    <span className={META}>identical in A and B</span>
                )}
            </div>
            {file.lines.length > 0 && (
                <div className="overflow-x-auto font-mono text-xs leading-relaxed">
                    {file.lines.map((line, i) => (
                        <div key={i} className={`whitespace-pre px-2 ${PairwiseRowStyle[pairwiseLineKind(line)]}`}>
                            {line == "" ? " " : line}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

PairwiseFileBlock.displayName = "PairwiseFileBlock";

function PairwiseDiffSection({ view, aAgent, bAgent }: { view: PairwiseView; aAgent: string; bAgent: string }) {
    if (view.files.length == 0) {
        return (
            <div className={META}>
                No shared changed files between {aAgent} and {bAgent} to diff line-by-line.
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1">
            <div className={META}>
                Line-level diff — A ({aAgent}) as −, B ({bAgent}) as + · {view.files.length} file
                {view.files.length == 1 ? "" : "s"}
                {view.capped ? " · list capped by the backend" : ""}
            </div>
            {view.files.map((file) => (
                <PairwiseFileBlock key={file.path} file={file} />
            ))}
        </div>
    );
}

PairwiseDiffSection.displayName = "PairwiseDiffSection";

// The focused A-vs-B view: the honest diffStat delta (A minus B) plus the TRUE
// line-level per-file diff fetched from the conductor's pairwise edge
// (…/compare/:taskGroup/pairwise). When the fetch degrades (older backend,
// unreachable, foreign pair) the panel keeps the truthful client-side
// shared-file fallback and says WHY the line-level view is missing.
function PairwisePanel({ pair, taskGroup }: { pair: PairwiseCompareView; taskGroup: string }) {
    const a = pair.a;
    const b = pair.b;
    const delta = pair.delta;
    const [remote, setRemote] = useState<PairwiseFetchResult>(null);
    useEffect(() => {
        let cancelled = false;
        setRemote(null);
        fetchPairwiseDiff(taskGroup, a.workspaceId, b.workspaceId).then((result) => {
            if (cancelled) {
                return;
            }
            setRemote(result);
        });
        return () => {
            cancelled = true;
        };
    }, [taskGroup, a.workspaceId, b.workspaceId]);
    return (
        <div className="flex flex-col gap-1.5 rounded border border-accent/30 px-2 py-2">
            <div className={FIELD_LABEL}>
                A vs B — {agentLabel(a.agent)} vs {agentLabel(b.agent)}
            </div>
            <PairwiseStatLine label={`A · ${agentLabel(a.agent)}`} stat={a.diffStat} reason={a.diffStatReason} />
            <PairwiseStatLine label={`B · ${agentLabel(b.agent)}`} stat={b.diffStat} reason={b.diffStatReason} />
            {delta != null ? (
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-secondary">Δ A−B</span>
                    <span className="text-primary font-mono">
                        {fmtSigned(delta.additions)} add · {fmtSigned(delta.deletions)} del · {fmtSigned(delta.files)}{" "}
                        file{delta.files == 1 || delta.files == -1 ? "" : "s"}
                    </span>
                </div>
            ) : (
                <div className={META}>Δ unavailable — a diffStat is missing on one side.</div>
            )}
            {remote == null ? (
                <div className={META}>Loading line-level A/B diff…</div>
            ) : remote.ok ? (
                <PairwiseDiffSection view={remote.view} aAgent={agentLabel(a.agent)} bAgent={agentLabel(b.agent)} />
            ) : (
                <>
                    {pair.shared.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                            <div className={META}>
                                Both touched — {pair.shared.length} file{pair.shared.length == 1 ? "" : "s"}
                                {pair.sharedReason ? ` (${pair.sharedReason})` : ""}
                            </div>
                            {pair.shared.map((path) => (
                                <span key={path} className="text-sm truncate font-mono">
                                    {path}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className={META}>
                            No files touched by both {agentLabel(a.agent)} and {agentLabel(b.agent)}
                            {pair.sharedReason ? ` (${pair.sharedReason})` : ""}.
                        </div>
                    )}
                    <div className={META}>Line-level A/B diff unavailable — {remote.error} Showing the client-side delta.</div>
                </>
            )}
        </div>
    );
}

PairwisePanel.displayName = "PairwisePanel";

function RecoderComparePanel({
    model,
    compareView,
    onReview,
}: {
    model: RecoderViewModel;
    compareView: CompareView;
    onReview: (workspaceId: string) => void;
}) {
    const readinessMap = useAtomValue(model.readinessAtom);
    const rowStatus = useAtomValue(model.rowStatusAtom);
    const busyRow = useAtomValue(model.busyRowAtom);
    const lastMergeMap = useAtomValue(model.lastMergeAtom);
    const pairA = useAtomValue(model.pairAAtom);
    const pairB = useAtomValue(model.pairBAtom);
    const [selection, setSelection] = useAtom(model.convergeSelectionAtom);
    const taskGroup = compareView.taskGroup ?? "";
    // A fresh open / a group switch always starts the winner selection clean so
    // one group's picks can never leak into another group's converge compose.
    useEffect(() => {
        setSelection({});
    }, [taskGroup]);
    const aEntry = compareView.siblings.find((s) => s.workspaceId == pairA);
    const bEntry = compareView.siblings.find((s) => s.workspaceId == pairB);
    const pair = aEntry != null && bEntry != null ? computePairwise(aEntry, bEntry, compareView.contested ?? []) : null;
    const suggested = computeSuggestedWinner(compareView.siblings, readinessMap);
    if (compareView.siblings.length == 0) {
        return (
            <div className="rounded border border-white/8 p-2">
                <RecoderEmpty
                    title="No parallel agents to compare yet."
                    hint="Launch a task across multiple agents to see them side by side."
                />
            </div>
        );
    }
    const columns = deriveCompareColumns(compareView.siblings);
    const onPickWinner = (path: string, workspaceId: string) => {
        setSelection((cur) => toggleSelection(cur, path, workspaceId));
    };
    return (
        <div className="flex flex-col gap-1.5 rounded border border-white/8 p-2">
            <ContestedStrip compareView={compareView} selection={selection} onPick={onPickWinner} />
            {compareView.siblings.length >= 2 && (
                <ConvergePanel
                    taskGroup={taskGroup}
                    contested={compareView.contested ?? []}
                    siblings={compareView.siblings}
                    selection={selection}
                    onSelectionChange={setSelection}
                    onReview={onReview}
                />
            )}
            {pair != null && <PairwisePanel pair={pair} taskGroup={taskGroup} />}
            <div className="overflow-x-auto">
                <div className="flex gap-1">
                    {compareView.siblings.map((sibling, i) => {
                        const merge = readinessMap[sibling.workspaceId];
                        return (
                            <SiblingCompareColumn
                                key={sibling.workspaceId}
                                model={model}
                                sibling={sibling}
                                siblings={compareView.siblings}
                                column={columns[i]}
                                contested={compareView.contested ?? []}
                                taskGroup={taskGroup}
                                readiness={merge?.readiness}
                                mergeability={merge?.mergeability}
                                status={rowStatus[sibling.workspaceId]}
                                lastMerge={lastMergeMap[sibling.workspaceId]}
                                busy={busyRow == sibling.workspaceId}
                                pickedA={pairA == sibling.workspaceId}
                                pickedB={pairB == sibling.workspaceId}
                                suggestedReason={suggested?.workspaceId == sibling.workspaceId ? suggested.reason : ""}
                                onPickHeader={() =>
                                    model.pickPair(headerPairSlot(pairA, pairB, sibling.workspaceId), sibling.workspaceId)
                                }
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

RecoderComparePanel.displayName = "RecoderComparePanel";

export { RecoderComparePanel };
