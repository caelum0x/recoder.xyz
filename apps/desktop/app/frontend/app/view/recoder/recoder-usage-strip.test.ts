// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkspaceUsage, parseUsageEnvelope, workspaceUsageUrl } from "./recoder-usage-strip";

describe("workspaceUsageUrl", () => {
    it("builds the scoped usage URL with an encoded workspace id", () => {
        expect(workspaceUsageUrl("http://127.0.0.1:3100", "ws-1")).toBe(
            "http://127.0.0.1:3100/api/gateway/inference/usage?workspaceId=ws-1",
        );
        expect(workspaceUsageUrl("http://127.0.0.1:3100", "ws/../x")).toBe(
            "http://127.0.0.1:3100/api/gateway/inference/usage?workspaceId=ws%2F..%2Fx",
        );
    });

    it("omits the scope param when no workspace id is given", () => {
        expect(workspaceUsageUrl("http://127.0.0.1:3100", "")).toBe(
            "http://127.0.0.1:3100/api/gateway/inference/usage",
        );
    });
});

describe("parseUsageEnvelope", () => {
    it("folds a successful envelope through the metering formatter", () => {
        const display = parseUsageEnvelope({
            success: true,
            data: {
                totals: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, costMicroUsd: 4200, calls: 3 },
                recent: [{ model: "claude", inputTokens: 100, outputTokens: 50, costMicroUsd: 900 }],
                scope: { workspaceId: "ws-1" },
            },
        });
        expect(display).not.toBeNull();
        expect(display.totals.totalTokens).toBe("1,500");
        expect(display.totals.cost).toBe("$0.0042");
        expect(display.totals.calls).toBe("3");
        expect(display.scopeLabel).toBe("workspace ws-1");
        expect(display.recent).toHaveLength(1);
        expect(display.recent[0].model).toBe("claude");
    });

    it("returns null (unavailable) for failure envelopes and garbage — never a faked zero strip", () => {
        expect(parseUsageEnvelope(null)).toBeNull();
        expect(parseUsageEnvelope("nope")).toBeNull();
        expect(parseUsageEnvelope({ success: false, error: "denied" })).toBeNull();
        expect(parseUsageEnvelope({ success: true })).toBeNull();
        expect(parseUsageEnvelope({ success: true, data: "garbage" })).toBeNull();
    });

    it("yields an all-zero strip only from a real successful-but-empty payload", () => {
        const display = parseUsageEnvelope({ success: true, data: {} });
        expect(display).not.toBeNull();
        expect(display.totals.totalTokens).toBe("0");
        expect(display.totals.cost).toBe("$0.00");
        expect(display.recent).toHaveLength(0);
    });

    it("keeps real-zero, unavailable, and errored as three distinct rendering decisions", () => {
        // Real zero: a genuine no-spend ledger — a non-null strip the view shows.
        const realZero = parseUsageEnvelope({ success: true, data: { totals: { calls: 0, costMicroUsd: 0 } } });
        expect(realZero).not.toBeNull();
        expect(realZero.totals.calls).toBe("0");
        expect(realZero.totals.cost).toBe("$0.00");
        // Errored (success:false) and unavailable (garbage) both collapse to null —
        // never a faked $0.00 that reads as a successful zero.
        expect(parseUsageEnvelope({ success: false, data: { totals: { costMicroUsd: 0 } } })).toBeNull();
        expect(parseUsageEnvelope(null)).toBeNull();
    });

    it("carries the cost's provenance through the envelope — estimated by default, metered only when asserted", () => {
        expect(parseUsageEnvelope({ success: true, data: { totals: { costMicroUsd: 900, calls: 1 } } }).provenance).toBe(
            "estimated",
        );
        expect(
            parseUsageEnvelope({ success: true, data: { totals: { costMicroUsd: 900, calls: 1 }, metered: true } })
                .provenance,
        ).toBe("metered");
    });
});

describe("fetchWorkspaceUsage", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetches the scoped usage read and folds the payload", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, data: { totals: { totalTokens: 42, costMicroUsd: 0 } } }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const display = await fetchWorkspaceUsage("http://127.0.0.1:3100", "ws-1");
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/gateway/inference/usage?workspaceId=ws-1");
        expect(display.totals.totalTokens).toBe("42");
    });

    it("returns null without a request when no workspace is bound", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(await fetchWorkspaceUsage("http://127.0.0.1:3100", "")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null on HTTP failure, non-JSON body, and thrown transport errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false }) }),
        );
        expect(await fetchWorkspaceUsage("http://x", "ws-1")).toBeNull();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error("bad json");
                },
            }),
        );
        expect(await fetchWorkspaceUsage("http://x", "ws-1")).toBeNull();

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));
        expect(await fetchWorkspaceUsage("http://x", "ws-1")).toBeNull();
    });
});
