// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./recoder-endpoints", () => ({ getRecoderBackendUrl: () => "http://127.0.0.1:3100" }));

import { projectTrust, formatTrustBadge, fetchConvergenceTrust, type TrustView } from "./recoder-trust";

const TrustUrl = "http://127.0.0.1:3100/api/conductor/workspaces/ws-1/convergence-trust";

function ok(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

describe("projectTrust", () => {
    it("projects a valid trust wire defensively", () => {
        const v = projectTrust({
            score: 82,
            tier: "high",
            factors: [{ label: "verification", impact: "positive", delta: 0, detail: "ready" }, { label: "", impact: "x", delta: "n" }],
            reviewFlags: ["review LLM merge", 5],
            summary: "High trust (82/100)",
        });
        expect(v).not.toBeNull();
        expect(v!.tier).toBe("high");
        expect(v!.score).toBe(82);
        // The empty-label / malformed factor is dropped; the non-string flag filtered.
        expect(v!.factors).toHaveLength(1);
        expect(v!.reviewFlags).toEqual(["review LLM merge"]);
    });

    it("returns null for a non-trust shape", () => {
        expect(projectTrust(null)).toBeNull();
        expect(projectTrust({ nope: 1 })).toBeNull();
        expect(projectTrust({ tier: "high" })).toBeNull(); // missing score
    });
});

describe("formatTrustBadge", () => {
    const base = (tier: TrustView["tier"], score: number, flags: string[] = []): TrustView => ({
        score, tier, factors: [], reviewFlags: flags, summary: "",
    });

    it("tones ONLY a low-trust merge crimson; high/medium stay quiet", () => {
        expect(formatTrustBadge(base("high", 90)).tone).toBe("quiet");
        expect(formatTrustBadge(base("medium", 60)).tone).toBe("quiet");
        expect(formatTrustBadge(base("low", 20)).tone).toBe("crimson");
    });

    it("labels the score + tier and flags reviewable items", () => {
        const b = formatTrustBadge(base("medium", 61, ["review LLM merge"]));
        expect(b.label).toBe("Trust 61/100 · medium");
        expect(b.hasFlags).toBe(true);
        expect(formatTrustBadge(base("high", 90)).hasFlags).toBe(false);
    });
});

describe("fetchConvergenceTrust", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("fetches + projects the trust for a workspace", async () => {
        const fetchMock = vi.fn().mockResolvedValue(ok({ trust: { score: 77, tier: "medium", factors: [], reviewFlags: [], summary: "ok" } }));
        vi.stubGlobal("fetch", fetchMock);
        const v = await fetchConvergenceTrust("ws-1");
        expect(fetchMock).toHaveBeenCalledWith(TrustUrl);
        expect(v).toMatchObject({ score: 77, tier: "medium" });
    });

    it("returns null on a 404 (unmerged / no evidence)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
        expect(await fetchConvergenceTrust("ws-1")).toBeNull();
    });

    it("returns null on a transport fault and on an empty id", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        expect(await fetchConvergenceTrust("ws-1")).toBeNull();
        expect(await fetchConvergenceTrust("  ")).toBeNull();
    });
});
