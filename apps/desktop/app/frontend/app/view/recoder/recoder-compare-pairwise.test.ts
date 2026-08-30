// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    fetchPairwiseDiff,
    pairwiseLineKind,
    parsePairwiseView,
    type PairwiseFileRow,
} from "./recoder-compare-pairwise";

const patch = [
    "diff --git a/wt-a/shared.ts b/wt-b/shared.ts",
    "index 1111111..2222222 100644",
    "--- a/wt-a/shared.ts",
    "+++ b/wt-b/shared.ts",
    "@@ -1 +1 @@",
    "-shared-by-a",
    "+shared-by-b",
    "",
].join("\n");

function payload(overrides?: Record<string, unknown>) {
    return {
        a: "ws-a",
        b: "ws-b",
        capped: false,
        files: [
            { path: "shared.ts", available: true, binary: false, patch },
            { path: "same.ts", available: true, binary: false, patch: "" },
            { path: "blob.bin", available: true, binary: true, patch: null },
            { path: "gone.ts", available: false, binary: false, patch: null, reason: "no worktree for ws-b" },
        ],
        ...overrides,
    };
}

describe("parsePairwiseView — lenient projection of the backend payload", () => {
    it("projects per-file rows: patch lines, identical, binary, unavailable", () => {
        const view = parsePairwiseView(payload());
        expect(view).not.toBeNull();
        expect(view.a).toBe("ws-a");
        expect(view.b).toBe("ws-b");
        expect(view.capped).toBe(false);
        expect(view.files.map((f: PairwiseFileRow) => f.path)).toEqual(["shared.ts", "same.ts", "blob.bin", "gone.ts"]);

        const shared = view.files[0];
        expect(shared.available).toBe(true);
        expect(shared.binary).toBe(false);
        expect(shared.lines).toContain("-shared-by-a");
        expect(shared.lines).toContain("+shared-by-b");
        expect(shared.lines[shared.lines.length - 1]).not.toBe("");
        expect(shared.unavailableReason).toBe("");

        const same = view.files[1];
        expect(same.available).toBe(true);
        expect(same.lines).toEqual([]);

        const bin = view.files[2];
        expect(bin.binary).toBe(true);
        expect(bin.lines).toEqual([]);

        const gone = view.files[3];
        expect(gone.available).toBe(false);
        expect(gone.lines).toEqual([]);
        expect(gone.unavailableReason).toBe("no worktree for ws-b");
    });

    it("carries a truthful capped flag", () => {
        expect(parsePairwiseView(payload({ capped: true })).capped).toBe(true);
    });

    it("rejects unrecognized shapes (null) and skips entries without a path", () => {
        expect(parsePairwiseView(null)).toBeNull();
        expect(parsePairwiseView("nope")).toBeNull();
        expect(parsePairwiseView({ a: "x" })).toBeNull();
        expect(parsePairwiseView({ a: "x", b: "y", files: "not-an-array" })).toBeNull();
        const view = parsePairwiseView(payload({ files: [{ available: true }, { path: "ok.ts" }] }));
        expect(view.files.map((f: PairwiseFileRow) => f.path)).toEqual(["ok.ts"]);
    });
});

describe("pairwiseLineKind — headers before generic +/- so they stay neutral", () => {
    it("classifies add/del/hunk/meta/ctx", () => {
        expect(pairwiseLineKind("+shared-by-b")).toBe("add");
        expect(pairwiseLineKind("-shared-by-a")).toBe("del");
        expect(pairwiseLineKind("@@ -1 +1 @@")).toBe("hunk");
        expect(pairwiseLineKind("+++ b/wt-b/shared.ts")).toBe("meta");
        expect(pairwiseLineKind("--- a/wt-a/shared.ts")).toBe("meta");
        expect(pairwiseLineKind("diff --git a/x b/y")).toBe("meta");
        expect(pairwiseLineKind("index 1111111..2222222 100644")).toBe("meta");
        expect(pairwiseLineKind(" context")).toBe("ctx");
    });
});

type StubResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function stubFetch(response: StubResponse, seen?: { url?: string }): typeof fetch {
    return (async (url: unknown) => {
        if (seen != null) {
            seen.url = String(url);
        }
        return response;
    }) as unknown as typeof fetch;
}

describe("fetchPairwiseDiff — envelope unwrap + truthful degrade", () => {
    it("unwraps the { data: { pairwise } } envelope and hits the pairwise edge", async () => {
        const seen: { url?: string } = {};
        const result = await fetchPairwiseDiff(
            "grp 1",
            "ws-a",
            "ws-b",
            undefined,
            stubFetch({ ok: true, status: 200, json: async () => ({ success: true, data: { pairwise: payload() } }) }, seen)
        );
        expect(result.ok).toBe(true);
        expect(result.view.files).toHaveLength(4);
        expect(seen.url).toContain("/api/conductor/workspaces/compare/grp%201/pairwise?a=ws-a&b=ws-b");
    });

    it("routes a synthetic ad-hoc group to the explicit-id pairwise edge", async () => {
        const seen: { url?: string } = {};
        const result = await fetchPairwiseDiff(
            "adhoc:ws-a+ws-b",
            "ws-a",
            "ws-b",
            ["shared.ts"],
            stubFetch({ ok: true, status: 200, json: async () => ({ data: { pairwise: payload() } }) }, seen)
        );
        expect(result.ok).toBe(true);
        expect(seen.url).toContain("/api/conductor/workspaces/compare/ad-hoc/pairwise?ids=ws-a%2Cws-b");
        expect(seen.url).toContain("&a=ws-a&b=ws-b&paths=shared.ts");
    });

    it("passes an explicit paths list as a comma query", async () => {
        const seen: { url?: string } = {};
        await fetchPairwiseDiff(
            "grp",
            "ws-a",
            "ws-b",
            ["x.ts", "y.ts"],
            stubFetch({ ok: true, status: 200, json: async () => ({ data: { pairwise: payload() } }) }, seen)
        );
        expect(seen.url).toContain("&paths=x.ts%2Cy.ts");
    });

    it("surfaces the backend's verbatim error reason on a non-2xx", async () => {
        const result = await fetchPairwiseDiff(
            "grp",
            "ws-a",
            "ws-b",
            undefined,
            stubFetch({
                ok: false,
                status: 404,
                json: async () => ({ error: { code: "NOT_FOUND", message: "workspace not found" } }),
            })
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain("workspace not found");
    });

    it("degrades truthfully on an unrecognized 2xx body and on an unreachable backend", async () => {
        const weird = await fetchPairwiseDiff(
            "grp",
            "ws-a",
            "ws-b",
            undefined,
            stubFetch({ ok: true, status: 200, json: async () => ({ data: { pairwise: "garbage" } }) })
        );
        expect(weird.ok).toBe(false);

        const down = await fetchPairwiseDiff("grp", "ws-a", "ws-b", undefined, (async () => {
            throw new Error("ECONNREFUSED");
        }) as unknown as typeof fetch);
        expect(down.ok).toBe(false);
        expect(down.error).toContain("reachable");
    });

    it("rejects blank inputs before any fetch", async () => {
        const result = await fetchPairwiseDiff("", "ws-a", "ws-b", undefined, (async () => {
            throw new Error("must not be called");
        }) as unknown as typeof fetch);
        expect(result.ok).toBe(false);
    });
});
