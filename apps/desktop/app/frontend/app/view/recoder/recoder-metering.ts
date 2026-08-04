// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure formatting of the backend inference usage ledger (GET /inference/usage)
// into a display model for a cost/token strip. The endpoint returns a per-user
// {totals, recent} view where each row carries token counts + a micro-USD cost;
// this turns those raw integers into presentation strings without a view.
//
// The ledger is per-user, narrowable per-workspace/task via
// GET /inference/usage?workspaceId=…&taskId=… (the backend filters + echoes the
// scope; rows carry workspaceId/taskId when the call was attributed). Rows carry
// no latency (latency lives on the delivery-outcome trail, which has no read
// route), so the per-row latency here is formatted only when a payload happens
// to carry it, and is otherwise omitted — never fabricated.

// Structural mirror — the response is untrusted external data, so every field is
// optional and this never couples to a backend package.
type UsageRowLike = {
    model?: string;
    provider?: string | null;
    tier?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costMicroUsd?: number;
    createdAt?: string;
    latencyMs?: number | null;
    workspaceId?: string | null;
    taskId?: string | null;
};

// The attribution scope the backend echoed (only present when the caller
// narrowed the read); also the shape buildUsagePath accepts for the request.
type UsageScopeLike = {
    workspaceId?: string;
    taskId?: string;
};

type UsageTotalsLike = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costMicroUsd?: number;
    calls?: number;
};

type UsagePayloadLike = {
    totals?: UsageTotalsLike;
    recent?: readonly UsageRowLike[];
    scope?: UsageScopeLike;
    // The backend MAY assert these totals are a settled meter reading rather than
    // a catalog-priced estimate. Absent/false ⇒ estimated — which is the current
    // reality: every cost is computed from catalog pricing × token counts (the
    // token counts themselves heuristic when the gateway is silent), so the strip
    // must not present it as a settled bill. Only an explicit `metered === true`
    // upgrades the label; we never infer "metered" on our own.
    metered?: boolean;
};

// Whether the strip's cost is a settled meter reading or a catalog-priced
// estimate. An estimate is not a bill — for BYOK/self-keyed routing the user's
// own provider issues the real invoice and our number is only indicative. When
// we cannot positively confirm a settled reading, we say "estimated".
type MeteringProvenance = "metered" | "estimated";

interface MeteringTotalsDisplay {
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
    cost: string;
    calls: string;
}

interface MeteringRowDisplay {
    time: string;
    model: string;
    provider: string;
    tier: string;
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
    cost: string;
    // What the ledger attributed this row to — workspace/task ids when the call
    // carried them, or the honest "unattributed" for a null-scoped row. Never
    // fabricated from the requested scope.
    attribution: string;
    // Present only when the row carried a real latency — otherwise omitted, never
    // a fabricated zero (the usage ledger does not report latency).
    latency?: string;
}

interface MeteringDisplay {
    totals: MeteringTotalsDisplay;
    recent: MeteringRowDisplay[];
    // Labels what the numbers describe, from the scope the backend ECHOED (not
    // the one the caller asked for) — "all usage" when the read was unscoped.
    scopeLabel: string;
    // Whether `cost` is a settled meter reading or a catalog-priced estimate. The
    // view MUST use this to label the strip so an estimate is never shown as a
    // bill. Defaults to "estimated" — see MeteringProvenance / describeUsageProvenance.
    provenance: MeteringProvenance;
}

const MicroUsdPerUsd = 1_000_000;

// A finite, non-negative integer count (token counts + call counts are never
// negative); anything non-finite or negative collapses to 0.
function safeCount(value?: number): number {
    if (typeof value != "number" || !Number.isFinite(value)) return 0;
    return value < 0 ? 0 : Math.round(value);
}

function formatCount(value?: number): string {
    return String(safeCount(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Micro-USD integer → a `$`-prefixed USD string. Sub-dollar costs keep 4 decimals
// so fractions of a cent stay visible; a whole zero renders as `$0.00`.
function formatMicroUsd(micro?: number): string {
    const value = typeof micro == "number" && Number.isFinite(micro) ? micro : 0;
    const dollars = value / MicroUsdPerUsd;
    if (dollars == 0) return "$0.00";
    return dollars >= 1 || dollars <= -1 ? `$${dollars.toFixed(2)}` : `$${dollars.toFixed(4)}`;
}

function formatLatencyMs(ms?: number | null): string | null {
    if (typeof ms != "number" || !Number.isFinite(ms) || ms < 0) return null;
    return `${Math.round(ms)} ms`;
}

function formatUsageTime(iso?: string): string {
    if (iso == null || iso == "") return "--:--:--";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "--:--:--";
    return d.toTimeString().slice(0, 8);
}

// A row's total defaults to input+output when the ledger omitted it, so the strip
// never shows a blank total for an otherwise-populated row.
function rowTotalTokens(row: UsageRowLike): number {
    if (typeof row.totalTokens == "number" && Number.isFinite(row.totalTokens)) {
        return safeCount(row.totalTokens);
    }
    return safeCount(row.inputTokens) + safeCount(row.outputTokens);
}

function cleanScopeId(value?: string | null): string {
    return typeof value == "string" ? value.trim() : "";
}

// Row-level attribution comes ONLY from what the ledger recorded on the row —
// a null-scoped row stays the honest "unattributed" even inside a scoped read.
function describeRowAttribution(row: UsageRowLike): string {
    const ws = cleanScopeId(row.workspaceId);
    const task = cleanScopeId(row.taskId);
    if (ws == "" && task == "") return "unattributed";
    if (ws != "" && task != "") return `${ws} · ${task}`;
    return ws != "" ? ws : task;
}

// The cost's provenance. "metered" is claimed ONLY when the backend explicitly
// asserts a settled reading (`metered === true`); every other payload — the
// current reality, where costs are catalog-priced estimates — stays the honest
// "estimated". We never upgrade to "metered" by inference.
function describeUsageProvenance(payload?: UsagePayloadLike): MeteringProvenance {
    return payload?.metered === true ? "metered" : "estimated";
}

// The strip's title/label: what the cost describes AND how trustworthy it is. An
// estimate is explicitly flagged as catalog-priced, never a settled bill, so the
// view can drop this in verbatim instead of hardcoding "Metered …".
function usageCostTitle(display: Pick<MeteringDisplay, "provenance" | "scopeLabel">): string {
    if (display.provenance == "metered") {
        return `Metered inference spend for ${display.scopeLabel}`;
    }
    return `Estimated inference cost for ${display.scopeLabel} — priced from token counts against the model catalog, not a settled bill`;
}

// Label for the ECHOED scope of a usage payload — what the totals/rows describe.
function describeUsageScope(scope?: UsageScopeLike): string {
    const ws = cleanScopeId(scope?.workspaceId);
    const task = cleanScopeId(scope?.taskId);
    if (ws == "" && task == "") return "all usage";
    if (ws != "" && task != "") return `workspace ${ws} · task ${task}`;
    return ws != "" ? `workspace ${ws}` : `task ${task}`;
}

const UsageEndpointPath = "/api/gateway/inference/usage";

// The scoped read path for GET /inference/usage (inference mounts at
// /api/gateway). Empty/blank scope parts are omitted, so an unscoped call stays
// the plain per-user read the backend has always served.
function buildUsagePath(scope?: UsageScopeLike): string {
    const params = new URLSearchParams();
    const ws = cleanScopeId(scope?.workspaceId);
    const task = cleanScopeId(scope?.taskId);
    if (ws != "") params.set("workspaceId", ws);
    if (task != "") params.set("taskId", task);
    const query = params.toString();
    return query == "" ? UsageEndpointPath : `${UsageEndpointPath}?${query}`;
}

function describeUsageRow(row: UsageRowLike): MeteringRowDisplay {
    const display: MeteringRowDisplay = {
        time: formatUsageTime(row.createdAt),
        model: typeof row.model == "string" && row.model != "" ? row.model : "unknown",
        provider: typeof row.provider == "string" && row.provider != "" ? row.provider : "—",
        tier: typeof row.tier == "string" && row.tier != "" ? row.tier : "—",
        inputTokens: formatCount(row.inputTokens),
        outputTokens: formatCount(row.outputTokens),
        totalTokens: formatCount(rowTotalTokens(row)),
        cost: formatMicroUsd(row.costMicroUsd),
        attribution: describeRowAttribution(row),
    };
    const latency = formatLatencyMs(row.latencyMs);
    if (latency != null) display.latency = latency;
    return display;
}

function summarizeUsageTotals(totals?: UsageTotalsLike): MeteringTotalsDisplay {
    const source = totals ?? {};
    const totalTokens =
        typeof source.totalTokens == "number" && Number.isFinite(source.totalTokens)
            ? safeCount(source.totalTokens)
            : safeCount(source.inputTokens) + safeCount(source.outputTokens);
    return {
        inputTokens: formatCount(source.inputTokens),
        outputTokens: formatCount(source.outputTokens),
        totalTokens: formatCount(totalTokens),
        cost: formatMicroUsd(source.costMicroUsd),
        calls: formatCount(source.calls),
    };
}

// The single entry point: fold a raw `/inference/usage` payload into the strip's
// display model. A missing/garbage payload yields an all-zero strip, never a throw.
function summarizeUsage(payload?: UsagePayloadLike): MeteringDisplay {
    const rows = Array.isArray(payload?.recent) ? payload!.recent : [];
    return {
        totals: summarizeUsageTotals(payload?.totals),
        recent: rows.map(describeUsageRow),
        scopeLabel: describeUsageScope(payload?.scope),
        provenance: describeUsageProvenance(payload),
    };
}

export {
    buildUsagePath,
    describeUsageProvenance,
    describeUsageRow,
    describeUsageScope,
    formatCount,
    formatLatencyMs,
    formatMicroUsd,
    summarizeUsage,
    summarizeUsageTotals,
    usageCostTitle,
    type MeteringDisplay,
    type MeteringProvenance,
    type MeteringRowDisplay,
    type MeteringTotalsDisplay,
    type UsagePayloadLike,
    type UsageRowLike,
    type UsageScopeLike,
    type UsageTotalsLike,
};
