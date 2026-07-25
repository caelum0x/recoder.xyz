// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useEffect, useMemo, useState } from "react";
import { agentLabel } from "./recoder-agent-labels";
import {
    composeConvergence,
    fetchConvergePlan,
    SYNTHESIZE_VALUE,
    toggleSelection,
    type ConvergePlan,
    type ConvergeSelection,
} from "./recoder-converge-logic";
import type { ContestedFile, SiblingCompareEntry } from "./recoder-model";
import { RecoderEmpty, RecoderErrorRow } from "./recoder-states";
import { FIELD_LABEL, META, PICK_BTN_ON, PRIMARY_BTN, QUIET_BTN, QUIET_BTN_XS } from "./recoder-styles";

const PLAN_DEBOUNCE_MS = 250;

// Per-path synthesizability from the one-shot probe: `null` for a path the probe
// never covered (unprobed/old backend) so the row degrades to pick-only.
type SynthInfo = { synthesizable: boolean; reason: string };

type ConvergePanelProps = {
    taskGroup: string;
    contested: ContestedFile[];
    siblings: SiblingCompareEntry[];
    onReview: (workspaceId: string) => void;
};

// One contested path with its winner picker: a button per sibling that touched the
// path (from the group's contested set), the picked one lit like the A/B picker.
// When a probe covered the path, it also offers "Synthesize" (auto 3-way merge)
// with a truthful ✓/✗ indicator; a non-synthesizable path dims that option and
// keeps the reason visible so the user picks a winner instead.
function ContestedPickRow({
    path,
    candidates,
    picked,
    agentByWs,
    disabled,
    synth,
    onPick,
}: {
    path: string;
    candidates: string[];
    picked: string;
    agentByWs: Map<string, string>;
    disabled: boolean;
    synth: SynthInfo;
    onPick: (value: string) => void;
}) {
    const canSynth = synth != null && synth.synthesizable;
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-[10rem] flex-1 truncate font-mono text-sm" title={path}>
                {path}
            </span>
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
            </div>
            {synth != null && (
                <span
                    className={cn("text-xs", canSynth ? "text-accent" : "text-error")}
                    title={synth.reason || undefined}
                >
                    {canSynth ? "✓ auto-mergeable" : `✗ ${synth.reason || "not auto-mergeable"}`}
                </span>
            )}
            {picked == "" && (
                <span className={META}>{canSynth ? "pick a winner or synthesize" : "pick a winner"}</span>
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
                    winners by agent: {sources.map((s) => `${agentLabel(agentByWs.get(s.workspaceId) ?? s.workspaceId)} ${s.count}`).join(" · ")}
                </div>
            )}
            {unresolvedCount > 0 && (
                <div className="flex flex-col gap-0.5 rounded border border-white/8 px-2 py-1">
                    <div className="text-xs text-secondary">
                        Unresolved — pick a winner for each before composing:
                    </div>
                    {plan.unresolved.map((u) => (
                        <span key={u.path} className="truncate font-mono text-xs text-secondary" title={u.reason || undefined}>
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
function ConvergePanel({ taskGroup, contested, siblings, onReview }: ConvergePanelProps) {
    const [selection, setSelection] = useState<ConvergeSelection>({});
    const [plan, setPlan] = useState<ConvergePlan>(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [planError, setPlanError] = useState("");
    const [composing, setComposing] = useState(false);
    const [composeError, setComposeError] = useState("");
    const [composedId, setComposedId] = useState("");
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
                map[c.path] = { synthesizable: c.synthesizable, reason: c.reason ?? "" };
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
        setSelection((cur) => toggleSelection(cur, path, value));
    };

    const onCompose = async () => {
        setComposing(true);
        setComposeError("");
        const result = await composeConvergence(taskGroup, selection);
        setComposing(false);
        if (result.ok) {
            setComposedId(result.workspaceId);
            onReview(result.workspaceId);
            return;
        }
        setComposeError(result.error);
    };

    const composeReady = plan != null && plan.complete && !composing;
    const anySynth = Object.values(synthMap).some((s) => s.synthesizable);

    return (
        <div className="flex flex-col gap-1.5 rounded border border-accent/30 px-2 py-2">
            <div className={FIELD_LABEL}>
                Converge — pick a winner{anySynth ? " or Synthesize" : ""} per contested file, then compose one reviewable
                workspace
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
                <div className="flex items-center gap-2">
                    <span className="text-xs text-accent">Convergence workspace created — opening review.</span>
                    <button className={QUIET_BTN} onClick={() => onReview(composedId)} title="Open the convergence workspace diff">
                        Open review
                    </button>
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
