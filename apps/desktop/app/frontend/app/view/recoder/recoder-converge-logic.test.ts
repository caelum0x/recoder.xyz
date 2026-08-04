// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SiblingCompareEntry } from "./recoder-board-logic";
import {
    ASSISTED_VALUE,
    assistedFilePaths,
    assistedOption,
    autoResolvableCount,
    autoResolveSynthesizable,
    composeConvergence,
    composeStatusFallback,
    deriveCompareColumns,
    fetchConvergePlan,
    headerPairSlot,
    parseConvergePlan,
    presentConflictRegions,
    SYNTHESIZE_VALUE,
    toggleSelection,
} from "./recoder-converge-logic";

let siblingSeq = 0;

function makeSibling(overrides: Partial<SiblingCompareEntry> = {}): SiblingCompareEntry {
    siblingSeq += 1;
    return {
        workspaceId: `ws-${siblingSeq}`,
        agent: "claude_code",
        runtimeId: "claude_code",
        branch: `agent/branch-${siblingSeq}`,
        state: "awaiting_review",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        ...overrides,
    };
}

function mockFetchOnce(bodyObj: unknown, status = 200): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(bodyObj), { status, headers: { "Content-Type": "application/json" } })
    );
}

describe("toggleSelection — immutable per-path winner pick", () => {
    it("sets a winner without mutating the input", () => {
        const base = { "a.ts": "ws1" };
        const next = toggleSelection(base, "b.ts", "ws2");
        expect(next).toEqual({ "a.ts": "ws1", "b.ts": "ws2" });
        expect(base).toEqual({ "a.ts": "ws1" });
    });

    it("re-picking the current winner clears the path back to unresolved", () => {
        const base = { "a.ts": "ws1" };
        const next = toggleSelection(base, "a.ts", "ws1");
        expect(next).toEqual({});
        expect(base).toEqual({ "a.ts": "ws1" });
    });

    it("picking a different sibling moves the win", () => {
        expect(toggleSelection({ "a.ts": "ws1" }, "a.ts", "ws2")).toEqual({ "a.ts": "ws2" });
    });

    it("handles the @synthesize sentinel like any other value", () => {
        const picked = toggleSelection({ "a.ts": "ws1" }, "a.ts", SYNTHESIZE_VALUE);
        expect(picked).toEqual({ "a.ts": "@synthesize" });
        expect(toggleSelection(picked, "a.ts", SYNTHESIZE_VALUE)).toEqual({});
        expect(toggleSelection(picked, "a.ts", "ws2")).toEqual({ "a.ts": "ws2" });
    });

    it("models the @assisted sentinel like any other selection value", () => {
        expect(ASSISTED_VALUE).toBe("@assisted");
        const picked = toggleSelection({ "a.ts": "ws1" }, "a.ts", ASSISTED_VALUE);
        expect(picked).toEqual({ "a.ts": "@assisted" });
        // re-picking @assisted clears the path back to unresolved
        expect(toggleSelection(picked, "a.ts", ASSISTED_VALUE)).toEqual({});
        // switching from @assisted to @synthesize (or a whole-file winner) just moves it
        expect(toggleSelection(picked, "a.ts", SYNTHESIZE_VALUE)).toEqual({ "a.ts": "@synthesize" });
        expect(toggleSelection(picked, "a.ts", "ws2")).toEqual({ "a.ts": "ws2" });
    });
});

describe("assistedOption — offer AI-assist wherever a synthesize was attempted", () => {
    it("does not offer AI-assist for an un-probed path (no synthesize attempted)", () => {
        expect(assistedOption(null)).toEqual({ offer: false, note: "" });
    });

    it("offers AI-assist for a non-synthesizable overlap with no 'suffices' note (it is the escalation)", () => {
        expect(assistedOption({ synthesizable: false })).toEqual({ offer: true, note: "" });
    });

    it("still offers AI-assist for a trivially-mergeable path but notes Synthesize suffices", () => {
        const opt = assistedOption({ synthesizable: true });
        expect(opt.offer).toBe(true);
        expect(opt.note).toContain("merges this cleanly");
    });
});

// The winner-picker now lives in ONE place — the ConvergePanel decision row. Its
// picks flow through the same `toggleSelection` into the single shared selection
// map that drives the plan/compose. These assertions pin that one-source-of-truth
// contract (there is no second contested strip building a parallel map).
describe("single converge decision surface — one shared selection map", () => {
    it("builds the per-file Record<path, workspaceId> from successive decision-row picks", () => {
        let sel = {};
        sel = toggleSelection(sel, "src/a.ts", "ws1");
        sel = toggleSelection(sel, "src/b.ts", "ws2");
        expect(sel).toEqual({ "src/a.ts": "ws1", "src/b.ts": "ws2" });
    });

    it("picking another sibling moves the win; re-picking the winner clears it", () => {
        let sel = toggleSelection({}, "src/a.ts", "ws1");
        sel = toggleSelection(sel, "src/a.ts", "ws2");
        expect(sel).toEqual({ "src/a.ts": "ws2" });
        sel = toggleSelection(sel, "src/a.ts", "ws2");
        expect(sel).toEqual({});
    });

    it("whole-file winner picks and @synthesize coexist in the one map", () => {
        let sel = toggleSelection({}, "src/a.ts", "ws1");
        sel = toggleSelection(sel, "src/b.ts", SYNTHESIZE_VALUE);
        expect(sel).toEqual({ "src/a.ts": "ws1", "src/b.ts": "@synthesize" });
        // auto-resolve fills only unresolved paths — it never overrides an explicit pick
        const next = autoResolveSynthesizable(sel, {
            "src/a.ts": { synthesizable: true },
            "src/c.ts": { synthesizable: true },
        });
        expect(next).toEqual({ "src/a.ts": "ws1", "src/b.ts": "@synthesize", "src/c.ts": "@synthesize" });
    });

    it("the exact shared selection is what converge reads — same map, one request", async () => {
        let sel = toggleSelection({}, "src/a.ts", "ws1");
        sel = toggleSelection(sel, "src/b.ts", ASSISTED_VALUE);
        mockFetchOnce({ data: { plan: { complete: true, files: ["src/a.ts", "src/b.ts"] } } });
        await fetchConvergePlan("tg-1", sel);
        const calls = vi.mocked(globalThis.fetch).mock.calls;
        const url = (calls.at(-1)?.[0] as string) ?? "";
        // The selection map is round-tripped verbatim into the plan request, proving
        // the converge step consumes the SAME picks the decision row edited.
        expect(decodeURIComponent(url)).toContain(JSON.stringify(sel));
    });
});

describe("deriveCompareColumns — N-up column data from the compare feed", () => {
    it("derives one column per sibling in feed order with stat and files", () => {
        const columns = deriveCompareColumns([
            makeSibling({
                workspaceId: "ws1",
                agent: "claude_code",
                state: "awaiting_review",
                diffStat: { additions: 10, deletions: 2, files: 3 },
                changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
            }),
            makeSibling({
                workspaceId: "ws2",
                agent: "codex",
                state: "running",
                diffStat: { additions: 4, deletions: 1, files: 1 },
                changedFiles: ["src/a.ts"],
            }),
        ]);
        expect(columns).toEqual([
            {
                workspaceId: "ws1",
                agent: "claude_code",
                state: "awaiting_review",
                stat: { additions: 10, deletions: 2, files: 3 },
                statReason: "",
                files: ["src/a.ts", "src/b.ts", "src/c.ts"],
                filesReason: "",
            },
            {
                workspaceId: "ws2",
                agent: "codex",
                state: "running",
                stat: { additions: 4, deletions: 1, files: 1 },
                statReason: "",
                files: ["src/a.ts"],
                filesReason: "",
            },
        ]);
    });

    it("drops stat and carries the sibling's own reason when diffStat is absent (never a fabricated 0)", () => {
        const [column] = deriveCompareColumns([
            makeSibling({ diffStatReason: "worktree missing", changedFilesReason: "worktree missing" }),
        ]);
        expect(column.stat).toBeUndefined();
        expect(column.statReason).toBe("worktree missing");
        expect(column.files).toEqual([]);
        expect(column.filesReason).toBe("worktree missing");
    });

    it("falls back to generic reasons when the sibling carried none", () => {
        const [column] = deriveCompareColumns([makeSibling({})]);
        expect(column.statReason).toBe("diff unavailable");
        expect(column.filesReason).toBe("changed-file list unavailable");
    });

    it("keeps a genuine 'no changed files' ([] with empty reason) distinct from an unavailable list", () => {
        const [column] = deriveCompareColumns([
            makeSibling({ diffStat: { additions: 0, deletions: 0, files: 0 }, changedFiles: [] }),
        ]);
        expect(column.files).toEqual([]);
        expect(column.filesReason).toBe("");
    });

    it("degrades a non-array input to no columns", () => {
        expect(deriveCompareColumns(undefined as unknown as SiblingCompareEntry[])).toEqual([]);
    });
});

describe("headerPairSlot — two header clicks assemble the A/B pairwise picks", () => {
    it("fills A first, then B", () => {
        expect(headerPairSlot("", "", "ws1")).toBe("A");
        expect(headerPairSlot("ws1", "", "ws2")).toBe("B");
    });

    it("re-targets the slot a column already holds so pickPair toggles it off", () => {
        expect(headerPairSlot("ws1", "ws2", "ws1")).toBe("A");
        expect(headerPairSlot("ws1", "ws2", "ws2")).toBe("B");
    });

    it("with both slots held, a third column replaces B and keeps A anchored", () => {
        expect(headerPairSlot("ws1", "ws2", "ws3")).toBe("B");
    });

    it("fills A when only B is held", () => {
        expect(headerPairSlot("", "ws2", "ws1")).toBe("A");
    });
});

describe("autoResolveSynthesizable — one-click, never fabricates a conflict resolution", () => {
    const synthMap = {
        "clean1.ts": { synthesizable: true },
        "clean2.ts": { synthesizable: true },
        "conflict.ts": { synthesizable: false },
    };

    it("sets @synthesize only for cleanly-mergeable, still-unresolved paths", () => {
        const next = autoResolveSynthesizable({}, synthMap);
        expect(next).toEqual({ "clean1.ts": "@synthesize", "clean2.ts": "@synthesize" });
        // the genuinely-conflicting path is never auto-resolved
        expect(next["conflict.ts"]).toBeUndefined();
    });

    it("leaves the user's explicit picks/synths untouched and never mutates input", () => {
        const base = { "clean1.ts": "ws1" };
        const next = autoResolveSynthesizable(base, synthMap);
        expect(next["clean1.ts"]).toBe("ws1"); // kept the manual pick
        expect(next["clean2.ts"]).toBe("@synthesize");
        expect(base).toEqual({ "clean1.ts": "ws1" });
    });

    it("autoResolvableCount reports only the newly-resolvable clean paths", () => {
        expect(autoResolvableCount({}, synthMap)).toBe(2);
        expect(autoResolvableCount({ "clean1.ts": "ws1" }, synthMap)).toBe(1);
        expect(autoResolvableCount({ "clean1.ts": "ws1", "clean2.ts": SYNTHESIZE_VALUE }, synthMap)).toBe(0);
    });
});

describe("parseConvergePlan — truthful projection, never fabricated", () => {
    it("reads a complete plan with array files, map sources, and object unresolved", () => {
        const plan = parseConvergePlan({
            complete: true,
            files: [{ path: "a.ts" }, { path: "b.ts" }, { path: "c.ts" }],
            unresolved: [],
            sources: { ws1: 2, ws2: 1 },
            changedFiles: ["a.ts", "b.ts", "c.ts"],
            siblingCount: 2,
        });
        expect(plan.complete).toBe(true);
        expect(plan.winners).toBe(3);
        expect(plan.unresolved).toEqual([]);
        expect(plan.sources).toEqual([
            { workspaceId: "ws1", count: 2 },
            { workspaceId: "ws2", count: 1 },
        ]);
        expect(plan.changedFiles).toEqual(["a.ts", "b.ts", "c.ts"]);
        expect(plan.siblingCount).toBe(2);
    });

    it("counts a path→winner map form of files and normalizes unresolved strings + reasons", () => {
        const plan = parseConvergePlan({
            complete: false,
            files: { "a.ts": "ws1", "b.ts": "ws2" },
            unresolved: ["x.ts", { path: "y.ts", reason: "both edited the same hunk" }],
            sources: [{ workspaceId: "ws1", count: 1 }],
        });
        expect(plan.winners).toBe(2);
        expect(plan.unresolved).toEqual([
            { path: "x.ts", reason: "" },
            { path: "y.ts", reason: "both edited the same hunk" },
        ]);
        expect(plan.sources).toEqual([{ workspaceId: "ws1", count: 1 }]);
    });

    it("degrades a missing/garbage body to a neutral, never-complete plan", () => {
        const plan = parseConvergePlan({});
        expect(plan).toEqual({
            complete: false,
            winners: 0,
            unresolved: [],
            sources: [],
            changedFiles: [],
            siblingCount: 0,
        });
        // a stray truthy-but-non-bool complete is not coerced into a pass
        expect(parseConvergePlan({ complete: "yes" }).complete).toBe(false);
    });

    it("omits `contested` when the plan was not probed (no synthesizability faked)", () => {
        expect(parseConvergePlan({ complete: false, files: [] }).contested).toBeUndefined();
        // probed-but-none stays an explicit empty array, distinct from unprobed.
        expect(parseConvergePlan({ contested: [] }).contested).toEqual([]);
    });

    it("reads a probed plan's contested[]: path, sorted workspaceIds, synthesizable, reason", () => {
        const plan = parseConvergePlan({
            complete: false,
            files: [],
            contested: [
                { path: "a.ts", workspaceIds: ["ws1", "ws2"], synthesizable: true },
                { path: "b.ts", workspaceIds: ["ws1", "ws3"], synthesizable: false, reason: "overlap" },
                { path: "", workspaceIds: ["ws9"], synthesizable: true },
            ],
        });
        expect(plan.contested).toEqual([
            { path: "a.ts", workspaceIds: ["ws1", "ws2"], synthesizable: true },
            { path: "b.ts", workspaceIds: ["ws1", "ws3"], synthesizable: false, reason: "overlap" },
        ]);
    });

    it("reads a contested entry's conflict regions (WHERE the agents collided)", () => {
        const plan = parseConvergePlan({
            contested: [
                {
                    path: "b.ts",
                    workspaceIds: ["ws1", "ws2"],
                    synthesizable: false,
                    reason: "overlap",
                    regions: [
                        { startLine: 3, endLine: 7, ours: ["l3-A"], theirs: ["l3-B"], truncated: false },
                        { startLine: 12, endLine: 27, ours: ["x"], theirs: ["y", "z"], truncated: true },
                    ],
                },
            ],
        });
        expect(plan.contested[0].regions).toEqual([
            { startLine: 3, endLine: 7, ours: ["l3-A"], theirs: ["l3-B"], truncated: false },
            { startLine: 12, endLine: 27, ours: ["x"], theirs: ["y", "z"], truncated: true },
        ]);
    });

    it("drops garbage regions and omits `regions` when none survive (never fabricated)", () => {
        const plan = parseConvergePlan({
            contested: [
                {
                    path: "b.ts",
                    workspaceIds: ["ws1", "ws2"],
                    synthesizable: false,
                    reason: "overlap",
                    regions: [
                        "not-a-region",
                        { startLine: 0, endLine: 5, ours: [], theirs: [] },
                        { startLine: "3", endLine: 7, ours: ["x"], theirs: ["y"] },
                    ],
                },
                { path: "c.ts", workspaceIds: ["ws1", "ws2"], synthesizable: false, reason: "overlap" },
            ],
        });
        expect(plan.contested[0].regions).toBeUndefined();
        expect(plan.contested[1].regions).toBeUndefined();
    });

    it("omits `assisted` on a plain (un-composed) plan so a model claim is never faked", () => {
        expect(parseConvergePlan({ complete: true, files: [] }).assisted).toBeUndefined();
        // present-but-empty stays an explicit [] (a fully-mechanical compose)
        expect(parseConvergePlan({ assisted: [] }).assisted).toEqual([]);
    });

    it("reads a composed plan's assisted[] (path + inference_id), dropping pathless entries", () => {
        const plan = parseConvergePlan({
            complete: true,
            files: [{ path: "a.ts" }, { path: "b.ts" }],
            assisted: [
                { path: "b.ts", inference_id: "inf_123" },
                { path: "a.ts" },
                { path: "" },
                { workspaceId: "ws9" },
            ],
        });
        expect(plan.assisted).toEqual([
            { path: "b.ts", inferenceId: "inf_123" },
            { path: "a.ts", inferenceId: "" },
        ]);
    });

    it("tolerates a bare-string assisted entry and a camelCase inferenceId", () => {
        const plan = parseConvergePlan({ assisted: ["x.ts", { path: "y.ts", inferenceId: "inf_9" }] });
        expect(plan.assisted).toEqual([
            { path: "x.ts", inferenceId: "" },
            { path: "y.ts", inferenceId: "inf_9" },
        ]);
    });
});

describe("assistedFilePaths — the AI-written review-chip decision", () => {
    it("returns [] when the plan carried no model files (chip hidden)", () => {
        expect(assistedFilePaths(parseConvergePlan({ complete: true, files: [] }))).toEqual([]);
        expect(assistedFilePaths(parseConvergePlan({ assisted: [] }))).toEqual([]);
    });

    it("lists the AI-written paths so the panel can flag them for close review", () => {
        const plan = parseConvergePlan({
            assisted: [
                { path: "src/a.ts", inference_id: "inf_1" },
                { path: "src/b.ts" },
            ],
        });
        expect(assistedFilePaths(plan)).toEqual(["src/a.ts", "src/b.ts"]);
    });
});

describe("presentConflictRegions — truthful collision rows, never an invented location", () => {
    it("maps regions to rows with a line-range label, side texts, and truncation flag", () => {
        const view = presentConflictRegions({
            reason: "overlap",
            regions: [
                { startLine: 12, endLine: 27, ours: ["a1", "a2"], theirs: ["b1"], truncated: false },
                { startLine: 40, endLine: 44, ours: ["x"], theirs: ["y"], truncated: true },
            ],
        });
        expect(view.fallback).toBe("");
        expect(view.rows).toEqual([
            { label: "L12–L27", ours: ["a1", "a2"], theirs: ["b1"], truncated: false },
            { label: "L40–L44", ours: ["x"], theirs: ["y"], truncated: true },
        ]);
    });

    it("collapses a same-line region to a single-line label", () => {
        const view = presentConflictRegions({
            reason: "overlap",
            regions: [{ startLine: 5, endLine: 5, ours: [], theirs: [], truncated: false }],
        });
        expect(view.rows[0].label).toBe("L5");
    });

    it("falls back truthfully for an 'overlap' probe with no regions (older backend)", () => {
        expect(presentConflictRegions({ reason: "overlap" })).toEqual({
            rows: [],
            fallback: "conflict location unavailable",
        });
        expect(presentConflictRegions({ reason: "overlap", regions: [] }).fallback).toBe(
            "conflict location unavailable"
        );
    });

    it("shows nothing for non-overlap reasons or a synthesizable probe (no regions exist)", () => {
        expect(presentConflictRegions({ reason: "delete-modify" })).toEqual({ rows: [], fallback: "" });
        expect(presentConflictRegions({ reason: "unreadable" })).toEqual({ rows: [], fallback: "" });
        expect(presentConflictRegions({})).toEqual({ rows: [], fallback: "" });
    });
});

describe("envelope unwrapping — must read the backend's nested payload keys", () => {
    afterEach(() => vi.restoreAllMocks());

    it("fetchConvergePlan unwraps { data: { plan } } (not one level too shallow)", async () => {
        mockFetchOnce({
            success: true,
            data: {
                plan: {
                    complete: true,
                    files: [{ path: "a.ts" }, { path: "b.ts" }],
                    unresolved: [],
                    sources: { ws1: 2 },
                    changedFiles: ["a.ts", "b.ts"],
                    siblingCount: 2,
                },
            },
        });
        const result = await fetchConvergePlan("grp1", { "a.ts": "ws1" });
        expect(result.ok).toBe(true);
        // Would be complete:false / winners:0 if the `.plan` sub-key were not unwrapped.
        expect(result.ok && result.plan.complete).toBe(true);
        expect(result.ok && result.plan.winners).toBe(2);
    });

    it("composeConvergence unwraps { data: { convergence: { workspaceId } } }", async () => {
        mockFetchOnce({
            success: true,
            data: { convergence: { workspaceId: "ws_composed", branch: "recoder/converge-abc" } },
        });
        const result = await composeConvergence("grp1", { "a.ts": "ws1" });
        expect(result.ok).toBe(true);
        expect(result.ok && result.workspaceId).toBe("ws_composed");
        expect(result.ok && result.branch).toBe("recoder/converge-abc");
    });

    it("composeConvergence treats a 2xx without a workspace id as a failure (never fabricates)", async () => {
        mockFetchOnce({ success: true, data: { convergence: {} } });
        const result = await composeConvergence("grp1", { "a.ts": "ws1" });
        expect(result.ok).toBe(false);
    });

    it("composeConvergence surfaces the composed plan.assisted[] paths (AI-written files)", async () => {
        mockFetchOnce({
            success: true,
            data: {
                convergence: {
                    workspaceId: "ws_composed",
                    branch: "recoder/converge-abc",
                    plan: {
                        complete: true,
                        files: [{ path: "a.ts" }, { path: "b.ts" }],
                        assisted: [
                            { path: "b.ts", inference_id: "inf_42" },
                            { path: "a.ts" },
                        ],
                    },
                },
            },
        });
        const result = await composeConvergence("grp1", { "a.ts": ASSISTED_VALUE, "b.ts": ASSISTED_VALUE });
        expect(result.ok).toBe(true);
        expect(result.ok && result.assisted).toEqual(["b.ts", "a.ts"]);
    });

    it("composeConvergence returns [] assisted for a fully-mechanical compose (never fabricated)", async () => {
        mockFetchOnce({
            success: true,
            data: { convergence: { workspaceId: "ws_composed", branch: "b", plan: { complete: true, files: [] } } },
        });
        const result = await composeConvergence("grp1", { "a.ts": SYNTHESIZE_VALUE });
        expect(result.ok && result.assisted).toEqual([]);
    });

    it("degrades truthfully when assisted resolution fails server-side (inference down ⇒ 400 unresolved)", async () => {
        mockFetchOnce(
            {
                success: false,
                error: "convergence plan has 1 unresolved contested path(s): src/shared.ts",
            },
            400
        );
        const result = await composeConvergence("grp1", { "src/shared.ts": ASSISTED_VALUE });
        expect(result.ok).toBe(false);
        // the panel shows the file stayed contested — the backend's verbatim reason, never a fake success
        expect(result.error).toContain("src/shared.ts");
        expect(result.error).toContain("unresolved");
    });

    it("a probed fetch requests ?probe=1 and surfaces plan.contested[]", async () => {
        const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        plan: {
                            complete: false,
                            files: [],
                            unresolved: [{ path: "b.ts", reason: "pick a winner" }],
                            contested: [
                                { path: "a.ts", workspaceIds: ["ws1", "ws2"], synthesizable: true },
                                { path: "b.ts", workspaceIds: ["ws1", "ws2"], synthesizable: false, reason: "overlap" },
                            ],
                        },
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        );
        const result = await fetchConvergePlan("grp1", {}, true);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(String(spy.mock.calls[0][0])).toContain("probe=1");
        expect(result.ok && result.plan.contested).toEqual([
            { path: "a.ts", workspaceIds: ["ws1", "ws2"], synthesizable: true },
            { path: "b.ts", workspaceIds: ["ws1", "ws2"], synthesizable: false, reason: "overlap" },
        ]);
    });

    it("an unprobed fetch omits probe=1 and leaves plan.contested undefined", async () => {
        const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ success: true, data: { plan: { complete: true, files: [] } } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        const result = await fetchConvergePlan("grp1", { "a.ts": "ws1" });
        expect(String(spy.mock.calls[0][0])).not.toContain("probe=1");
        expect(result.ok && result.plan.contested).toBeUndefined();
    });
});

describe("composeStatusFallback — status-scoped truthful lines", () => {
    it("maps the documented error statuses", () => {
        expect(composeStatusFallback(400)).toContain("incomplete or invalid");
        expect(composeStatusFallback(403)).toContain("governance");
        expect(composeStatusFallback(503)).toContain("degraded");
        expect(composeStatusFallback(500)).toBe("Converge failed (HTTP 500).");
    });
});
