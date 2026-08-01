// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure parse logic for the Settings backend doctor, kept free of jotai/fetch
// (mirrors recoder-runs-findings.ts) so vitest covers it fully.
//
// GET /api/conductor/health (backend/src/domains/conductor/routes/
// conductor.routes.ts) answers via sendSuccess — { success, data: { available,
// tmux, substrate: { tmuxBin, tmuxSocket }, reason? } } — a reachable backend
// with NO tmux substrate must not look healthy. GET /health/full
// (observability.routes.ts) answers the RAW HealthReport (no envelope) with
// HTTP 503 when status is "down", so callers parse the body regardless of
// res.ok. Statuses stay open strings so a new backend value is surfaced raw
// instead of silently dropped.

type ConductorDiagnosis = {
    status: "ok" | "degraded" | "fail";
    lines: string[];
};

function asOptionalString(value: unknown): string | undefined {
    return typeof value == "string" && value != "" ? value : undefined;
}

// Diagnose the /api/conductor/health body. The envelope is unwrapped
// defensively (a bare payload is tolerated); a malformed body falls back to
// the plain reachability line so behavior never regresses below the old
// HTTP-status-only probe.
function describeConductorHealth(body: unknown, httpStatus: number): ConductorDiagnosis {
    const outer = body as { data?: unknown } | null;
    const candidate = outer?.data != null && typeof outer.data == "object" ? outer.data : body;
    if (
        candidate == null ||
        typeof candidate != "object" ||
        typeof (candidate as { available?: unknown }).available != "boolean"
    ) {
        return { status: "ok", lines: [`Reachable (HTTP ${httpStatus})`] };
    }
    const health = candidate as Record<string, unknown>;
    if (health.available != true) {
        return { status: "fail", lines: [asOptionalString(health.reason) ?? "no substrate available"] };
    }
    if (health.tmux != true) {
        return { status: "degraded", lines: ["a substrate is available but tmux is not"] };
    }
    const substrate = (health.substrate ?? {}) as Record<string, unknown>;
    const lines = ["tmux substrate ready"];
    const tmuxBin = asOptionalString(substrate.tmuxBin);
    if (tmuxBin != null) {
        lines.push(`tmux: ${tmuxBin}`);
    }
    const tmuxSocket = asOptionalString(substrate.tmuxSocket);
    if (tmuxSocket != null) {
        lines.push(`socket: ${tmuxSocket}`);
    }
    return { status: "ok", lines };
}

// Per-source rollup lines from the raw /health/full HealthReport. A missing or
// malformed sources array yields [] — the conductor probe alone already
// decided reachability, so the rollup only ever adds detail.
function summarizeHealthReport(report: unknown): string[] {
    const sources = (report as { sources?: unknown } | null)?.sources;
    if (!Array.isArray(sources)) {
        return [];
    }
    const lines: string[] = [];
    for (const raw of sources) {
        if (raw == null || typeof raw != "object") {
            continue;
        }
        const source = raw as Record<string, unknown>;
        const name = asOptionalString(source.name);
        if (name == null) {
            continue;
        }
        lines.push(`${name}: ${asOptionalString(source.status) ?? "unknown"}`);
        const reason = asOptionalString(source.reason);
        if (reason != null) {
            lines.push(`  reason: ${reason}`);
        }
    }
    return lines;
}

export { describeConductorHealth, summarizeHealthReport, type ConductorDiagnosis };
