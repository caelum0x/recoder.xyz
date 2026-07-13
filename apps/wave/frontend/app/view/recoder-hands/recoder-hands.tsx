// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { ActiveHand, Hand, HandsStatus, RecoderHandsViewModel } from "./recoder-hands-model";

const STATUS_MESSAGES: Record<HandsStatus, string> = {
    loading: "",
    ok: "",
    empty: "No Hands compiled into the engine.",
    "not-running": "OpenFang engine not built — run `cargo build -p openfang-napi` in modules/agent-engine/openfang to enable Hands.",
    "not-connected": "Not connected — start the Recoder backend to reach OpenFang.",
};

function isPaused(status: string): boolean {
    return status.toLowerCase() == "paused";
}

function ActiveRow({ hand, model }: { hand: ActiveHand; model: RecoderHandsViewModel }) {
    const paused = isPaused(hand.status);
    return (
        <div className="flex items-center gap-2 rounded border border-border px-2 py-1" title={hand.instanceId}>
            <span
                className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${
                    paused ? "bg-border/60 text-secondary" : "bg-success/20 text-success"
                }`}
            >
                {hand.status}
            </span>
            <span className="text-sm truncate">{hand.name}</span>
            <span className="text-xs text-secondary font-mono ml-auto shrink-0">{hand.handId}</span>
            {paused ? (
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                    onClick={() => model.resume(hand.instanceId)}
                >
                    Resume
                </button>
            ) : (
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                    onClick={() => model.pause(hand.instanceId)}
                >
                    Pause
                </button>
            )}
            <button
                className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                onClick={() => model.deactivate(hand.instanceId)}
            >
                Stop
            </button>
        </div>
    );
}

function CatalogRow({ hand, model }: { hand: Hand; model: RecoderHandsViewModel }) {
    return (
        <div
            className="flex items-center gap-2 rounded border border-border px-2 py-1"
            title={hand.description != "" ? hand.description : hand.name}
        >
            <span className="text-sm truncate">{hand.name}</span>
            {hand.description != "" && (
                <span className="text-xs text-secondary truncate hidden sm:inline">— {hand.description}</span>
            )}
            {hand.id != "" && <span className="text-xs text-secondary font-mono ml-auto shrink-0">{hand.id}</span>}
            <button
                className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                onClick={() => model.activate(hand.id)}
            >
                Activate
            </button>
        </div>
    );
}

function RecoderHandsView({ model }: ViewComponentProps<RecoderHandsViewModel>) {
    const hands = useAtomValue(model.handsAtom);
    const active = useAtomValue(model.activeAtom);
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
                <span className="text-xs text-secondary">in-process engine</span>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer ml-auto"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
            </div>
            {loading && hands.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showNote && <div className="text-secondary text-sm">{note}</div>}
            {actionStatus != "" && <div className="text-secondary text-sm">{actionStatus}</div>}

            {active.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Active</div>
                    {active.map((hand) => (
                        <ActiveRow key={hand.instanceId} hand={hand} model={model} />
                    ))}
                </div>
            )}

            {hands.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Catalog</div>
                    {hands.map((hand) => (
                        <CatalogRow key={hand.id || hand.name} hand={hand} model={model} />
                    ))}
                </div>
            )}
        </div>
    );
}

RecoderHandsView.displayName = "RecoderHandsView";

export { RecoderHandsView };
