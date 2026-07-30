// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { computeDiffLineAnchors, parseHunkNewStart, stripDiffPathPrefix } from "./recoder-diff-comments";

describe("stripDiffPathPrefix", () => {
    it("strips a/ and b/ prefixes and maps /dev/null to empty", () => {
        expect(stripDiffPathPrefix("b/src/a.ts")).toBe("src/a.ts");
        expect(stripDiffPathPrefix("a/src/a.ts")).toBe("src/a.ts");
        expect(stripDiffPathPrefix(" b/src/a.ts ")).toBe("src/a.ts");
        expect(stripDiffPathPrefix("/dev/null")).toBe("");
        expect(stripDiffPathPrefix("plain/path.ts")).toBe("plain/path.ts");
    });
});

describe("parseHunkNewStart", () => {
    it("reads the new-file start from a hunk header", () => {
        expect(parseHunkNewStart("@@ -1,4 +1,6 @@")).toBe(1);
        expect(parseHunkNewStart("@@ -10,0 +11,3 @@ func foo()")).toBe(11);
        expect(parseHunkNewStart("@@ -0,0 +1 @@")).toBe(1);
    });
    it("returns null for a malformed header (no wrong guess)", () => {
        expect(parseHunkNewStart("@@ garbage @@")).toBe(null);
        expect(parseHunkNewStart("not a hunk")).toBe(null);
    });
});

describe("computeDiffLineAnchors", () => {
    const patch = [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 111..222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,3 +1,4 @@",
        " context one",
        "-removed line",
        "+added line",
        " context two",
    ].join("\n");

    it("returns one anchor per rendered line, indexed identically to patch.split", () => {
        const anchors = computeDiffLineAnchors(patch);
        expect(anchors).toHaveLength(patch.split("\n").length);
    });

    it("anchors added and context lines to their real new-file line number", () => {
        const lines = patch.split("\n");
        const anchors = computeDiffLineAnchors(patch);
        const at = (text: string) => anchors[lines.indexOf(text)];
        expect(at(" context one")).toEqual({ file: "src/a.ts", newLine: 1 });
        expect(at("+added line")).toEqual({ file: "src/a.ts", newLine: 2 });
        expect(at(" context two")).toEqual({ file: "src/a.ts", newLine: 3 });
    });

    it("never anchors deletions, hunk headers, or file/meta headers", () => {
        const lines = patch.split("\n");
        const anchors = computeDiffLineAnchors(patch);
        const at = (text: string) => anchors[lines.indexOf(text)];
        expect(at("-removed line").newLine).toBe(null);
        expect(at("@@ -1,3 +1,4 @@").newLine).toBe(null);
        expect(at("+++ b/src/a.ts").newLine).toBe(null);
        expect(at("diff --git a/src/a.ts b/src/a.ts").newLine).toBe(null);
    });

    it("tracks the current file across multiple file sections", () => {
        const multi = [
            "diff --git a/one.ts b/one.ts",
            "+++ b/one.ts",
            "@@ -1 +1,2 @@",
            "+first",
            "diff --git a/two.ts b/two.ts",
            "+++ b/two.ts",
            "@@ -5,0 +6,1 @@",
            "+second",
        ].join("\n");
        const lines = multi.split("\n");
        const anchors = computeDiffLineAnchors(multi);
        expect(anchors[lines.indexOf("+first")]).toEqual({ file: "one.ts", newLine: 1 });
        expect(anchors[lines.indexOf("+second")]).toEqual({ file: "two.ts", newLine: 6 });
    });

    it("leaves lines before any file header unanchored (file empty)", () => {
        const anchors = computeDiffLineAnchors("random preamble\nmore preamble");
        expect(anchors).toEqual([
            { file: "", newLine: null },
            { file: "", newLine: null },
        ]);
    });
});
