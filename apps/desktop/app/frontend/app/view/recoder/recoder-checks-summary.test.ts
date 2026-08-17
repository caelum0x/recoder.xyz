// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { summarizeChecks, buildChecksTable } from "./recoder-checks-summary";
import type { ReadinessView, MergeabilityView } from "./recoder-board-logic";

function readiness(over: Partial<ReadinessView>): ReadinessView {
    return { verdict: "ready", signals: [], blockers: [], advisories: [], ...over } as ReadinessView;
}
function mergeability(over: Partial<MergeabilityView>): MergeabilityView {
    return {
        available: true,
        verdict: "clean",
        conflicts: [],
        ahead: 0,
        behind: 0,
        base: "main",
        branch: "b",
        ...over,
    } as MergeabilityView;
}

describe("summarizeChecks", () => {
    it("null when neither view could be probed (never a fabricated status)", () => {
        expect(summarizeChecks(null, null)).toBeNull();
    });

    it("delivered ⇒ merged (quiet)", () => {
        const s = summarizeChecks(readiness({ verdict: "delivered" }), mergeability({}));
        expect(s).toEqual({ headline: "merged", tone: "quiet", detail: "merged — nothing left to check" });
    });

    it("hard blockers ⇒ blocked, counted", () => {
        const s = summarizeChecks(readiness({ verdict: "blocked", blockers: ["src/a.ts", "2 checks failing"] }), null);
        expect(s?.tone).toBe("blocked");
        expect(s?.headline).toBe("blocked — 2 to resolve");
    });

    it("mergeability conflict counts as a blocker even when readiness is absent", () => {
        const s = summarizeChecks(null, mergeability({ verdict: "conflicting", conflicts: ["x.ts"] }));
        expect(s?.tone).toBe("blocked");
        expect(s?.headline).toBe("blocked — 1 to resolve");
    });

    it("open-work advisories ⇒ discouraged, counted", () => {
        const s = summarizeChecks(readiness({ verdict: "not_ready", advisories: ["[ ] handle null", "a.ts: TODO x"] }), mergeability({}));
        expect(s?.tone).toBe("discouraged");
        expect(s?.headline).toBe("discouraged — 2 to review");
    });

    it("a hard blocker wins over advisories", () => {
        const s = summarizeChecks(
            readiness({ verdict: "blocked", blockers: ["src/a.ts"], advisories: ["[ ] later"] }),
            mergeability({}),
        );
        expect(s?.tone).toBe("blocked");
    });

    it("clean ready ⇒ ready to merge", () => {
        const s = summarizeChecks(readiness({ verdict: "ready" }), mergeability({}));
        expect(s).toEqual({ headline: "ready to merge", tone: "ready", detail: "0 blocker(s), 0 to review" });
    });

    it("unknown verdict ⇒ incomplete (never a fabricated ready)", () => {
        const s = summarizeChecks(readiness({ verdict: "unknown" }), null);
        expect(s?.tone).toBe("quiet");
        expect(s?.headline).toBe("checks incomplete");
    });
});

describe("buildChecksTable", () => {
    const siblings = [
        { workspaceId: "ws-a", agent: "claude", branch: "a" },
        { workspaceId: "ws-b", agent: "codex", branch: "b" },
        { workspaceId: "ws-c", agent: "cursor", branch: "c" },
    ];

    it("folds one consolidated row per sibling with itemized blockers/advisories", () => {
        const rows = buildChecksTable(siblings, {
            "ws-a": { readiness: readiness({ verdict: "ready" }), mergeability: mergeability({}) },
            "ws-b": { readiness: readiness({ verdict: "blocked", blockers: ["x.ts"] }) },
            "ws-c": { readiness: readiness({ verdict: "not_ready", advisories: ["[ ] later"] }) },
        });
        expect(rows.map((r) => [r.agent, r.summary?.tone])).toEqual([
            ["claude", "ready"],
            ["codex", "blocked"],
            ["cursor", "discouraged"],
        ]);
        expect(rows[1].blockers).toEqual(["x.ts"]);
        expect(rows[2].advisories).toEqual(["[ ] later"]);
    });

    it("a sibling with no probed views yields a null summary + empty lists (never fabricated)", () => {
        const rows = buildChecksTable([siblings[0]], {});
        expect(rows[0].summary).toBeNull();
        expect(rows[0].blockers).toEqual([]);
        expect(rows[0].advisories).toEqual([]);
    });
});
