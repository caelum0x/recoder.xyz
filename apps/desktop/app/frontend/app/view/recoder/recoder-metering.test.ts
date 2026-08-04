// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
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
} from "./recoder-metering";

describe("formatCount", () => {
    it("groups thousands and clamps garbage to zero", () => {
        expect(formatCount(0)).toBe("0");
        expect(formatCount(999)).toBe("999");
        expect(formatCount(1234)).toBe("1,234");
        expect(formatCount(1234567)).toBe("1,234,567");
    });

    it("rounds fractionals and floors negatives/non-finite to zero", () => {
        expect(formatCount(1499.6)).toBe("1,500");
        expect(formatCount(-42)).toBe("0");
        expect(formatCount(Number.NaN)).toBe("0");
        expect(formatCount(undefined)).toBe("0");
    });
});

describe("formatMicroUsd", () => {
    it("renders sub-cent costs with four decimals", () => {
        expect(formatMicroUsd(4200)).toBe("$0.0042");
        expect(formatMicroUsd(500)).toBe("$0.0005");
    });

    it("renders whole-dollar costs with two decimals", () => {
        expect(formatMicroUsd(1_500_000)).toBe("$1.50");
        expect(formatMicroUsd(12_340_000)).toBe("$12.34");
    });

    it("renders an exact/absent zero as $0.00 and never throws", () => {
        expect(formatMicroUsd(0)).toBe("$0.00");
        expect(formatMicroUsd(undefined)).toBe("$0.00");
        expect(formatMicroUsd(Number.NaN)).toBe("$0.00");
    });
});

describe("formatLatencyMs", () => {
    it("renders a real latency and omits a missing/invalid one", () => {
        expect(formatLatencyMs(123.4)).toBe("123 ms");
        expect(formatLatencyMs(0)).toBe("0 ms");
        expect(formatLatencyMs(null)).toBeNull();
        expect(formatLatencyMs(undefined)).toBeNull();
        expect(formatLatencyMs(-5)).toBeNull();
    });
});

describe("describeUsageRow", () => {
    it("formats a full ledger row into display strings", () => {
        const row = describeUsageRow({
            model: "openai/gpt-4o-mini",
            provider: "openai",
            tier: "loopback",
            inputTokens: 1200,
            outputTokens: 300,
            totalTokens: 1500,
            costMicroUsd: 4200,
            createdAt: "2026-08-01T10:20:30.000Z",
        });
        expect(row.model).toBe("openai/gpt-4o-mini");
        expect(row.provider).toBe("openai");
        expect(row.tier).toBe("loopback");
        expect(row.inputTokens).toBe("1,200");
        expect(row.outputTokens).toBe("300");
        expect(row.totalTokens).toBe("1,500");
        expect(row.cost).toBe("$0.0042");
        expect(row.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(row.latency).toBeUndefined();
    });

    it("derives total from input+output when the ledger omits it", () => {
        const row = describeUsageRow({ inputTokens: 40, outputTokens: 60 });
        expect(row.totalTokens).toBe("100");
    });

    it("fills placeholders for missing model/provider/tier/time and never throws", () => {
        const row = describeUsageRow({});
        expect(row.model).toBe("unknown");
        expect(row.provider).toBe("—");
        expect(row.tier).toBe("—");
        expect(row.time).toBe("--:--:--");
        expect(row.inputTokens).toBe("0");
        expect(row.cost).toBe("$0.00");
    });

    it("includes latency only when the row carries a real one", () => {
        expect(describeUsageRow({ latencyMs: 250 }).latency).toBe("250 ms");
        expect(describeUsageRow({ latencyMs: null }).latency).toBeUndefined();
    });
});

describe("summarizeUsageTotals", () => {
    it("formats the totals block from a real payload", () => {
        const totals = summarizeUsageTotals({
            inputTokens: 12000,
            outputTokens: 3400,
            totalTokens: 15400,
            costMicroUsd: 1_500_000,
            calls: 42,
        });
        expect(totals).toEqual({
            inputTokens: "12,000",
            outputTokens: "3,400",
            totalTokens: "15,400",
            cost: "$1.50",
            calls: "42",
        });
    });

    it("derives the total and defaults to zeros when totals are absent", () => {
        expect(summarizeUsageTotals({ inputTokens: 10, outputTokens: 5 }).totalTokens).toBe("15");
        expect(summarizeUsageTotals(undefined)).toEqual({
            inputTokens: "0",
            outputTokens: "0",
            totalTokens: "0",
            cost: "$0.00",
            calls: "0",
        });
    });
});

describe("summarizeUsage", () => {
    it("folds a full /inference/usage payload into totals + recent rows", () => {
        const display = summarizeUsage({
            totals: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costMicroUsd: 8400, calls: 2 },
            recent: [
                { model: "a", inputTokens: 60, outputTokens: 30, totalTokens: 90, costMicroUsd: 4200, createdAt: "2026-08-01T00:00:00.000Z" },
                { model: "b", inputTokens: 40, outputTokens: 20, totalTokens: 60, costMicroUsd: 4200 },
            ],
        });
        expect(display.totals.totalTokens).toBe("150");
        expect(display.totals.cost).toBe("$0.0084");
        expect(display.recent).toHaveLength(2);
        expect(display.recent[0].model).toBe("a");
        expect(display.recent[1].totalTokens).toBe("60");
    });

    it("degrades to an all-zero strip for a missing/garbage payload", () => {
        for (const bad of [undefined, {}, { recent: "nope" } as unknown as { recent: unknown[] }]) {
            const display = summarizeUsage(bad as never);
            expect(display.recent).toEqual([]);
            expect(display.totals.cost).toBe("$0.00");
            expect(display.totals.totalTokens).toBe("0");
            expect(display.scopeLabel).toBe("all usage");
        }
    });

    it("labels the display from the ECHOED scope, not any requested one", () => {
        const scoped = summarizeUsage({
            totals: { inputTokens: 10, outputTokens: 5, costMicroUsd: 100, calls: 1 },
            recent: [],
            scope: { workspaceId: "ws-1" },
        });
        expect(scoped.scopeLabel).toBe("workspace ws-1");
        expect(summarizeUsage({ totals: {}, recent: [] }).scopeLabel).toBe("all usage");
    });
});

describe("describeUsageProvenance", () => {
    it("defaults to 'estimated' — costs are catalog-priced, never a settled bill", () => {
        expect(describeUsageProvenance(undefined)).toBe("estimated");
        expect(describeUsageProvenance({})).toBe("estimated");
        expect(describeUsageProvenance({ totals: { costMicroUsd: 4200, calls: 3 } })).toBe("estimated");
        expect(describeUsageProvenance({ metered: false })).toBe("estimated");
    });

    it("claims 'metered' ONLY on an explicit backend assertion, never by inference", () => {
        expect(describeUsageProvenance({ metered: true })).toBe("metered");
        // A truthy-but-not-true value must not upgrade the label.
        expect(describeUsageProvenance({ metered: 1 as unknown as boolean })).toBe("estimated");
    });
});

describe("usageCostTitle", () => {
    it("flags an estimate as catalog-priced and not a bill", () => {
        const title = usageCostTitle({ provenance: "estimated", scopeLabel: "workspace ws-1" });
        expect(title).toContain("Estimated inference cost for workspace ws-1");
        expect(title).toContain("not a settled bill");
        expect(title).not.toContain("Metered");
    });

    it("uses the metered wording only when the cost is truly metered", () => {
        expect(usageCostTitle({ provenance: "metered", scopeLabel: "all usage" })).toBe(
            "Metered inference spend for all usage",
        );
    });
});

describe("summarizeUsage provenance", () => {
    it("labels a plain payload 'estimated' and honors an explicit metered assertion", () => {
        expect(summarizeUsage({ totals: { costMicroUsd: 900, calls: 1 } }).provenance).toBe("estimated");
        expect(summarizeUsage(undefined).provenance).toBe("estimated");
        expect(summarizeUsage({ totals: { costMicroUsd: 900, calls: 1 }, metered: true }).provenance).toBe("metered");
    });
});

describe("describeUsageScope", () => {
    it("labels workspace, task, both, and the unscoped read", () => {
        expect(describeUsageScope(undefined)).toBe("all usage");
        expect(describeUsageScope({})).toBe("all usage");
        expect(describeUsageScope({ workspaceId: "ws-1" })).toBe("workspace ws-1");
        expect(describeUsageScope({ taskId: "t-9" })).toBe("task t-9");
        expect(describeUsageScope({ workspaceId: "ws-1", taskId: "t-9" })).toBe("workspace ws-1 · task t-9");
    });

    it("treats blank ids as absent", () => {
        expect(describeUsageScope({ workspaceId: "  " })).toBe("all usage");
        expect(describeUsageScope({ workspaceId: " ", taskId: "t-1" })).toBe("task t-1");
    });
});

describe("row attribution", () => {
    it("carries the ledger-recorded workspace/task ids", () => {
        expect(describeUsageRow({ workspaceId: "ws-1" }).attribution).toBe("ws-1");
        expect(describeUsageRow({ taskId: "t-2" }).attribution).toBe("t-2");
        expect(describeUsageRow({ workspaceId: "ws-1", taskId: "t-2" }).attribution).toBe("ws-1 · t-2");
    });

    it("stays the honest 'unattributed' for a null-scoped row", () => {
        expect(describeUsageRow({}).attribution).toBe("unattributed");
        expect(describeUsageRow({ workspaceId: null, taskId: null }).attribution).toBe("unattributed");
        expect(describeUsageRow({ workspaceId: "" }).attribution).toBe("unattributed");
    });
});

describe("buildUsagePath", () => {
    it("builds the plain per-user read when unscoped", () => {
        expect(buildUsagePath(undefined)).toBe("/api/gateway/inference/usage");
        expect(buildUsagePath({})).toBe("/api/gateway/inference/usage");
        expect(buildUsagePath({ workspaceId: "  " })).toBe("/api/gateway/inference/usage");
    });

    it("appends the scope as query params", () => {
        expect(buildUsagePath({ workspaceId: "ws-1" })).toBe("/api/gateway/inference/usage?workspaceId=ws-1");
        expect(buildUsagePath({ taskId: "t-9" })).toBe("/api/gateway/inference/usage?taskId=t-9");
        expect(buildUsagePath({ workspaceId: "ws-1", taskId: "t-9" })).toBe(
            "/api/gateway/inference/usage?workspaceId=ws-1&taskId=t-9"
        );
    });

    it("URL-encodes hostile ids so they cannot break the query", () => {
        expect(buildUsagePath({ workspaceId: "ws 1&x=y" })).toBe(
            "/api/gateway/inference/usage?workspaceId=ws+1%26x%3Dy"
        );
    });
});
