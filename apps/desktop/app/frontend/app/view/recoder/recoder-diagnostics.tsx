// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";
import { META, QUIET_BTN_XS } from "./recoder-styles";

type Diagnostic = {
    path: string;
    line: number;
    character: number;
    severity: number;
    code?: string;
    source?: string;
    message: string;
};

type DiagnosticsDelta = {
    available: boolean;
    reason?: string;
    baseRef: string;
    changedFiles: string[];
    baseCount: number;
    headCount: number;
    introduced: Diagnostic[];
    resolved: Diagnostic[];
    unchanged: number;
    servers: { id: string; status: "ok" | "error"; detail?: string }[];
    truncated: boolean;
};

function row(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value == "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function count(value: unknown): number {
    return typeof value == "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parseDiagnostic(value: unknown): Diagnostic | null {
    const item = row(value);
    if (!item || typeof item.path != "string" || typeof item.message != "string") return null;
    return {
        path: item.path,
        line: count(item.line),
        character: count(item.character),
        severity: count(item.severity) || 1,
        ...(typeof item.code == "string" ? { code: item.code } : {}),
        ...(typeof item.source == "string" ? { source: item.source } : {}),
        message: item.message,
    };
}

function parseDelta(value: unknown): DiagnosticsDelta | null {
    const item = row(value);
    if (!item || typeof item.available != "boolean" || typeof item.baseRef != "string") return null;
    const servers = (Array.isArray(item.servers) ? item.servers : []).flatMap((value) => {
        const server = row(value);
        if (!server || typeof server.id != "string" || (server.status != "ok" && server.status != "error")) return [];
        const status = server.status as "ok" | "error";
        return [{
            id: server.id,
            status,
            ...(typeof server.detail == "string" ? { detail: server.detail } : {}),
        }];
    });
    return {
        available: item.available,
        ...(typeof item.reason == "string" ? { reason: item.reason } : {}),
        baseRef: item.baseRef,
        changedFiles: (Array.isArray(item.changedFiles) ? item.changedFiles : []).filter((path): path is string => typeof path == "string"),
        baseCount: count(item.baseCount),
        headCount: count(item.headCount),
        introduced: (Array.isArray(item.introduced) ? item.introduced : []).flatMap((value) => {
            const parsed = parseDiagnostic(value);
            return parsed ? [parsed] : [];
        }),
        resolved: (Array.isArray(item.resolved) ? item.resolved : []).flatMap((value) => {
            const parsed = parseDiagnostic(value);
            return parsed ? [parsed] : [];
        }),
        unchanged: count(item.unchanged),
        servers,
        truncated: item.truncated === true,
    };
}

function severityLabel(severity: number): string {
    return severity == 1 ? "error" : severity == 2 ? "warning" : severity == 3 ? "info" : "hint";
}

function DiagnosticRows({ items, tone }: { items: Diagnostic[]; tone: "introduced" | "resolved" }) {
    if (items.length == 0) return <span className={`${META} pl-3`}>None</span>;
    return (
        <ul className="flex flex-col gap-0.5 border-l border-white/10 pl-3">
            {items.map((item, index) => (
                <li key={`${item.path}:${item.line}:${item.character}:${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[11px]">
                    <span className={`font-mono ${tone == "introduced" && item.severity == 1 ? "text-error" : "text-meta"}`}>
                        {item.path}:{item.line + 1}:{item.character + 1}
                    </span>
                    <span className={tone == "resolved" ? "text-accent" : "text-secondary"} title={item.message}>
                        {severityLabel(item.severity)}{item.code ? ` ${item.code}` : ""} · {item.message}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function WorkspaceDiagnostics({ workspaceId }: { workspaceId: string }) {
    const [delta, setDelta] = useState<DiagnosticsDelta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/diagnostics`
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(readErrorReason(body) || "Diagnostics unavailable.");
            const parsed = parseDelta((body as { data?: { diagnostics?: unknown } } | null)?.data?.diagnostics);
            if (!parsed) throw new Error("Diagnostics returned an unreadable result.");
            setDelta(parsed);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Diagnostics unavailable.");
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => { void load(); }, [load]);

    return (
        <details className="group/diagnostics border-l-2 border-white/10 pl-2" open={(delta?.introduced.length ?? 0) > 0}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 py-0.5 marker:hidden">
                <span className="text-[11px] text-secondary">LSP delta</span>
                {loading ? (
                    <span className={META}>reading base and head…</span>
                ) : delta?.available ? (
                    <>
                        <span className="font-mono text-[10px] text-meta">{delta.baseRef}</span>
                        <span className="font-mono text-[10px] text-meta">{delta.baseCount}</span>
                        <span className="h-px w-8 bg-white/20" aria-hidden="true" />
                        <span className={`font-mono text-[10px] ${delta.introduced.some(item => item.severity == 1) ? "text-error" : "text-secondary"}`}>
                            {delta.headCount} head
                        </span>
                        <span className={delta.introduced.length > 0 ? "text-[10px] text-error" : "text-[10px] text-meta"}>
                            +{delta.introduced.length} introduced
                        </span>
                        <span className="text-[10px] text-accent">−{delta.resolved.length} resolved</span>
                    </>
                ) : (
                    <span className={META}>{delta?.reason || "not configured"}</span>
                )}
                <button
                    type="button"
                    className={`${QUIET_BTN_XS} ml-auto`}
                    disabled={loading}
                    onClick={(event) => { event.preventDefault(); void load(); }}
                >
                    Refresh
                </button>
            </summary>
            <div className="flex flex-col gap-2 pb-1 pt-1">
                {error && <span className="text-[11px] text-error" role="status">{error}</span>}
                {delta?.available && delta.changedFiles.length == 0 && <span className={META}>No changed source files.</span>}
                {delta?.available && delta.changedFiles.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-[9px] uppercase tracking-[0.11em] text-meta">Introduced</span>
                                <DiagnosticRows items={delta.introduced} tone="introduced" />
                            </div>
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-[9px] uppercase tracking-[0.11em] text-meta">Resolved</span>
                                <DiagnosticRows items={delta.resolved} tone="resolved" />
                            </div>
                        </div>
                        <span className={META}>
                            {delta.changedFiles.length} changed file{delta.changedFiles.length == 1 ? "" : "s"} · {delta.unchanged} unchanged diagnostic{delta.unchanged == 1 ? "" : "s"}
                            {delta.truncated ? " · bounded result" : ""}
                        </span>
                        {delta.servers.some(server => server.status == "error") && (
                            <span className="text-[10px] text-error">
                                {delta.servers.filter(server => server.status == "error").map(server => `${server.id}: ${server.detail || "failed"}`).join(" · ")}
                            </span>
                        )}
                    </>
                )}
            </div>
        </details>
    );
}

WorkspaceDiagnostics.displayName = "WorkspaceDiagnostics";

export { WorkspaceDiagnostics, parseDelta };
