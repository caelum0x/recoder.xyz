// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { Hand, HandsStatus, RecoderHandsViewModel } from "./recoder-hands-model";

// Truthful neutral copy for every non-ok state — never implies openfang is running
// when it is not. "not-running" is the common case on a machine without the binary.
const STATUS_MESSAGES: Record<HandsStatus, string> = {
    loading: "",
    ok: "",
    empty: "No Hands registered — install one from the OpenFang catalog to get started.",
    "not-running": "OpenFang is not running — build `crates/openfang` and start the daemon to use autonomous Hands.",
    "not-connected": "Not connected — start the Recoder backend to reach OpenFang.",
};

function isActive(status: string): boolean {
    const s = status.toLowerCase();
    return s == "active" || s == "running" || s == "enabled" || s == "on";
}

function HandRow({ hand, model }: { hand: Hand; model: RecoderHandsViewModel }) {
    const active = isActive(hand.status);
    return (
        <div
            className="flex items-center gap-2 rounded border border-border px-2 py-1"
            title={hand.description != "" ? hand.description : hand.name}
        >
            <span
                className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${
                    active ? "bg-success/20 text-success" : "bg-border/60 text-secondary"
                }`}
            >
                {active ? "active" : hand.status}
            </span>
            <span className="text-sm truncate">{hand.name}</span>
            {hand.description != "" && (
                <span className="text-xs text-secondary truncate hidden sm:inline">— {hand.description}</span>
            )}
            {hand.id != "" && (
                <span className="text-xs text-secondary font-mono ml-auto shrink-0">{hand.id}</span>
            )}
            {!active && (
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                    onClick={() => model.activate(hand.id)}
                >
                    Activate
                </button>
            )}
        </div>
    );
}

function RecoderHandsView({ model }: ViewComponentProps<RecoderHandsViewModel>) {
    const hands = useAtomValue(model.handsAtom);
    const loading = useAtomValue(model.loadingAtom);
    const status = useAtomValue(model.statusAtom);
    const actionStatus = useAtomValue(model.actionStatusAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

    const note = STATUS_MESSAGES[status];
    const showNote = !loading && status != "ok" && note != "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">OpenFang — Hands</span>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
            </div>
            {loading && hands.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showNote && <div className="text-secondary text-sm">{note}</div>}
            {actionStatus != "" && <div className="text-secondary text-sm">{actionStatus}</div>}
            <div className="flex flex-col gap-1">
                {hands.map((hand) => (
                    <HandRow key={hand.id || hand.name} hand={hand} model={model} />
                ))}
            </div>
        </div>
    );
}

RecoderHandsView.displayName = "RecoderHandsView";

export { RecoderHandsView };
