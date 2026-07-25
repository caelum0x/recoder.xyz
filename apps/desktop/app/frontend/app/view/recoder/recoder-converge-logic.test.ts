// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    composeConvergence,
    composeStatusFallback,
    fetchConvergePlan,
    parseConvergePlan,
    toggleSelection,
} from "./recoder-converge-logic";

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
});

describe("composeStatusFallback — status-scoped truthful lines", () => {
    it("maps the documented error statuses", () => {
        expect(composeStatusFallback(400)).toContain("incomplete or invalid");
        expect(composeStatusFallback(403)).toContain("governance");
        expect(composeStatusFallback(503)).toContain("degraded");
        expect(composeStatusFallback(500)).toBe("Converge failed (HTTP 500).");
    });
});
