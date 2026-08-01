// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure formatting of the backend inference usage ledger (GET /inference/usage)
// into a display model for a cost/token strip. The endpoint returns a per-user
// {totals, recent} view where each row carries token counts + a micro-USD cost;
// this turns those raw integers into presentation strings without a view.
//
// The ledger is per-user, not per-workspace/run, and its rows carry no latency
// (latency lives on the delivery-outcome trail, which has no read route). So the
// per-row latency here is formatted only when a payload happens to carry it, and
// is otherwise omitted — never fabricated.

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
};

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
    // Present only when the row carried a real latency — otherwise omitted, never
    // a fabricated zero (the usage ledger does not report latency).
    latency?: string;
}

interface MeteringDisplay {
    totals: MeteringTotalsDisplay;
    recent: MeteringRowDisplay[];
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
    };
}

export {
    describeUsageRow,
    formatCount,
    formatLatencyMs,
    formatMicroUsd,
    summarizeUsage,
    summarizeUsageTotals,
    type MeteringDisplay,
    type MeteringRowDisplay,
    type MeteringTotalsDisplay,
    type UsagePayloadLike,
    type UsageRowLike,
    type UsageTotalsLike,
};
