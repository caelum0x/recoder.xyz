// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useEffect, useMemo, useState } from "react";
import { agentLabel } from "./recoder-agent-labels";
import {
    ASSISTED_VALUE,
    assistedOption,
    autoResolvableCount,
    autoResolveSynthesizable,
    composeConvergence,
    fetchConvergePlan,
    presentConflictRegions,
    SYNTHESIZE_VALUE,
    toggleSelection,
    type ConvergeConflictRegion,
    type ConvergePlan,
    type ConvergeSelection,
} from "./recoder-converge-logic";
import type { ContestedFile, SiblingCompareEntry } from "./recoder-model";
import { RecoderEmpty, RecoderErrorRow } from "./recoder-states";
import { FIELD_LABEL, META, PICK_BTN_ON, PRIMARY_BTN, QUIET_BTN, QUIET_BTN_XS } from "./recoder-styles";

const PLAN_DEBOUNCE_MS = 250;

// Per-path synthesizability from the one-shot probe: `null` for a path the probe
// never covered (unprobed/old backend) so the row degrades to pick-only. An
// 'overlap' may carry the parsed conflict regions (WHERE the agents collided).
type SynthInfo = {
    synthesizable: boolean;
    reason: string;
    regions?: ConvergeConflictRegion[];
    symbols?: { workspaceId: string; names: string[] }[];
    sharedSymbols?: string[];
};

type ConvergePanelProps = {
    taskGroup: string;
    contested: ContestedFile[];
    siblings: SiblingCompareEntry[];
    // The model-held selection (see RecoderViewModel.convergeSelectionAtom) shared
    // with the compare panel's contested strip: this panel reflects and edits the
    // SAME map — it never owns a private copy that could drift from the strip.
    selection: ConvergeSelection;
    onSelectionChange: (next: ConvergeSelection) => void;
    onReview: (workspaceId: string) => void;
    // Open the N-up file-versions read for one contested path. The decision row IS
    // the only winner-picker, so the "see the actual content" affordance hangs off
    // the row's own path label — there is no second contested list to click.
    onOpenFile: (path: string) => void;
    openFilePath: string;
};

// One side of a conflict region: the agent's colliding lines, font-mono. An empty
// line renders as a non-breaking space so the region keeps its true line count.
function ConflictSide({ label, lines, tone }: { label: string; lines: string[]; tone: string }) {
    return (
        <div className={cn("flex flex-col border-l-2 pl-2", tone)}>
            <span className={META}>{label}</span>
            {lines.map((line, i) => (
                <span key={i} className="truncate font-mono text-xs text-secondary" title={line}>
                    {line == "" ? " " : line}
                </span>
            ))}
        </div>
    );
}

ConflictSide.displayName = "ConflictSide";

// One contested path with its winner picker: a button per sibling that touched the
// path (from the group's contested set), the picked one lit like the A/B picker.
// When a probe covered the path, it also offers "Synthesize" (auto 3-way merge)
// with a truthful ✓/✗ indicator; a non-synthesizable path dims that option and
// keeps the reason visible so the user picks a winner instead. Wherever a synthesize
// was at least attempted it ALSO offers "AI-assisted" (synthesize-first, model on
// conflict) — enabled even for a non-synthesizable overlap (that is exactly what it
// escalates), and merely optional for a trivially-mergeable path (the title says so).
// An 'overlap' also gets a collapsed "Where?" toggle showing the exact colliding line
// regions (or a truthful "location unavailable" when the backend sent none).
function ContestedPickRow({
    path,
    candidates,
    picked,
    agentByWs,
    disabled,
    synth,
    onPick,
    onOpenFile,
    fileOpen,
}: {
    path: string;
    candidates: string[];
    picked: string;
    agentByWs: Map<string, string>;
    disabled: boolean;
    synth: SynthInfo;
    onPick: (value: string) => void;
    onOpenFile: (path: string) => void;
    fileOpen: boolean;
}) {
    const [showRegions, setShowRegions] = useState(false);
    const canSynth = synth != null && synth.synthesizable;
    const assisted = assistedOption(synth);
    const regionView = synth != null ? presentConflictRegions(synth) : null;
    const hasCollision = regionView != null && (regionView.rows.length > 0 || regionView.fallback != "");
    // The fold merges sorted siblings pairwise: with exactly 2, ours/theirs map 1:1
    // to the agents; with more, the running fold makes per-agent labels untruthful.
    const oursLabel = candidates.length == 2 ? agentLabel(agentByWs.get(candidates[0]) ?? candidates[0]) : "one side";
    const theirsLabel =
        candidates.length == 2 ? agentLabel(agentByWs.get(candidates[1]) ?? candidates[1]) : "other side";
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                    className={cn(
                        "min-w-[10rem] flex-1 truncate text-left font-mono text-sm cursor-pointer recoder-transition",
                        fileOpen ? "text-accent" : "text-primary hover:text-accent"
                    )}
                    onClick={() => onOpenFile(path)}
                    title={`Read every agent's version of ${path} side by side`}
                >
                    {path}
                </button>
                <div className="flex items-center gap-1">
                    {candidates.map((id) => {
                        const label = agentLabel(agentByWs.get(id) ?? id);
                        return (
                            <button
                                key={id}
                                className={picked == id ? PICK_BTN_ON : QUIET_BTN_XS}
                                disabled={disabled}
                                onClick={() => onPick(id)}
                                title={`Take ${label}'s version of ${path}`}
                            >
                                {label}
                            </button>
                        );
                    })}
                    {synth != null && (
                        <button
                            className={picked == SYNTHESIZE_VALUE ? PICK_BTN_ON : QUIET_BTN_XS}
                            disabled={disabled || !canSynth}
                            onClick={() => onPick(SYNTHESIZE_VALUE)}
                            title={
                                canSynth
                                    ? `Auto 3-way merge both agents' edits to ${path}`
                                    : `Can't auto-merge ${path}${synth.reason ? ` — ${synth.reason}` : ""}; pick a winner instead`
                            }
                        >
                            Synthesize
                        </button>
                    )}
                    {assisted.offer && (
                        <button
                            className={picked == ASSISTED_VALUE ? PICK_BTN_ON : QUIET_BTN_XS}
                            disabled={disabled}
                            onClick={() => onPick(ASSISTED_VALUE)}
                            title={
                                "AI-assisted merge — a model resolves the conflict; you review the result before merge." +
                                (assisted.note ? ` (${assisted.note}, so Synthesize suffices here)` : "")
                            }
                        >
                            AI-assisted
                        </button>
                    )}
                </div>
                {synth != null && (
                    <span
                        className={cn("text-xs", canSynth ? "text-accent" : "text-error")}
                        title={synth.reason || undefined}
                    >
                        {canSynth ? "✓ auto-mergeable" : `✗ ${synth.reason || "not auto-mergeable"}`}
                    </span>
                )}
                {hasCollision && (
                    <button
                        className={QUIET_BTN_XS}
                        onClick={() => setShowRegions((v) => !v)}
                        title={`Show where the agents collided in ${path}`}
                    >
                        {showRegions ? "Hide collision" : "Where?"}
                    </button>
                )}
                {picked == "" && (
                    <span className={META}>
                        {assisted.offer
                            ? canSynth
                                ? "pick a winner, synthesize, or AI-assist"
                                : "pick a winner or AI-assist"
                            : "pick a winner"}
                    </span>
                )}
            </div>
            {showRegions && regionView != null && (
                <div className="flex flex-col gap-1.5 rounded border border-white/8 px-2 py-1.5">
                    {regionView.rows.length == 0 ? (
                        <span className={META}>{regionView.fallback}</span>
                    ) : (
                        regionView.rows.map((row) => (
                            <div key={row.label} className="flex flex-col gap-0.5">
                                <span className="text-xs text-secondary">
                                    {row.label}
                                    {row.truncated ? " — truncated" : ""}
                                </span>
                                <ConflictSide label={oursLabel} lines={row.ours} tone="border-accent/40" />
                                <ConflictSide label={theirsLabel} lines={row.theirs} tone="border-error/40" />
                            </div>
                        ))
                    )}
                </div>
            )}
            {synth?.sharedSymbols != null && synth.sharedSymbols.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                    <span className={META}>same symbols:</span>
                    {synth.sharedSymbols.map((symbol) => (
                        <span
                            key={symbol}
                            className="rounded border border-error/30 px-1.5 py-0.5 font-mono text-xs text-secondary"
                            title={`${candidates.length} agents changed ${symbol} in ${path}`}
                        >
                            {symbol}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

ContestedPickRow.displayName = "ContestedPickRow";

// The live plan readout: truthful winner/unresolved counts and an EXPLICIT list of
// any unresolved paths (with the backend's reason) — never hidden so Compose can
// only ever light up on a genuinely complete plan.
function ConvergePlanSummary({ plan, agentByWs }: { plan: ConvergePlan; agentByWs: Map<string, string> }) {
    const unresolvedCount = plan.unresolved.length;
    const sources = plan.sources.filter((s) => s.count > 0);
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className={plan.complete ? "text-accent" : "text-secondary"}>
                    {plan.winners} winner file{plan.winners == 1 ? "" : "s"}
                </span>
                <span className={unresolvedCount > 0 ? "text-error" : "text-secondary"}>
                    {unresolvedCount} unresolved
                </span>
                {plan.siblingCount > 0 && (
                    <span className={META}>
                        from {plan.siblingCount} sibling{plan.siblingCount == 1 ? "" : "s"}
                    </span>
                )}
            </div>
            {sources.length > 0 && (
                <div className={META}>
                    winners by agent:{" "}
                    {sources
                        .map((s) => `${agentLabel(agentByWs.get(s.workspaceId) ?? s.workspaceId)} ${s.count}`)
                        .join(" · ")}
                </div>
            )}
            {unresolvedCount > 0 && (
                <div className="flex flex-col gap-0.5 rounded border border-white/8 px-2 py-1">
                    <div className="text-xs text-secondary">Unresolved — pick a winner for each before composing:</div>
                    {plan.unresolved.map((u) => (
                        <span
                            key={u.path}
                            className="truncate font-mono text-xs text-secondary"
                            title={u.reason || undefined}
                        >
                            {u.path}
                            {u.reason ? ` — ${u.reason}` : ""}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

ConvergePlanSummary.displayName = "ConvergePlanSummary";

// The converge affordance inside an open compare panel: pick a winning sibling per
// contested path, live-preview the plan, and compose the winners into a new
// reviewable workspace. Plan/compose state is local to this widget — it is
// ephemeral and never survives a panel collapse, so it stays out of the model.
function ConvergePanel({
    taskGroup,
    contested,
    siblings,
    selection,
    onSelectionChange,
    onReview,
    onOpenFile,
    openFilePath,
}: ConvergePanelProps) {
    const [plan, setPlan] = useState<ConvergePlan>(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [planError, setPlanError] = useState("");
    const [composing, setComposing] = useState(false);
    const [composeError, setComposeError] = useState("");
    const [composedId, setComposedId] = useState("");
    const [composedAssisted, setComposedAssisted] = useState<string[]>([]);
    const [synthMap, setSynthMap] = useState<Record<string, SynthInfo>>({});

    const agentByWs = useMemo(() => new Map(siblings.map((s) => [s.workspaceId, s.agent])), [siblings]);
    const selectionKey = JSON.stringify(selection);
    const hasContested = contested.length > 0;
    const contestedKey = contested.map((c) => c.path).join("\n");

    // One-shot synthesizability probe (O(contested paths), real-git) — fired once
    // when the panel opens / the contested set first changes, NOT on the debounced
    // selection poll. Degrade-safe: a failed/unprobed/old backend leaves synthMap
    // empty so every row falls back to pick-only, never faking synthesizability.
    useEffect(() => {
        if (taskGroup == "" || !hasContested) {
            return;
        }
        let cancelled = false;
        (async () => {
            const result = await fetchConvergePlan(taskGroup, {}, true);
            if (cancelled || !result.ok || result.plan.contested == null) {
                return;
            }
            const map: Record<string, SynthInfo> = {};
            for (const c of result.plan.contested) {
                map[c.path] = {
                    synthesizable: c.synthesizable,
                    reason: c.reason ?? "",
                    ...(c.regions != null ? { regions: c.regions } : {}),
                    ...(c.symbols != null ? { symbols: c.symbols } : {}),
                    ...(c.sharedSymbols != null ? { sharedSymbols: c.sharedSymbols } : {}),
                };
            }
            setSynthMap(map);
        })();
        return () => {
            cancelled = true;
        };
    }, [taskGroup, contestedKey]);

    useEffect(() => {
        if (taskGroup == "" || !hasContested) {
            return;
        }
        let cancelled = false;
        setPlanLoading(true);
        const timer = setTimeout(async () => {
            const result = await fetchConvergePlan(taskGroup, selection);
            if (cancelled) {
                return;
            }
            setPlanLoading(false);
            if (result.ok) {
                setPlanError("");
                setPlan(result.plan);
                return;
            }
            setPlanError(result.error);
            setPlan(null);
        }, PLAN_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // selectionKey stands in for the selection object's value identity.
    }, [taskGroup, selectionKey, hasContested]);

    // A selection edit from EITHER path (panel rows or the compare strip)
    // invalidates a prior compose outcome — keeping the success/error line
    // for a selection it no longer matches would lie about state.
    useEffect(() => {
        setComposedId("");
        setComposedAssisted([]);
        setComposeError("");
    }, [selectionKey]);

    if (!hasContested) {
        return (
            <div className="rounded border border-white/8 px-2 py-2">
                <div className={FIELD_LABEL}>Converge</div>
                <RecoderEmpty
                    title="Nothing to converge."
                    hint="No file is touched by 2+ agents — review and merge a sibling directly."
                />
            </div>
        );
    }

    const onPick = (path: string, value: string) => {
        setComposeError("");
        setComposedId("");
        setComposedAssisted([]);
        onSelectionChange(toggleSelection(selection, path, value));
    };

    const onAutoResolve = () => {
        setComposeError("");
        setComposedId("");
        setComposedAssisted([]);
        onSelectionChange(autoResolveSynthesizable(selection, synthMap));
    };

    const onCompose = async () => {
        setComposing(true);
        setComposeError("");
        const result = await composeConvergence(taskGroup, selection);
        setComposing(false);
        if (result.ok) {
            setComposedId(result.workspaceId);
            setComposedAssisted(result.assisted ?? []);
            onReview(result.workspaceId);
            return;
        }
        setComposeError(result.error);
    };

    const composeReady = plan != null && plan.complete && !composing;
    const anySynth = Object.values(synthMap).some((s) => s.synthesizable);
    // Assisted is offered wherever the probe covered a path (a synthesize was at least
    // attempted) — a superset of the cleanly-synthesizable set.
    const anyAssisted = Object.keys(synthMap).length > 0;
    const affordance = anyAssisted
        ? anySynth
            ? "pick a winner, Synthesize, or AI-assist"
            : "pick a winner or AI-assist"
        : anySynth
          ? "pick a winner or Synthesize"
          : "pick a winner";
    const autoResolvable = autoResolvableCount(selection, synthMap);

    return (
        <div className="flex flex-col gap-1.5 rounded border border-accent/30 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
                <div className={FIELD_LABEL}>
                    Converge — {affordance} per contested file · click a path to read every version · then compose one
                    reviewable workspace
                </div>
                {autoResolvable > 0 ? (
                    <button
                        className={QUIET_BTN_XS}
                        disabled={composing}
                        onClick={onAutoResolve}
                        title={`Set the ${autoResolvable} cleanly auto-mergeable file(s) to Synthesize; conflicting files still need a pick`}
                    >
                        Auto-resolve {autoResolvable}
                    </button>
                ) : null}
            </div>
            <div className="flex flex-col gap-1">
                {contested.map((c) => (
                    <ContestedPickRow
                        key={c.path}
                        path={c.path}
                        candidates={c.workspaceIds}
                        picked={selection[c.path] ?? ""}
                        agentByWs={agentByWs}
                        disabled={composing}
                        synth={synthMap[c.path] ?? null}
                        onPick={(value) => onPick(c.path, value)}
                        onOpenFile={onOpenFile}
                        fileOpen={openFilePath == c.path}
                    />
                ))}
            </div>
            {planError != "" ? (
                <RecoderErrorRow message={planError} />
            ) : plan != null ? (
                <ConvergePlanSummary plan={plan} agentByWs={agentByWs} />
            ) : (
                <div className={META}>{planLoading ? "Checking plan…" : "Pick winners to preview the plan."}</div>
            )}
            {composeError != "" && <RecoderErrorRow message={composeError} />}
            {composedId != "" ? (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-accent">Convergence workspace created — opening review.</span>
                        <button
                            className={QUIET_BTN}
                            onClick={() => onReview(composedId)}
                            title="Open the convergence workspace diff"
                        >
                            Open review
                        </button>
                    </div>
                    {composedAssisted.length > 0 && (
                        <div className="flex flex-col gap-0.5 rounded border border-white/8 px-2 py-1">
                            <div className="flex items-center gap-1.5">
                                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                                    AI-assisted
                                </span>
                                <span className={META}>
                                    a model wrote {composedAssisted.length} file
                                    {composedAssisted.length == 1 ? "" : "s"} — review closely before merge:
                                </span>
                            </div>
                            {composedAssisted.map((p) => (
                                <span key={p} className="truncate font-mono text-xs text-secondary" title={p}>
                                    {p}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <button
                        className={PRIMARY_BTN}
                        disabled={!composeReady}
                        onClick={onCompose}
                        title={
                            composeReady
                                ? "Compose the picked winners into a new reviewable workspace"
                                : "Resolve every contested file to enable Compose"
                        }
                    >
                        {composing ? "Composing…" : "Compose"}
                    </button>
                    {plan != null && !plan.complete && !planLoading && (
                        <span className={META}>Resolve the unresolved files above to compose.</span>
                    )}
                </div>
            )}
        </div>
    );
}

ConvergePanel.displayName = "ConvergePanel";

export { ConvergePanel };
