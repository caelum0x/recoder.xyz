// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { agentLabel } from "../recoder/recoder-agent-labels";
import { FleetService, HealthStatus, RecoderHealthViewModel } from "./recoder-health-model";

const REFRESH_MS = 10000;

const STATUS_LABELS: Record<HealthStatus, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    unhealthy: "Unhealthy",
};

function statusClass(status: HealthStatus): string {
    if (status == "healthy") {
        return "bg-success/20 text-success";
    }
    if (status == "degraded") {
        return "bg-warning/20 text-warning";
    }
    return "bg-error/20 text-error";
}

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <span className={ok ? "text-success" : "text-secondary"}>{ok ? "✓" : "—"}</span>
            <span className={ok ? "" : "text-secondary"}>{label}</span>
            {hint != "" && hint != null && <span className="text-xs text-secondary ml-auto">{hint}</span>}
        </div>
    );
}

function FleetRow({ svc }: { svc: FleetService }) {
    return (
        <div className="flex items-center gap-2 text-sm" title={svc.reason}>
            <span className={svc.available ? "text-success" : "text-warning"}>{svc.available ? "✓" : "◐"}</span>
            <span className={svc.available ? "" : "text-secondary"}>{svc.id}</span>
            {!svc.available && svc.degradeTo != "" && (
                <span className="text-xs text-secondary ml-auto truncate">→ {svc.degradeTo}</span>
            )}
        </div>
    );
}

function RecoderHealthView({ model }: ViewComponentProps<RecoderHealthViewModel>) {
    const health = useAtomValue(model.healthAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showDisconnected = !connected && !loading;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Health</span>
                {connected && (
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", statusClass(health.status))}>
                        {STATUS_LABELS[health.status]}
                    </span>
                )}
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer ml-auto"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
            </div>

            {loading && !connected && <div className="text-secondary text-sm">Loading…</div>}
            {showDisconnected && (
                <div className="text-secondary text-sm">
                    Not connected — start the Recoder backend to see fleet health.
                </div>
            )}

            {connected && (
                <>
                    <div className="flex flex-col gap-1 rounded border border-border p-3">
                        <div className="text-xs uppercase tracking-wide text-secondary">Substrate</div>
                        <CheckRow ok={health.substrate.git} label="git" />
                        <CheckRow ok={health.substrate.tmux} label="tmux" />
                    </div>

                    <div className="flex flex-col gap-1 rounded border border-border p-3">
                        <div className="text-xs uppercase tracking-wide text-secondary">Installed agents</div>
                        {health.runtimes.length == 0 && (
                            <div className="text-sm text-secondary">No coding agents detected on PATH.</div>
                        )}
                        {health.runtimes.map((r) => (
                            <CheckRow key={r.runtimeId} ok={r.available} label={agentLabel(r.runtimeId)} />
                        ))}
                    </div>

                    <div className="flex flex-col gap-1 rounded border border-border p-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-secondary">Fleet services</span>
                            <span className="text-xs text-secondary ml-auto">
                                {health.fleet.summary.available}/{health.fleet.summary.total} up
                            </span>
                        </div>
                        <CheckRow ok={health.services.beads} label="issue graph" />
                        <CheckRow ok={health.services.colbertRerank} label="retrieval rerank" />
                        {health.fleet.services.length == 0 && (
                            <div className="text-sm text-secondary">No fleet services configured.</div>
                        )}
                        {health.fleet.services.map((s) => (
                            <FleetRow key={s.id} svc={s} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

RecoderHealthView.displayName = "RecoderHealthView";

export { RecoderHealthView };
