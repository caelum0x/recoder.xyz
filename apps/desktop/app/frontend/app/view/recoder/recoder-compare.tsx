// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { agentLabel } from "./recoder-agent-labels";
import { buildConvergenceEvidence, saveConvergenceEvidence } from "./recoder-evidence";
import {
    computePairwise,
    computeSuggestedWinner,
    RecoderViewModel,
    type CompareView,
    type MergeabilityView,
    type PairwiseCompareView,
    type RecoderDiffSummary,
    type ReadinessSignal,
    type ReadinessView,
    type RecoderMergeRecord,
    type SiblingCompareEntry,
} from "./recoder-model";
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
    not_ready: "border border-border text-secondary",
    terminal: "border border-border text-secondary",
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
        </div>
    );
}

ReadinessBadge.displayName = "ReadinessBadge";

function MergeabilityBadge({ mergeability }: { mergeability: MergeabilityView }) {
    if (mergeability == null) {
        return <span className={META}>mergeability unavailable</span>;
    }
    if (!mergeability.available) {
        return (
            <span className={META} title={mergeability.reason || "not available"}>
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

type SiblingCompareRowProps = {
    model: RecoderViewModel;
    sibling: SiblingCompareEntry;
    siblings: SiblingCompareEntry[];
    taskGroup: string;
    readiness: ReadinessView;
    mergeability: MergeabilityView;
    status: string;
    lastMerge: RecoderMergeRecord;
    busy: boolean;
    pickedA: boolean;
    pickedB: boolean;
    suggestedReason: string;
};

function SiblingCompareRow({
    model,
    sibling,
    siblings,
    taskGroup,
    readiness,
    mergeability,
    status,
    lastMerge,
    busy,
    pickedA,
    pickedB,
    suggestedReason,
}: SiblingCompareRowProps) {
    const stat = sibling.diffStat;
    const merged = lastMerge != null && lastMerge.status == "merged";
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
            merge: lastMerge,
            taskGroup: taskGroup ?? "",
            audit,
        });
        saveConvergenceEvidence(evidence);
    };
    return (
        <div className="flex flex-col gap-1 rounded border border-border px-2 py-1.5 transition-colors duration-150 ease-out hover:bg-border/20">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-1">
                    <button
                        className={pickedA ? PICK_BTN_ON : QUIET_BTN_XS}
                        onClick={() => model.pickPair("A", sibling.workspaceId)}
                        title={`Pick ${agentLabel(sibling.agent)} as A for the pairwise compare`}
                    >
                        A
                    </button>
                    <button
                        className={pickedB ? PICK_BTN_ON : QUIET_BTN_XS}
                        onClick={() => model.pickPair("B", sibling.workspaceId)}
                        title={`Pick ${agentLabel(sibling.agent)} as B for the pairwise compare`}
                    >
                        B
                    </button>
                </div>
                <span className="text-sm">{agentLabel(sibling.agent)}</span>
                {suggestedReason != "" && (
                    <span
                        className="rounded border border-border px-1.5 py-0.5 text-xs text-secondary"
                        title={`Suggested by the loaded data (${suggestedReason}) — a non-binding hint. You still choose and click Merge.`}
                    >
                        suggested · {suggestedReason}
                    </span>
                )}
                <span className={META}>{sibling.state}</span>
                {stat != null ? (
                    <span className={META}>
                        +{stat.additions} −{stat.deletions} · {stat.files} file{stat.files == 1 ? "" : "s"}
                    </span>
                ) : (
                    <span className={META}>{sibling.diffStatReason || "diff unavailable"}</span>
                )}
                <div className="flex-1" />
                <button
                    className={QUIET_BTN_XS}
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
            {status && <div className={META}>{status}</div>}
            {lastMerge != null && <MergeVerdictLine record={lastMerge} />}
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

SiblingCompareRow.displayName = "SiblingCompareRow";

function ContestedSet({ compareView }: { compareView: CompareView }) {
    const contested = compareView.contested ?? [];
    const agentByWs = new Map(compareView.siblings.map((s) => [s.workspaceId, s.agent]));
    if (contested.length == 0) {
        return <div className={META}>No overlapping files across siblings — no contested set.</div>;
    }
    return (
        <div className="flex flex-col gap-1 rounded border border-border px-2 py-1.5">
            <div className={FIELD_LABEL}>
                Contested — {contested.length} file{contested.length == 1 ? "" : "s"} touched by 2+ agents
            </div>
            {contested.map((c) => (
                <div key={c.path} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="truncate">{c.path}</span>
                    <span className={META}>
                        {c.workspaceIds.map((id) => agentLabel(agentByWs.get(id) ?? id)).join(" · ")}
                    </span>
                </div>
            ))}
        </div>
    );
}

ContestedSet.displayName = "ContestedSet";

function PairwiseStatLine({ label, stat, reason }: { label: string; stat: RecoderDiffSummary; reason: string }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-secondary">{label}</span>
            {stat != null ? (
                <span className="text-secondary">
                    +{stat.additions} −{stat.deletions} · {stat.files} file{stat.files == 1 ? "" : "s"}
                </span>
            ) : (
                <span className="text-secondary">{reason || "diff unavailable"}</span>
            )}
        </div>
    );
}

PairwiseStatLine.displayName = "PairwiseStatLine";

// The focused A-vs-B view: the honest diffStat delta (A minus B) and the files
// BOTH picked agents touched. There is no true line-level pairwise diff — that
// needs a backend edge the conductor does not expose yet — so this stays a
// truthful client-side delta + shared-file view, and says so.
function PairwisePanel({ pair }: { pair: PairwiseCompareView }) {
    const a = pair.a;
    const b = pair.b;
    const delta = pair.delta;
    return (
        <div className="flex flex-col gap-1.5 rounded border border-accent/30 px-2 py-1.5">
            <div className={FIELD_LABEL}>
                A vs B — {agentLabel(a.agent)} vs {agentLabel(b.agent)}
            </div>
            <PairwiseStatLine label={`A · ${agentLabel(a.agent)}`} stat={a.diffStat} reason={a.diffStatReason} />
            <PairwiseStatLine label={`B · ${agentLabel(b.agent)}`} stat={b.diffStat} reason={b.diffStatReason} />
            {delta != null ? (
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-secondary">Δ A−B</span>
                    <span className="text-primary">
                        {fmtSigned(delta.additions)} add · {fmtSigned(delta.deletions)} del · {fmtSigned(delta.files)}{" "}
                        file{delta.files == 1 || delta.files == -1 ? "" : "s"}
                    </span>
                </div>
            ) : (
                <div className={META}>Δ unavailable — a diffStat is missing on one side.</div>
            )}
            {pair.shared.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                    <div className={META}>
                        Both touched — {pair.shared.length} file{pair.shared.length == 1 ? "" : "s"}
                        {pair.sharedReason ? ` (${pair.sharedReason})` : ""}
                    </div>
                    {pair.shared.map((path) => (
                        <span key={path} className="text-sm truncate">
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
            <div className={META}>
                Client-side delta + shared-file view — a true line-level pairwise diff needs a backend edge (backlog).
            </div>
        </div>
    );
}

PairwisePanel.displayName = "PairwisePanel";

function RecoderComparePanel({ model, compareView }: { model: RecoderViewModel; compareView: CompareView }) {
    const readinessMap = useAtomValue(model.readinessAtom);
    const rowStatus = useAtomValue(model.rowStatusAtom);
    const busyRow = useAtomValue(model.busyRowAtom);
    const lastMergeMap = useAtomValue(model.lastMergeAtom);
    const pairA = useAtomValue(model.pairAAtom);
    const pairB = useAtomValue(model.pairBAtom);
    const aEntry = compareView.siblings.find((s) => s.workspaceId == pairA);
    const bEntry = compareView.siblings.find((s) => s.workspaceId == pairB);
    const pair = aEntry != null && bEntry != null ? computePairwise(aEntry, bEntry, compareView.contested ?? []) : null;
    const suggested = computeSuggestedWinner(compareView.siblings, readinessMap);
    if (compareView.siblings.length == 0) {
        return (
            <div className="rounded border border-border p-2">
                <div className={META}>No sibling agents to compare yet.</div>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1.5 rounded border border-border p-2">
            <ContestedSet compareView={compareView} />
            {pair != null && <PairwisePanel pair={pair} />}
            <div className="flex flex-col gap-1">
                {compareView.siblings.map((sibling) => {
                    const merge = readinessMap[sibling.workspaceId];
                    return (
                        <SiblingCompareRow
                            key={sibling.workspaceId}
                            model={model}
                            sibling={sibling}
                            siblings={compareView.siblings}
                            taskGroup={compareView.taskGroup ?? ""}
                            readiness={merge?.readiness}
                            mergeability={merge?.mergeability}
                            status={rowStatus[sibling.workspaceId]}
                            lastMerge={lastMergeMap[sibling.workspaceId]}
                            busy={busyRow == sibling.workspaceId}
                            pickedA={pairA == sibling.workspaceId}
                            pickedB={pairB == sibling.workspaceId}
                            suggestedReason={suggested?.workspaceId == sibling.workspaceId ? suggested.reason : ""}
                        />
                    );
                })}
            </div>
        </div>
    );
}

RecoderComparePanel.displayName = "RecoderComparePanel";

export { RecoderComparePanel };
